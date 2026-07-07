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
   * - featuredPlaylists：按 playCount 降序 6 个
   */
  async getDiscover() {
    const [banners, dailyRecommendPool, newSongs, featuredPlaylists] =
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
          orderBy: { playCount: 'desc' },
          take: 6,
          include: {
            user: { select: { id: true, username: true, avatar: true } },
          },
        }),
      ]);

    return {
      banners,
      // 每日推荐：从最新 50 首中随机抽取 30 首
      dailyRecommend: this.shuffle(dailyRecommendPool).slice(0, 30),
      newSongs,
      featuredPlaylists,
    };
  }

  /**
   * 排行榜：3 个榜单各 50 首
   * - soar：近 30 天发行歌曲按维度降序（飙升）
   * - new：按维度降序（新歌榜，by=play 时退化为 releaseDate 倒序）
   * - hot：按维度降序（热歌榜）
   *
   * 维度 by：
   * - 'play'：按播放量 plays 降序（new 仍按 releaseDate 倒序，新歌榜语义）
   * - 'favorite'：按收藏量 favoriteCount 降序（3 个榜单统一）
   *
   * 注意：soar 榜始终保留近 30 天 releaseDate 条件。
   */
  async getRankings(by: 'play' | 'favorite' = 'play') {
    const baseWhere = { deletedAt: null, status: 'PUBLISHED' as const };
    const monthAgo = new Date(Date.now() - 30 * 24 * 3600 * 1000);
    const include = { album: true };

    const isFavorite = by === 'favorite';
    const favoriteOrderBy = { favoriteCount: 'desc' } as const;
    const newOrderBy = isFavorite
      ? favoriteOrderBy
      : ({ releaseDate: 'desc' } as const);
    const playOrderBy = { plays: 'desc' } as const;
    const hotOrderBy = isFavorite ? favoriteOrderBy : playOrderBy;
    const soarOrderBy = isFavorite ? favoriteOrderBy : playOrderBy;

    const [soar, newSongs, hot] = await Promise.all([
      this.prisma.song.findMany({
        where: { ...baseWhere, releaseDate: { gte: monthAgo } },
        orderBy: soarOrderBy,
        take: 50,
        include,
      }),
      this.prisma.song.findMany({
        where: baseWhere,
        orderBy: newOrderBy,
        take: 50,
        include,
      }),
      this.prisma.song.findMany({
        where: baseWhere,
        orderBy: hotOrderBy,
        take: 50,
        include,
      }),
    ]);

    return { soar, new: newSongs, hot };
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
