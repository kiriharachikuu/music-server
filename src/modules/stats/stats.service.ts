import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/** 站点公开设置项白名单 */
const PUBLIC_SETTING_KEYS = [
  'site_name',
  'logo',
  'copyright',
  'icp',
  'seo_keywords',
  'seo_description',
];

@Injectable()
export class StatsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 发现页聚合数据
   * - banners：首页轮播图
   * - dailyRecommend：从近 20 个公开歌单中随机抽取 6 个
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
        }),
        this.prisma.playlist.findMany({
          where: { isPublic: true, deletedAt: null },
          orderBy: { createdAt: 'desc' },
          take: 20,
          include: {
            user: { select: { id: true, username: true, avatar: true } },
          },
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
      dailyRecommend: this.shuffle(dailyRecommendPool).slice(0, 6),
      newSongs,
      featuredPlaylists,
    };
  }

  /**
   * 排行榜：4 个榜单各 50 首
   * - soaring：近 30 天发行歌曲按 plays 降序（飙升）
   * - newSongs：按 releaseDate 降序（新歌榜）
   * - hot：按 plays 降序（热歌榜）
   * - original：按 plays 降序（原创榜，简化处理）
   */
  async getRankings() {
    const baseWhere = { deletedAt: null, status: 'PUBLISHED' as const };
    const monthAgo = new Date(Date.now() - 30 * 24 * 3600 * 1000);
    const include = { album: true };

    const [soaring, newSongs, hot, original] = await Promise.all([
      this.prisma.song.findMany({
        where: { ...baseWhere, releaseDate: { gte: monthAgo } },
        orderBy: { plays: 'desc' },
        take: 50,
        include,
      }),
      this.prisma.song.findMany({
        where: baseWhere,
        orderBy: { releaseDate: 'desc' },
        take: 50,
        include,
      }),
      this.prisma.song.findMany({
        where: baseWhere,
        orderBy: { plays: 'desc' },
        take: 50,
        include,
      }),
      this.prisma.song.findMany({
        where: baseWhere,
        orderBy: { plays: 'desc' },
        take: 50,
        include,
      }),
    ]);

    return { soaring, newSongs, hot, original };
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
