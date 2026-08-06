import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { HotRankingService } from './hot-ranking.service';
import { SoarRankingService } from './soar-ranking.service';

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
          song: { include: { album: true } },
        },
      }),
      this.prisma.song.findMany({
        where: { deletedAt: null, status: 'PUBLISHED' },
        orderBy: { releaseDate: 'desc' },
        take: 50,
        include: { album: true },
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
        include: { album: true },
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
      dailySongs: this.shuffle(dailySongsPool).slice(0, 20),
      dailyClips: this.shuffle(this.mapClipsToLiveClipTrack(dailyClipsPool)).slice(0, 20),
      newSongs,
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
      include: { album: true },
    });
    return this.shuffle(pool).slice(0, limit);
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

  /**
   * 排行榜
   * - soar（飙升榜）：对比本周与上周播放增长量，自动排名前 50，每周一更新
   * - new（新歌榜）：基于官方系统歌单（人工推荐）
   * - hot（热歌榜）：基于过去 7 天播放量自动排名前 50，每周一更新
   *
   * 飙升榜/热歌榜数据来源：定时计算并缓存到 SystemSetting，
   * 同时同步到对应系统歌单。此处直接读取缓存的歌曲 ID 列表查询详情。
   */
  async getRankings(_by: 'play' | 'favorite' = 'play') {
    // 新歌榜：仍从人工推荐的系统歌单读取
    const systemPlaylists = await this.prisma.playlist.findMany({
      where: {
        isSystem: true,
        deletedAt: null,
        isPublic: true,
        name: { contains: '新歌' },
      },
      include: {
        playlistSongs: {
          where: { song: { deletedAt: null, status: 'PUBLISHED' } },
          orderBy: { sort: 'asc' },
          take: 50,
          include: {
            song: { include: { album: true } },
          },
        },
      },
    });

    const result: { soar: any[]; new: any[]; hot: any[] } = {
      soar: [],
      new: [],
      hot: [],
    };

    // 新歌榜：从人工推荐的系统歌单读取
    if (systemPlaylists.length > 0) {
      result.new = systemPlaylists[0].playlistSongs.map((ps) => ps.song);
    }

    // 飙升榜：基于播放增长量自动排名
    const soarSongIds = await this.soarRankingService.getCachedSongIds();
    if (soarSongIds.length > 0) {
      const soarSongs = await this.prisma.song.findMany({
        where: {
          id: { in: soarSongIds },
          deletedAt: null,
          status: 'PUBLISHED',
        },
        include: { album: true },
      });
      const songMap = new Map(soarSongs.map((s) => [s.id, s]));
      result.soar = soarSongIds
        .map((id) => songMap.get(id))
        .filter((s): s is NonNullable<typeof s> => !!s);
    }

    // 热歌榜：基于过去 7 天播放量自动排名
    const hotSongIds = await this.hotRankingService.getCachedSongIds();
    if (hotSongIds.length > 0) {
      const hotSongs = await this.prisma.song.findMany({
        where: {
          id: { in: hotSongIds },
          deletedAt: null,
          status: 'PUBLISHED',
        },
        include: { album: true },
      });
      const songMap = new Map(hotSongs.map((s) => [s.id, s]));
      result.hot = hotSongIds
        .map((id) => songMap.get(id))
        .filter((s): s is NonNullable<typeof s> => !!s);
    }

    return result;
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
