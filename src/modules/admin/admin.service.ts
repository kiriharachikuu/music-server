import { Injectable } from '@nestjs/common';
import { StorageConfigService } from '../upload/storage-config.service';
import { PrismaService } from '../../prisma/prisma.service';

/** 后台统计返回结构 */
export interface AdminStats {
  totalUsers: number;
  totalSongs: number;
  totalPlaylists: number;
  totalLiveClips: number;
  totalLiveSessions: number;
  todayPlays: number;
  playTrend: { date: string; plays: number }[];
  topSongs: {
    id: string;
    title: string;
    artist: string;
    coverUrl: string | null;
    plays: number;
  }[];
  topClips: {
    id: string;
    title: string;
    artist: string;
    coverUrl: string | null;
    favoriteCount: number;
  }[];
}

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storageConfigService: StorageConfigService,
  ) {}

  /** 后台总览统计 */
  async getStats(): Promise<AdminStats> {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const [
      totalUsers,
      totalSongs,
      totalPlaylists,
      totalLiveClips,
      totalLiveSessions,
      todayPlays,
      topSongsRaw,
      topClipsRaw,
      trendRows,
    ] = await Promise.all([
      this.prisma.user.count({ where: { deletedAt: null } }),
      this.prisma.song.count({ where: { deletedAt: null } }),
      this.prisma.playlist.count({ where: { deletedAt: null } }),
      this.prisma.liveClip.count({ where: { status: 'PUBLISHED' } }),
      this.prisma.liveSession.count({
        where: { deletedAt: null, status: 'PUBLISHED' },
      }),
      this.prisma.playHistory.count({
        where: { playTime: { gte: startOfToday } },
      }),
      this.prisma.song.findMany({
        where: { deletedAt: null },
        orderBy: { plays: 'desc' },
        take: 10,
        select: {
          id: true,
          title: true,
          artist: true,
          coverUrl: true,
          plays: true,
        },
      }),
      // 热门歌切：按收藏数排序（LiveClip 无 plays 字段，用收藏数代理热度）
      this.prisma.liveClip.findMany({
        where: { status: 'PUBLISHED' },
        orderBy: { favorites: { _count: 'desc' } },
        take: 10,
        select: {
          id: true,
          title: true,
          artist: true,
          coverUrl: true,
          _count: { select: { favorites: true } },
        },
      }),
      this.fetchWeeklyTrend(),
    ]);

    return {
      totalUsers,
      totalSongs,
      totalPlaylists,
      totalLiveClips,
      totalLiveSessions,
      todayPlays,
      playTrend: trendRows,
      topSongs: topSongsRaw,
      topClips: topClipsRaw.map((c) => ({
        id: c.id,
        title: c.title,
        artist: c.artist,
        coverUrl: c.coverUrl,
        favoriteCount: c._count.favorites,
      })),
    };
  }

  /**
   * 最近 7 天每日播放数（按本地时区聚合，补齐缺失日期为 0）
   * 用 Prisma findMany 拉取 playTime 在 JS 里按本地日期聚合，
   * 彻底避免 SQLite datetime()/substr() 时区函数的兼容性问题
   */
  private async fetchWeeklyTrend(): Promise<
    { date: string; plays: number }[]
  > {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setHours(0, 0, 0, 0);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);

    // 只拉取 playTime 字段，7 天数据量可控
    const records = await this.prisma.playHistory.findMany({
      where: { playTime: { gte: sevenDaysAgo } },
      select: { playTime: true },
    });

    // 本地日期格式化（YYYY-MM-DD）
    const formatLocalDate = (d: Date): string => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    };

    // 按本地日期聚合
    const map = new Map<string, number>();
    for (const r of records) {
      const key = formatLocalDate(r.playTime);
      map.set(key, (map.get(key) ?? 0) + 1);
    }

    // 补齐 7 天日期（从 6 天前到今天）
    const trend: { date: string; plays: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      const key = formatLocalDate(d);
      trend.push({ date: key, plays: map.get(key) ?? 0 });
    }
    return trend;
  }

  /** 获取全部系统设置（返回扁平对象） */
  async getSettings() {
    const rows = await this.prisma.systemSetting.findMany();
    const obj: Record<string, string> = {};
    for (const row of rows) {
      obj[row.key] = row.value;
    }
    return {
      siteTitle: obj.siteTitle ?? '',
      logoUrl: obj.logoUrl ?? '',
      icp: obj.icp ?? '',
      copyright: obj.copyright ?? '',
      seoKeywords: obj.seoKeywords ?? '',
      seoDescription: obj.seoDescription ?? '',
      storageType: obj.storageType ?? 'local',
      bucket: obj.bucket ?? '',
      region: obj.region ?? '',
      secretId: obj.secretId ?? '',
      secretKey: obj.secretKey ?? '',
      sessionToken: obj.sessionToken ?? '',
      endpoint: obj.endpoint ?? '',
      publicDomain: obj.publicDomain ?? '',
      allowRegister: obj.allowRegister === 'true',
      defaultQuality: obj.defaultQuality ?? 'standard',
    };
  }

  /** 批量更新系统设置（接收扁平对象，转换为 key-value 存储） */
  async updateSettings(data: Record<string, unknown>) {
    const entries = Object.entries(data).filter(
      ([, v]) => v !== undefined && v !== null,
    );
    await this.prisma.$transaction(
      entries.map(([key, value]) =>
        this.prisma.systemSetting.upsert({
          where: { key },
          update: { value: String(value) },
          create: { key, value: String(value) },
        }),
      ),
    );
    this.storageConfigService.refresh();
    return this.getSettings();
  }
}
