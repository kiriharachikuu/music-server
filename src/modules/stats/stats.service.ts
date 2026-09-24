import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { HotRankingService } from './hot-ranking.service';
import { SoarRankingService } from './soar-ranking.service';
import { NewRankingService } from './new-ranking.service';
import {
  LegacyRankingsResponse,
  RankingItem,
  RankingKind,
  RankingResponse,
} from './ranking.types';
import {
  RANKING_DESCRIPTIONS,
  RankingPlaylistService,
} from './ranking-playlist.service';

/**
 * 站点公开设置项白名单
 * 注意：key 必须与 admin.service.ts 写入的 camelCase 命名一致，
 * 否则公开接口将读不到后台已配置的值。
 */
const PUBLIC_SETTING_KEYS = [
  'siteTitle',
  'logoUrl',
  'copyright',
  'icp',
  'seoKeywords',
  'seoDescription',
];

@Injectable()
export class StatsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hotRankingService: HotRankingService,
    private readonly soarRankingService: SoarRankingService,
    private readonly newRankingService: NewRankingService,
    private readonly rankingPlaylistService: RankingPlaylistService,
  ) {}

  /**
   * 发现页聚合数据
   * - banners：首页轮播图（含关联歌曲，供点击播放）
   * - dailySongs：从最新 50 首歌曲中随机抽取 20 首
   * - dailyClips：从最新 50 条歌切中随机抽取 20 首（LiveClipTrack 格式）
   * - newSongs：按 releaseDate 降序 10 首
   * - featuredPlaylists：官方歌单（isSystem=true）优先，再按 playCount 降序 6 个
   */
  async getDiscover() {
    const [
      banners,
      dailySongsPool,
      dailyClipsPool,
      newSongs,
      featuredPlaylists,
      hotArtists,
    ] = await Promise.all([
      this.prisma.banner.findMany({
        where: { status: 'VISIBLE' },
        orderBy: { sort: 'asc' },
        take: 8,
        include: {
          song: {
            include: {
              album: true,
              songArtists: {
                take: 1,
                orderBy: { sort: 'asc' },
                where: { artist: { hasHomepage: true } },
                include: { artist: { select: { id: true } } },
              },
            },
          },
        },
      }),
      this.prisma.song.findMany({
        where: { deletedAt: null, status: 'PUBLISHED' },
        orderBy: { releaseDate: 'desc' },
        take: 50,
        include: {
          album: true,
          songArtists: {
            take: 1,
            orderBy: { sort: 'asc' },
            where: { artist: { hasHomepage: true } },
            include: { artist: { select: { id: true } } },
          },
        },
      }),
      this.prisma.liveClip.findMany({
        where: { status: 'PUBLISHED' },
        include: {
          session: {
            select: { id: true, title: true, liveTime: true, cover: true },
          },
        },
        orderBy: [{ sessionId: 'asc' }, { trackIndex: 'asc' }],
        take: 50,
      }),
      this.prisma.song.findMany({
        where: { deletedAt: null, status: 'PUBLISHED' },
        orderBy: { releaseDate: 'desc' },
        take: 10,
        include: {
          album: true,
          songArtists: {
            take: 1,
            orderBy: { sort: 'asc' },
            where: { artist: { hasHomepage: true } },
            include: { artist: { select: { id: true } } },
          },
        },
      }),
      this.prisma.playlist.findMany({
        where: { isPublic: true, deletedAt: null },
        orderBy: [{ isSystem: 'desc' }, { playCount: 'desc' }],
        take: 6,
        include: {
          user: { select: { id: true, username: true, avatar: true } },
        },
      }),
      this.prisma.artist.findMany({
        where: { deletedAt: null },
        orderBy: { createdAt: 'desc' },
        take: 12,
        include: {
          _count: {
            select: {
              songArtists: {
                where: { song: { deletedAt: null, status: 'PUBLISHED' } },
              },
            },
          },
        },
      }),
    ]);

    return {
      banners,
      dailySongs: this.shuffle(dailySongsPool)
        .slice(0, 20)
        .map((song) => ({
          ...song,
          artistId: song.songArtists?.[0]?.artistId ?? null,
        })),
      dailyClips: this.shuffle(
        this.mapClipsToLiveClipTrack(dailyClipsPool),
      ).slice(0, 20),
      newSongs: newSongs.map((song) => ({
        ...song,
        artistId: song.songArtists?.[0]?.artistId ?? null,
      })),
      featuredPlaylists,
      hotArtists: hotArtists.map((a) => ({
        id: a.id,
        name: a.name,
        avatar: a.avatar,
        cover: a.avatar,
        songCount: a._count.songArtists,
      })),
    };
  }

  /**
   * 每日推荐·单曲：随机 limit 首 ApiSong（含 album 关联）
   */
  async getDailySongs(limit = 20): Promise<any[]> {
    const pool = await this.prisma.song.findMany({
      where: { deletedAt: null, status: 'PUBLISHED' },
      orderBy: { releaseDate: 'desc' },
      take: 50,
      include: {
        album: true,
        songArtists: {
          take: 1,
          orderBy: { sort: 'asc' },
          where: { artist: { hasHomepage: true } },
          include: { artist: { select: { id: true } } },
        },
      },
    });
    return this.shuffle(pool)
      .slice(0, limit)
      .map((song) => ({
        ...song,
        artistId: song.songArtists?.[0]?.artistId ?? null,
      }));
  }

  /**
   * 每日推荐·歌切：随机 limit 首 LiveClipTrack
   */
  async getDailyClips(limit = 20): Promise<any[]> {
    const pool = await this.prisma.liveClip.findMany({
      where: { status: 'PUBLISHED' },
      include: {
        session: {
          select: { id: true, title: true, liveTime: true, cover: true },
        },
      },
      orderBy: [{ sessionId: 'asc' }, { trackIndex: 'asc' }],
      take: 50,
    });
    return this.shuffle(this.mapClipsToLiveClipTrack(pool)).slice(0, limit);
  }

  /**
   * 将 liveClip 记录映射为前端 LiveClipTrack 格式
   * 扁平化 session 字段 + 添加 trackType（与 search.service.ts 保持一致）
   */
  private mapClipsToLiveClipTrack(
    clips: Array<{
      id: string;
      title: string;
      artist: string;
      coverUrl: string | null;
      fileUrl: string;
      duration: number;
      sessionId: string;
      trackIndex: number;
      session: {
        id: string;
        title: string;
        liveTime: Date | null;
        cover: string | null;
      } | null;
    }>,
  ): any[] {
    return clips.map((clip) => ({
      id: clip.id,
      title: clip.title,
      artist: clip.artist,
      cover: clip.coverUrl ?? clip.session?.cover,
      coverUrl: clip.coverUrl ?? clip.session?.cover ?? null,
      url: clip.fileUrl,
      fileUrl: clip.fileUrl,
      albumName: null,
      album: null,
      duration: clip.duration,
      trackType: 'live_clip' as const,
      sessionId: clip.sessionId,
      sessionName: clip.session?.title ?? '',
      liveTime: clip.session?.liveTime?.toISOString() ?? '',
      trackIndex: clip.trackIndex,
    }));
  }

  // ============ 3 档综合排行榜 ============

  /**
   * 单档综合排行榜入口
   * @param ranking 飙升(soar) / 热歌(hot) / 新歌(new)
   */
  async getLegacyRankings(): Promise<LegacyRankingsResponse> {
    const [soar, newItems, hot] = await Promise.all([
      this.soarRankingService.getTop(),
      this.newRankingService.getTop(),
      this.hotRankingService.getTop(),
    ]);
    return {
      soar: this.normalizeRankingItems(soar),
      new: this.normalizeRankingItems(newItems),
      hot: this.normalizeRankingItems(hot),
    };
  }

  async getRanking(
    ranking: RankingKind = 'soar',
    page?: { limit?: number; offset?: number },
  ): Promise<RankingResponse> {
    let items: RankingItem[] = [];
    if (ranking === 'soar') {
      items = await this.soarRankingService.getTop();
    } else if (ranking === 'hot') {
      items = await this.hotRankingService.getTop();
    } else {
      items = await this.newRankingService.getTop();
    }

    const normalized = this.normalizeRankingItems(items);

    // 分页：不传 limit/offset 时返回全量（向后兼容）
    const total = normalized.length;
    const limit =
      page?.limit && page.limit > 0 ? Math.min(100, page.limit) : total;
    const offset = page?.offset && page.offset > 0 ? page.offset : 0;
    const tracks = normalized.slice(offset, offset + limit);

    const playlist = await this.rankingPlaylistService.findPlaylist(ranking);
    const updatedAt = new Date().toISOString();

    return {
      ranking,
      title: RankingPlaylistService.nameOf(ranking),
      cover: playlist?.cover ?? normalized[0]?.cover ?? null,
      description: RANKING_DESCRIPTIONS[ranking] ?? playlist?.description ?? '',
      tracks,
      total,
      limit,
      offset,
      hasMore: offset + tracks.length < total,
      updatedAt,
      generatedAt: updatedAt,
      playlistId: playlist?.id ?? null,
    };
  }

  private normalizeRankingItems(items: RankingItem[]): RankingItem[] {
    return items.map((item, idx) => {
      const isClip =
        item.trackType === 'live_clip' || item.trackType === 'clip';
      const cover = item.cover ?? item.coverUrl ?? item.sessionCover ?? null;
      const albumName = item.albumName ?? item.album?.name;
      const playCount = item.playCount ?? item.plays ?? 0;
      return {
        ...item,
        id: item.itemId ?? item.id,
        itemId: item.itemId ?? item.id,
        trackType: isClip ? 'live_clip' : 'song',
        rank: idx + 1,
        cover,
        coverUrl: item.coverUrl ?? cover,
        albumName,
        album: item.album
          ? { id: item.albumId ?? null, ...item.album }
          : albumName
            ? { id: item.albumId ?? null, name: albumName }
            : null,
        sessionCover: item.sessionCover ?? cover,
        playCount,
        plays: playCount,
        favoriteCount: item.favoriteCount ?? 0,
        fileUrl: item.fileUrl ?? item.url ?? null,
        url: item.url ?? item.fileUrl ?? null,
      };
    });
  }

  /** 站点公开设置项 */
  async getSiteSettings(): Promise<Record<string, string>> {
    const rows = await this.prisma.systemSetting.findMany({
      where: { key: { in: PUBLIC_SETTING_KEYS } },
    });
    const result: Record<string, string> = {};
    for (const key of PUBLIC_SETTING_KEYS) {
      const row = rows.find((r) => r.key === key);
      result[key] = row?.value ?? '';
    }
    return result;
  }

  /** Fisher–Yates 洗牌 */
  private shuffle<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
}
