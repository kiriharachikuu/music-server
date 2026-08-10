import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import type { RankingItem, RankingType } from './ranking.types';
import { RankingPlaylistService } from './ranking-playlist.service';

/**
 * 热歌榜服务
 *
 * 三档：综合(combined) / 单曲(single) / 歌切(clip)
 * - 每周一 00:00 / 00:05 / 00:10 错峰计算
 * - 缓存到 SystemSetting（同 key 三个子键）
 * - 同步到对应系统歌单
 */
@Injectable()
export class HotRankingService implements OnModuleInit {
  private readonly logger = new Logger(HotRankingService.name);
  private static readonly TOP_N = 50;
  private static readonly SETTING_KEY_PREFIX = 'hotRankingData';
  private static readonly CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly rankingPlaylistService: RankingPlaylistService,
  ) {}

  async onModuleInit() {
    // 启动时确保 9 个系统歌单存在
    await this.rankingPlaylistService.ensureAll();
  }

  /** 00:00 单曲 */
  @Cron('0 0 * * 1')
  async scheduledSingle() {
    await this.compute('single');
  }
  /** 00:05 歌切 */
  @Cron('5 0 * * 1')
  async scheduledClip() {
    await this.compute('clip');
  }
  /** 00:10 综合 */
  @Cron('10 0 * * 1')
  async scheduledCombined() {
    await this.compute('combined');
  }

  /**
   * 计算过去 7 天播放量前 50
   * - single：仅 Song
   * - clip：仅 LiveClip
   * - combined：单曲 + 歌切合并按 playCount 排序（歌切无 plays 字段，使用 PlayHistory groupBy 计数）
   */
  async compute(type: RankingType = 'single'): Promise<RankingItem[]> {
    this.logger.log(`开始计算热歌榜（${type}）...`);
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    let items: RankingItem[] = [];

    if (type === 'single') {
      const grouped = await this.prisma.playHistory.groupBy({
        by: ['songId'],
        where: { playTime: { gte: since }, songId: { not: null } },
        _count: { _all: true },
        orderBy: { _count: { songId: 'desc' } },
        take: HotRankingService.TOP_N,
      });
      const songIds = grouped.map((g) => g.songId).filter((x): x is string => !!x);
      if (songIds.length > 0) {
        const songs = await this.prisma.song.findMany({
          where: { id: { in: songIds }, deletedAt: null, status: 'PUBLISHED' },
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
        const countMap = new Map(
          grouped.map((g) => [g.songId, g._count._all]),
        );
        items = songIds
          .map((id) => songMap.get(id))
          .filter((s): s is NonNullable<typeof s> => !!s)
          .map((song, idx) => {
            const item: RankingItem = {
              id: song.id,
              itemId: song.id,
              trackType: 'song',
              title: song.title,
              artist: song.artist,
              cover: song.coverUrl ?? song.album?.cover ?? null,
              duration: song.duration,
              rank: idx + 1,
              artistId: song.songArtists?.[0]?.artistId ?? null,
              playCount: countMap.get(song.id) ?? 0,
              fileUrl: song.fileUrl,
            };
            return item;
          });
      }
    } else if (type === 'clip') {
      const grouped = await this.prisma.playHistory.groupBy({
        by: ['clipId'],
        where: { playTime: { gte: since }, clipId: { not: null } },
        _count: { _all: true },
        orderBy: { _count: { clipId: 'desc' } },
        take: HotRankingService.TOP_N,
      });
      const clipIds = grouped.map((g) => g.clipId).filter((x): x is string => !!x);
      if (clipIds.length > 0) {
        const clips = await this.prisma.liveClip.findMany({
          where: { id: { in: clipIds }, status: 'PUBLISHED' },
          include: {
            session: { select: { id: true, title: true, liveTime: true, cover: true } },
          },
        });
        const clipMap = new Map(clips.map((c) => [c.id, c]));
        const countMap = new Map(
          grouped.map((g) => [g.clipId, g._count._all]),
        );
        items = clipIds
          .map((id) => clipMap.get(id))
          .filter((c): c is NonNullable<typeof c> => !!c)
          .map((clip, idx) => ({
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
            playCount: countMap.get(clip.id) ?? 0,
          }));
      }
    } else {
      // combined: 合并单曲与歌切播放计数，按计数统一排序
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

      items = merged
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
              playCount: m.count,
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
            playCount: m.count,
          };
        })
        .filter((x): x is RankingItem => !!x)
        .map((it, idx) => ({ ...it, rank: idx + 1 }));
    }

    // 缓存到 SystemSetting（按 type 分键）
    const payload = JSON.stringify({
      items: items.map((it) => ({
        ...it,
        // 移除 Prisma include 出来的扩展字段，仅保留 RankingItem 标准字段
        album: undefined,
        songArtists: undefined,
        session: undefined,
      })),
      computedAt: new Date().toISOString(),
    });

    await this.prisma.systemSetting.upsert({
      where: { key: this.cacheKey(type) },
      update: { value: payload },
      create: { key: this.cacheKey(type), value: payload },
    });

    this.logger.log(`热歌榜（${type}）计算完成，共 ${items.length} 项`);

    // 同步系统歌单
    await this.rankingPlaylistService.syncTop50(type, 'hot', items);

    return items;
  }

  /** 读取缓存（不存在则实时计算） */
  async getTop(type: RankingType = 'single'): Promise<RankingItem[]> {
    const cached = await this.readCache(type);
    if (cached && cached.items.length > 0) {
      return cached.items;
    }
    this.logger.warn(`热歌榜（${type}）缓存为空，实时计算...`);
    return this.compute(type);
  }

  /** 缓存键 */
  private cacheKey(type: RankingType): string {
    return `${HotRankingService.SETTING_KEY_PREFIX}:${type}`;
  }

  /** 读取缓存原始数据 */
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
