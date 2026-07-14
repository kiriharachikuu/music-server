import { Injectable } from '@nestjs/common';
import { StorageConfigService } from '../upload/storage-config.service';
import { PrismaService } from '../../prisma/prisma.service';

/** 后台统计返回结构 */
export interface AdminStats {
  totalUsers: number;
  totalSongs: number;
  totalPlaylists: number;
  todayPlays: number;
  playTrend: { date: string; plays: number }[];
  topSongs: {
    id: string;
    title: string;
    artist: string;
    coverUrl: string | null;
    plays: number;
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
      todayPlays,
      topSongsRaw,
      trendRows,
    ] = await Promise.all([
      this.prisma.user.count({ where: { deletedAt: null } }),
      this.prisma.song.count({ where: { deletedAt: null } }),
      this.prisma.playlist.count({ where: { deletedAt: null } }),
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
      this.fetchWeeklyTrend(),
    ]);

    return {
      totalUsers,
      totalSongs,
      totalPlaylists,
      todayPlays,
      playTrend: trendRows,
      topSongs: topSongsRaw,
    };
  }

  /** 最近 7 天每日播放数（补齐缺失日期为 0） */
  private async fetchWeeklyTrend(): Promise<
    { date: string; plays: number }[]
  > {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setHours(0, 0, 0, 0);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    const startStr = sevenDaysAgo.toISOString();

    const raw = await this.prisma.$queryRaw`
      SELECT strftime('%Y-%m-%d', "playTime") AS day, COUNT(*) as count
      FROM "PlayHistory"
      WHERE "playTime" >= ${startStr}
      GROUP BY day
      ORDER BY day ASC
    `;
    const rows = raw as Array<{ day: string; count: number }>;

    const trend: { date: string; plays: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const matched = rows.find((r) => r.day === key);
      trend.push({ date: key, plays: matched?.count ?? 0 });
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
