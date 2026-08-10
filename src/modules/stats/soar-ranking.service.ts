import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import type { RankingItem } from './ranking.types';
import { RankingPlaylistService } from './ranking-playlist.service';

/**
 * 综合飙升榜服务
 *
 * 对比最近 7 天与前 7 天的播放增长量，按增长量降序前 50。
 * - 仅一档：综合（单曲 + 歌切混合排序）
 * - 每周一 00:25 计算
 * - 缓存到 SystemSetting（key: soarRankingData）
 * - 同步到"综合-飙升榜"系统歌单
 */
@Injectable()
export class SoarRankingService {
  private readonly logger = new Logger(SoarRankingService.name);
  private static readonly TOP_N = 50;
  private static readonly SETTING_KEY = 'soarRankingData';

  constructor(
    private readonly prisma: PrismaService,
    private readonly rankingPlaylistService: RankingPlaylistService,
  ) {}

  @Cron('25 0 * * 1')
  async scheduledCombined() {
    await this.compute();
  }

  /**
   * 算法：对比最近 7 天（本周）和之前 7 天（上周）的播放次数，
   * 按增长量（本周 - 上周）降序排序，只取增长量 > 0 的项。
   */
  async compute(): Promise<RankingItem[]> {
    this.logger.log('开始计算综合飙升榜...');
    const now = Date.now();
    const weekMs = 7 * 24 * 60 * 60 * 1000;
    const thisWeekStart = new Date(now - weekMs);
    const lastWeekStart = new Date(now - 2 * weekMs);

    const [songThis, songLast, clipThis, clipLast] = await Promise.all([
      this.prisma.playHistory.groupBy({
        by: ['songId'],
        where: { playTime: { gte: thisWeekStart }, songId: { not: null } },
        _count: { _all: true },
      }),
      this.prisma.playHistory.groupBy({
        by: ['songId'],
        where: {
          playTime: { gte: lastWeekStart, lt: thisWeekStart },
          songId: { not: null },
        },
        _count: { _all: true },
      }),
      this.prisma.playHistory.groupBy({
        by: ['clipId'],
        where: { playTime: { gte: thisWeekStart }, clipId: { not: null } },
        _count: { _all: true },
      }),
      this.prisma.playHistory.groupBy({
        by: ['clipId'],
        where: {
          playTime: { gte: lastWeekStart, lt: thisWeekStart },
          clipId: { not: null },
        },
        _count: { _all: true },
      }),
    ]);

    const lastMap = new Map<string, number>([
      ...songLast.map((g) => [g.songId!, g._count._all] as const),
      ...clipLast.map((g) => [g.clipId!, g._count._all] as const),
    ]);

    const merged = [
      ...songThis.map((g) => ({
        kind: 'song' as const,
        id: g.songId!,
        thisCount: g._count._all,
      })),
      ...clipThis.map((g) => ({
        kind: 'clip' as const,
        id: g.clipId!,
        thisCount: g._count._all,
      })),
    ].map((m) => ({
      ...m,
      growth: m.thisCount - (lastMap.get(m.id) ?? 0),
    }));

    const top = merged
      .filter((m) => m.growth > 0)
      .sort((a, b) => b.growth - a.growth)
      .slice(0, SoarRankingService.TOP_N);

    const songIds = top.filter((m) => m.kind === 'song').map((m) => m.id);
    const clipIds = top.filter((m) => m.kind === 'clip').map((m) => m.id);

    const [songs, clips] = await Promise.all([
      songIds.length > 0
        ? this.prisma.song.findMany({
            where: {
              id: { in: songIds },
              deletedAt: null,
              status: 'PUBLISHED',
            },
            include: {
              album: true,
              songArtists: {
                take: 1,
                orderBy: { sort: 'asc' },
                include: { artist: { select: { id: true } } },
              },
            },
          })
        : Promise.resolve([]),
      clipIds.length > 0
        ? this.prisma.liveClip.findMany({
            where: { id: { in: clipIds }, status: 'PUBLISHED' },
            include: {
              session: {
                select: { id: true, title: true, liveTime: true, cover: true },
              },
            },
          })
        : Promise.resolve([]),
    ]);

    const songMap = new Map(songs.map((s) => [s.id, s]));
    const clipMap = new Map(clips.map((c) => [c.id, c]));

    const items = top
      .map((m): RankingItem | null => {
        if (m.kind === 'song') {
          const song = songMap.get(m.id);
          if (!song) return null;
          return {
            id: song.id,
            itemId: song.id,
            trackType: 'song',
            title: song.title,
            artist: song.artist,
            cover: song.coverUrl ?? song.album?.cover ?? null,
            duration: song.duration,
            rank: 0,
            artistId: song.songArtists?.[0]?.artistId ?? null,
            playCount: m.thisCount,
            growth: m.growth,
            fileUrl: song.fileUrl,
          };
        }
        const clip = clipMap.get(m.id);
        if (!clip) return null;
        return {
          id: clip.id,
          itemId: clip.id,
          trackType: 'clip',
          title: clip.title,
          artist: clip.artist,
          cover: clip.coverUrl ?? clip.session?.cover ?? null,
          duration: clip.duration,
          rank: 0,
          sessionId: clip.sessionId,
          sessionName: clip.session?.title ?? '',
          fileUrl: clip.fileUrl,
          playCount: m.thisCount,
          growth: m.growth,
        };
      })
      .filter((x): x is RankingItem => !!x)
      .map((it, idx) => ({ ...it, rank: idx + 1 }));

    const payload = JSON.stringify({
      items,
      computedAt: new Date().toISOString(),
    });
    await this.prisma.systemSetting.upsert({
      where: { key: SoarRankingService.SETTING_KEY },
      update: { value: payload },
      create: { key: SoarRankingService.SETTING_KEY, value: payload },
    });

    this.logger.log(`综合飙升榜计算完成，共 ${items.length} 项`);
    await this.rankingPlaylistService.syncTop50('soar', items);
    return items;
  }

  async getTop(): Promise<RankingItem[]> {
    const cached = await this.readCache();
    if (cached && cached.items.length > 0) {
      return cached.items;
    }
    this.logger.warn('综合飙升榜缓存为空，实时计算...');
    return this.compute();
  }

  private async readCache(): Promise<{
    items: RankingItem[];
    computedAt: string;
  } | null> {
    const row = await this.prisma.systemSetting.findUnique({
      where: { key: SoarRankingService.SETTING_KEY },
    });
    if (!row) return null;
    try {
      return JSON.parse(row.value);
    } catch {
      return null;
    }
  }
}
