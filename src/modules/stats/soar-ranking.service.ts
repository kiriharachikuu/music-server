import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import type { RankingItem, RankingType } from './ranking.types';
import { RankingPlaylistService } from './ranking-playlist.service';

/**
 * 飙升榜服务
 *
 * 对比最近 7 天与前 7 天的播放增长量，按增长量降序前 50。
 * 三档：综合 / 单曲 / 歌切
 * 错峰定时：每周一 00:15 / 00:20 / 00:25
 */
@Injectable()
export class SoarRankingService {
  private readonly logger = new Logger(SoarRankingService.name);
  private static readonly TOP_N = 50;
  private static readonly SETTING_KEY_PREFIX = 'soarRankingData';

  constructor(
    private readonly prisma: PrismaService,
    private readonly rankingPlaylistService: RankingPlaylistService,
  ) {}

  @Cron('15 0 * * 1')
  async scheduledSingle() {
    await this.compute('single');
  }
  @Cron('20 0 * * 1')
  async scheduledClip() {
    await this.compute('clip');
  }
  @Cron('25 0 * * 1')
  async scheduledCombined() {
    await this.compute('combined');
  }

  /**
   * 算法：对比最近 7 天（本周）和之前 7 天（上周）的播放次数，
   * 按增长量（本周 - 上周）降序排序，只取增长量 > 0 的项。
   */
  async compute(type: RankingType = 'single'): Promise<RankingItem[]> {
    this.logger.log(`开始计算飙升榜（${type}）...`);
    const now = Date.now();
    const weekMs = 7 * 24 * 60 * 60 * 1000;
    const thisWeekStart = new Date(now - weekMs);
    const lastWeekStart = new Date(now - 2 * weekMs);

    let items: RankingItem[] = [];

    if (type === 'single') {
      const [thisWeek, lastWeek] = await Promise.all([
        this.prisma.playHistory.groupBy({
          by: ['songId'],
          where: {
            playTime: { gte: thisWeekStart },
            songId: { not: null },
          },
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
      ]);
      const lastMap = new Map(
        lastWeek.map((g) => [g.songId, g._count._all] as const),
      );
      const growth = thisWeek
        .map((g) => ({
          songId: g.songId!,
          thisCount: g._count._all,
          growth: g._count._all - (lastMap.get(g.songId) ?? 0),
        }))
        .filter((g) => g.growth > 0)
        .sort((a, b) => b.growth - a.growth)
        .slice(0, SoarRankingService.TOP_N);
      const songIds = growth.map((g) => g.songId);
      if (songIds.length > 0) {
        const songs = await this.prisma.song.findMany({
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
        });
        const songMap = new Map(songs.map((s) => [s.id, s]));
        const growMap = new Map(growth.map((g) => [g.songId, g]));
        items = songIds
          .map((id) => songMap.get(id))
          .filter((s): s is NonNullable<typeof s> => !!s)
          .map((song, idx) => {
            const g = growMap.get(song.id);
            return {
              id: song.id,
              itemId: song.id,
              trackType: 'song' as const,
              title: song.title,
              artist: song.artist,
              cover: song.coverUrl ?? song.album?.cover ?? null,
              duration: song.duration,
              rank: idx + 1,
              artistId: song.songArtists?.[0]?.artistId ?? null,
              playCount: g?.thisCount ?? 0,
              growth: g?.growth ?? 0,
            };
          });
      }
    } else if (type === 'clip') {
      const [thisWeek, lastWeek] = await Promise.all([
        this.prisma.playHistory.groupBy({
          by: ['clipId'],
          where: {
            playTime: { gte: thisWeekStart },
            clipId: { not: null },
          },
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
      const lastMap = new Map(
        lastWeek.map((g) => [g.clipId, g._count._all] as const),
      );
      const growth = thisWeek
        .map((g) => ({
          clipId: g.clipId!,
          thisCount: g._count._all,
          growth: g._count._all - (lastMap.get(g.clipId) ?? 0),
        }))
        .filter((g) => g.growth > 0)
        .sort((a, b) => b.growth - a.growth)
        .slice(0, SoarRankingService.TOP_N);
      const clipIds = growth.map((g) => g.clipId);
      if (clipIds.length > 0) {
        const clips = await this.prisma.liveClip.findMany({
          where: { id: { in: clipIds }, status: 'PUBLISHED' },
          include: {
            session: { select: { id: true, title: true, liveTime: true, cover: true } },
          },
        });
        const clipMap = new Map(clips.map((c) => [c.id, c]));
        const growMap = new Map(growth.map((g) => [g.clipId, g]));
        items = clipIds
          .map((id) => clipMap.get(id))
          .filter((c): c is NonNullable<typeof c> => !!c)
          .map((clip, idx) => {
            const g = growMap.get(clip.id);
            return {
              id: clip.id,
              itemId: clip.id,
              trackType: 'clip' as const,
              title: clip.title,
              artist: clip.artist,
              cover: clip.coverUrl ?? clip.session?.cover ?? null,
              duration: clip.duration,
              rank: idx + 1,
              sessionId: clip.sessionId,
              sessionName: clip.session?.title ?? '',
              fileUrl: clip.fileUrl,
              playCount: g?.thisCount ?? 0,
              growth: g?.growth ?? 0,
            };
          });
      }
    } else {
      // combined: 合并 song + clip 的本周/上周 groupBy
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

      items = top
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
    }

    const payload = JSON.stringify({
      items,
      computedAt: new Date().toISOString(),
    });
    await this.prisma.systemSetting.upsert({
      where: { key: this.cacheKey(type) },
      update: { value: payload },
      create: { key: this.cacheKey(type), value: payload },
    });

    this.logger.log(`飙升榜（${type}）计算完成，共 ${items.length} 项`);
    await this.rankingPlaylistService.syncTop50(type, 'soar', items);
    return items;
  }

  async getTop(type: RankingType = 'single'): Promise<RankingItem[]> {
    const cached = await this.readCache(type);
    if (cached && cached.items.length > 0) {
      return cached.items;
    }
    this.logger.warn(`飙升榜（${type}）缓存为空，实时计算...`);
    return this.compute(type);
  }

  private cacheKey(type: RankingType): string {
    return `${SoarRankingService.SETTING_KEY_PREFIX}:${type}`;
  }

  private async readCache(
    type: RankingType,
  ): Promise<{ items: RankingItem[]; computedAt: string } | null> {
    const row = await this.prisma.systemSetting.findUnique({
      where: { key: this.cacheKey(type) },
    });
    if (!row) return null;
    try {
      return JSON.parse(row.value);
    } catch {
      return null;
    }
  }
}
