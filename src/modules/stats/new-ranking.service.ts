import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { RankingItem } from './ranking.types';
import { RankingPlaylistService } from './ranking-playlist.service';

/**
 * 综合新歌榜服务
 *
 * - 仅一档：综合（单曲 + 歌切混合排序）
 * - 实时查询（按 createdAt 倒序），无需定时计算
 * - 但为了与飙升/热歌统一暴露 compute 入口，结果缓存到 SystemSetting，TTL 10 分钟
 * - 同步到"综合-新歌榜"系统歌单
 */
@Injectable()
export class NewRankingService {
  private readonly logger = new Logger(NewRankingService.name);
  private static readonly TOP_N = 50;
  private static readonly CACHE_TTL_MS = 10 * 60 * 1000;
  private static readonly SETTING_KEY = 'newRankingData';
  /** 缓存结构版本：字段结构变更时递增，旧缓存视为失效并重算 */
  private static readonly CACHE_VERSION = 2;

  constructor(
    private readonly prisma: PrismaService,
    private readonly rankingPlaylistService: RankingPlaylistService,
  ) {}

  /**
   * 计算（或刷新）综合新歌榜
   * 实际是 findMany 排序 + 缓存，用于与 hot/soar 行为对齐
   */
  async compute(): Promise<RankingItem[]> {
    this.logger.log('刷新综合新歌榜...');
    const items = await this.fetchItems();
    const payload = JSON.stringify({
      version: NewRankingService.CACHE_VERSION,
      items,
      computedAt: new Date().toISOString(),
    });
    await this.prisma.systemSetting.upsert({
      where: { key: NewRankingService.SETTING_KEY },
      update: { value: payload },
      create: { key: NewRankingService.SETTING_KEY, value: payload },
    });

    await this.rankingPlaylistService.syncTop50('new', items);
    return items;
  }

  /** 读取缓存；若过期或不存在则重新计算 */
  async getTop(): Promise<RankingItem[]> {
    const cached = await this.readCache();
    if (cached) {
      const elapsed = Date.now() - new Date(cached.computedAt).getTime();
      if (elapsed < NewRankingService.CACHE_TTL_MS && cached.items.length > 0) {
        return cached.items;
      }
    }
    this.logger.warn('综合新歌榜缓存失效，实时计算...');
    return this.compute();
  }

  /** 实际查询并组装列表 */
  private async fetchItems(): Promise<RankingItem[]> {
    const [songs, clips] = await Promise.all([
      this.prisma.song.findMany({
        where: { deletedAt: null, status: 'PUBLISHED' },
        orderBy: { createdAt: 'desc' },
        take: NewRankingService.TOP_N,
        include: {
          album: true,
          songArtists: {
            take: 1,
            orderBy: { sort: 'asc' },
            include: { artist: { select: { id: true } } },
          },
        },
      }),
      this.prisma.liveClip.findMany({
        where: { status: 'PUBLISHED' },
        orderBy: { createdAt: 'desc' },
        take: NewRankingService.TOP_N,
        include: {
          session: { select: { id: true, title: true, liveTime: true, cover: true } },
        },
      }),
    ]);

    type RawItem = {
      kind: 'song' | 'clip';
      createdAt: Date;
      build: () => RankingItem;
    };
    const raw: RawItem[] = [
      ...songs.map<RawItem>((song) => ({
        kind: 'song',
        createdAt: song.createdAt,
        build: () => {
          const cover = song.coverUrl ?? song.album?.cover ?? null;
          return {
            id: song.id,
            itemId: song.id,
            trackType: 'song' as const,
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
            fileUrl: song.fileUrl,
            url: song.fileUrl,
            createdAt: song.createdAt.toISOString(),
          };
        },
      })),
      ...clips.map<RawItem>((clip) => ({
        kind: 'clip',
        createdAt: clip.createdAt,
        build: () => {
          const cover = clip.coverUrl ?? clip.session?.cover ?? null;
          return {
            id: clip.id,
            itemId: clip.id,
            trackType: 'live_clip' as const,
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
            createdAt: clip.createdAt.toISOString(),
          };
        },
      })),
    ];

    return raw
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, NewRankingService.TOP_N)
      .map((r, idx) => ({ ...r.build(), rank: idx + 1 }));
  }

  private async readCache(): Promise<{
    items: RankingItem[];
    computedAt: string;
  } | null> {
    const row = await this.prisma.systemSetting.findUnique({
      where: { key: NewRankingService.SETTING_KEY },
    });
    if (!row) return null;
    try {
      const parsed = JSON.parse(row.value);
      if (parsed?.version !== NewRankingService.CACHE_VERSION) {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }
}
