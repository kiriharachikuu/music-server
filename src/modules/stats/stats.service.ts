import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

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
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 发现页聚合数据
   * - banners：首页轮播图（含关联歌曲，供点击播放）
   * - dailyRecommend：从最新 50 首歌曲中随机抽取 30 首
   * - newSongs：按 releaseDate 降序 10 首
   * - featuredPlaylists：官方歌单（isSystem=true）优先，再按 playCount 降序 6 个
   */
  async getDiscover() {
    const [banners, dailyRecommendPool, newSongs, featuredPlaylists, hotArtists] =
      await Promise.all([
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
      dailyRecommend: this.shuffle(dailyRecommendPool).slice(0, 30),
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
   * 排行榜：基于官方歌单（isSystem=true）的人工推荐
   * 每个榜单对应一个标记为系统歌单的官方歌单：
   * - soar（飙升榜）：匹配名称包含"飙升"的系统歌单
   * - new（新歌榜）：匹配名称包含"新歌"的系统歌单
   * - hot（热歌榜）：匹配名称包含"热歌"的系统歌单
   *
   * 注意：已彻底停用基于播放量/收藏量的自动推送算法。
   * 若未配置对应官方歌单，返回空数组。
   * 歌曲顺序严格遵循歌单内歌曲的 sort 字段排序。
   */
  async getRankings(_by: 'play' | 'favorite' = 'play') {
    const rankingKeywords: { key: 'soar' | 'new' | 'hot'; keyword: string }[] = [
      { key: 'soar', keyword: '飙升' },
      { key: 'new', keyword: '新歌' },
      { key: 'hot', keyword: '热歌' },
    ];

    const systemPlaylists = await this.prisma.playlist.findMany({
      where: {
        isSystem: true,
        deletedAt: null,
        isPublic: true,
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

    for (const { key, keyword } of rankingKeywords) {
      const matched = systemPlaylists.find((p) => p.name.includes(keyword));
      if (matched) {
        result[key] = matched.playlistSongs.map((ps) => ps.song);
      }
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
