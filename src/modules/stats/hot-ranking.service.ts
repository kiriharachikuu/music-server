import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import type { RankingItem } from './ranking.types';
import { RankingPlaylistService } from './ranking-playlist.service';

/**
 * 综合热歌榜服务
 *
 * - 仅一档：综合（单曲 + 歌切混合排序）
 * - 每周一 00:10 计算
 * - 缓存到 SystemSetting（key: hotRankingData）
 * - 同步到"综合-热歌榜"系统歌单
 */
@Injectable()
export class HotRankingService implements OnModuleInit {
  private readonly logger = new Logger(HotRankingService.name);
  private static readonly TOP_N = 50;
  private static readonly SETTING_KEY = 'hotRankingData';
  private static readonly CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
  /**
   * 缓存结构版本：字段结构变更（如新增 albumName / album 对象）时递增，
   * 旧版本缓存会被 readCache 视为失效并触发重算，避免线上旧缓存长期缺字段
   */
  private static readonly CACHE_VERSION = 2;

  constructor(
    private readonly prisma: PrismaService,
    private readonly rankingPlaylistService: RankingPlaylistService,
  ) {}

  async onModuleInit() {
    // 启动时确保 3 个系统歌单存在
    await this.rankingPlaylistService.ensureAll();
  }

  /** 00:10 综合热歌 */
  @Cron('10 0 * * 1')
  async scheduledCombined() {
    await this.compute();
  }

  /**
   * 计算过去 7 天播放量前 50（单曲 + 歌切合并按 playCount 排序）
   */
  async compute(): Promise<RankingItem[]> {
    this.logger.log('开始计算综合热歌榜...');
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [songRows, clipRows] = await Promise.all([
      this.prisma.playHistory.groupBy({
        by: ['songId'],
        where: { playTime: { gte: since }, songId: { not: null } },
        _count: { _all: true },
      }),
      this.prisma.playHistory.groupBy({
        by: ['clipId'],
        where: { playTime: { gte: since }, clipId: { not: null } },
        _count: { _all: true },
      }),
    ]);

    const merged = [
      ...songRows.map((r) => ({
        kind: 'song' as const,
        id: r.songId!,
        count: r._count._all,
      })),
      ...clipRows.map((r) => ({
        kind: 'clip' as const,
        id: r.clipId!,
        count: r._count._all,
      })),
    ]
      .sort((a, b) => b.count - a.count)
      .slice(0, HotRankingService.TOP_N);

    const songIds = merged.filter((m) => m.kind === 'song').map((m) => m.id);
    const clipIds = merged.filter((m) => m.kind === 'clip').map((m) => m.id);

    const [songs, clips] = await Promise.all([
      songIds.length > 0
        ? this.prisma.song.findMany({
            where: { id: { in: songIds }, deletedAt: null, status: 'PUBLISHED' },
            include: {
              album: true,
              songArtists: {
                take: 1,
                orderBy: { sort: 'asc' },
                where: { artist: { hasHomepage: true } },
                include: { artist: { select: { id: true } } },
              },
            },
          })
        : Promise.resolve([]),
      clipIds.length > 0
        ? this.prisma.liveClip.findMany({
            where: { id: { in: clipIds }, status: 'PUBLISHED' },
            include: {
              session: { select: { id: true, title: true, liveTime: true, cover: true } },
            },
          })
        : Promise.resolve([]),
    ]);

    const songMap = new Map(songs.map((s) => [s.id, s]));
    const clipMap = new Map(clips.map((c) => [c.id, c]));

    const items = merged
      .map((m): RankingItem | null => {
        if (m.kind === 'song') {
          const song = songMap.get(m.id);
          if (!song) return null;
          const cover = song.coverUrl ?? song.album?.cover ?? null;
          return {
            id: song.id,
            itemId: song.id,
            trackType: 'song',
            title: song.title,
            artist: song.artist,
            cover,
            coverUrl: cover,
            duration: song.duration,
            rank: 0,
            artistId: song.songArtists?.[0]?.artistId ?? null,
            albumId: song.albumId,
            albumName: song.album?.name,
            album: song.album
              ? { id: song.albumId, name: song.album.name, cover: song.album.cover }
              : null,
            playCount: m.count,
            fileUrl: song.fileUrl,
            url: song.fileUrl,
          };
        }
        const clip = clipMap.get(m.id);
        if (!clip) return null;
        const cover = clip.coverUrl ?? clip.session?.cover ?? null;
        return {
          id: clip.id,
          itemId: clip.id,
          trackType: 'live_clip',
          title: clip.title,
          artist: clip.artist,
          cover,
          sessionCover: clip.session?.cover ?? cover,
          albumName: null,
          album: null,
          duration: clip.duration,
          rank: 0,
          sessionId: clip.sessionId,
          sessionName: clip.session?.title ?? '',
          liveTime: clip.session?.liveTime?.toISOString() ?? '',
          trackIndex: clip.trackIndex,
          fileUrl: clip.fileUrl,
          url: clip.fileUrl,
          playCount: m.count,
        };
      })
      .filter((x): x is RankingItem => !!x)
      .map((it, idx) => ({ ...it, rank: idx + 1 }));

    // 缓存到 SystemSetting
    const payload = JSON.stringify({
      version: HotRankingService.CACHE_VERSION,
      items,
      computedAt: new Date().toISOString(),
    });

    await this.prisma.systemSetting.upsert({
      where: { key: HotRankingService.SETTING_KEY },
      update: { value: payload },
      create: { key: HotRankingService.SETTING_KEY, value: payload },
    });

    this.logger.log(`综合热歌榜计算完成，共 ${items.length} 项`);

    // 同步系统歌单
    await this.rankingPlaylistService.syncTop50('hot', items);

    return items;
  }

  /** 读取缓存（不存在则实时计算） */
  async getTop(): Promise<RankingItem[]> {
    const cached = await this.readCache();
    if (cached && cached.items.length > 0) {
      return cached.items;
    }
    this.logger.warn('综合热歌榜缓存为空，实时计算...');
    return this.compute();
  }

  /** 读取缓存原始数据（版本不匹配视为失效） */
  private async readCache(): Promise<{
    items: RankingItem[];
    computedAt: string;
  } | null> {
    const row = await this.prisma.systemSetting.findUnique({
      where: { key: HotRankingService.SETTING_KEY },
    });
    if (!row) return null;
    try {
      const parsed = JSON.parse(row.value);
      if (parsed?.version !== HotRankingService.CACHE_VERSION) {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }
}
