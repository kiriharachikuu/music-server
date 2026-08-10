import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { HotRankingService } from './hot-ranking.service';
import { SoarRankingService } from './soar-ranking.service';
import { NewRankingService } from './new-ranking.service';
import {
  RankingItem,
  RankingKind,
  RankingResponse,
  RankingType,
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
            include: { artist: { select: { id: true } } },
          },
        },
      }),
      this.prisma.liveClip.findMany({
        where: { status: 'PUBLISHED' },
        include: {
          session: { select: { id: true, title: true, liveTime: true, cover: true } },
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
            include: { artist: { select: { id: true } } },
          },
        },
      }),
      this.prisma.playlist.findMany({
        where: { isPublic: true, deletedAt: null },
        orderBy: [
          { isSystem: 'desc' },
          { playCount: 'desc' },
        ],
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
            select: { songArtists: { where: { song: { deletedAt: null, status: 'PUBLISHED' } } } },
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
      dailyClips: this.shuffle(this.mapClipsToLiveClipTrack(dailyClipsPool)).slice(0, 20),
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
          include: { artist: { select: { id: true } } },
        },
      },
    });
    return this.shuffle(pool).slice(0, limit).map((song) => ({
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
        session: { select: { id: true, title: true, liveTime: true, cover: true } },
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
  private mapClipsToLiveClipTrack(clips: any[]): any[] {
    return clips.map((clip) => ({
      id: clip.id,
      title: clip.title,
      artist: clip.artist,
      cover: clip.coverUrl ?? clip.session?.cover,
      url: clip.fileUrl,
      duration: clip.duration,
      trackType: 'live_clip' as const,
      sessionId: clip.sessionId,
      sessionName: clip.session?.title ?? '',
      liveTime: clip.session?.liveTime?.toISOString() ?? '',
      trackIndex: clip.trackIndex,
    }));
  }

  // ============ 9 档排行榜 ============

  /**
   * 旧版 API（保持向后兼容）
   * 返回 { soar, new, hot } 三个数组的旧结构
   */
  async getRankings(_by: 'play' | 'favorite' = 'play') {
    const [soar, news, hot] = await Promise.all([
      this.getRankingsByType('single', 'soar'),
      this.getRankingsByType('single', 'new'),
      this.getRankingsByType('single', 'hot'),
    ]);
    return {
      soar: this.stripsItemFields(soar.tracks),
      new: this.stripsItemFields(news.tracks),
      hot: this.stripsItemFields(hot.tracks),
    };
  }

  /**
   * 9 档排行榜统一入口
   * @param type 综合(combined) / 单曲(single) / 歌切(clip)
   * @param ranking 飙升(soar) / 热歌(hot) / 新歌(new)
   */
  async getRankingsByType(
    type: RankingType = 'combined',
    ranking: RankingKind = 'soar',
  ): Promise<RankingResponse> {
    let items: RankingItem[] = [];
    if (ranking === 'soar') {
      items = await this.soarRankingService.getTop(type);
    } else if (ranking === 'hot') {
      items = await this.hotRankingService.getTop(type);
    } else {
      items = await this.newRankingService.getTop(type);
    }

    // 重排 rank（防止缓存中 rank 字段缺失/重复）
    const tracks = items.map((it, idx) => ({ ...it, rank: idx + 1 }));

    const playlist = await this.rankingPlaylistService.findPlaylist(type, ranking);

    return {
      type,
      ranking,
      title: RankingPlaylistService.nameOf(type, ranking),
      cover: playlist?.cover ?? tracks[0]?.cover ?? null,
      description:
        RANKING_DESCRIPTIONS[`${type}-${ranking}`] ??
        playlist?.description ??
        '',
      tracks,
      updatedAt: new Date().toISOString(),
      playlistId: playlist?.id ?? null,
    };
  }

  /** 旧版响应需要剥除 trackType/rank 等扩展字段，仅返回原始单曲字段 */
  private stripsItemFields(items: RankingItem[]): any[] {
    return items.map((it) => {
      if (it.trackType === 'song') {
        // 单曲：去掉 trackType/itemId/cover 多余 alias，保留 Song 原生字段
        const { trackType, itemId, rank, cover, ...rest } = it;
        return { ...rest, coverUrl: rest.coverUrl ?? cover };
      }
      // 歌切：返回 LiveClip 形状
      const { trackType, itemId, rank, cover, ...rest } = it;
      return { ...rest, coverUrl: rest.coverUrl ?? cover };
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
