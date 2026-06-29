import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateSettingsDto } from './dto/settings.dto';

/** 后台统计返回结构 */
export interface AdminStats {
  totalUsers: number;
  totalSongs: number;
  todayPlays: number;
  weeklyTrend: { date: string; count: number }[];
  topSongs: { id: string; title: string; plays: number }[];
}

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  /** 后台总览统计 */
  async getStats(): Promise<AdminStats> {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const [totalUsers, totalSongs, todayPlays, topSongs, weeklyRows] =
      await Promise.all([
        this.prisma.user.count({ where: { deletedAt: null } }),
        this.prisma.song.count({ where: { deletedAt: null } }),
        this.prisma.playHistory.count({
          where: { playTime: { gte: startOfToday } },
        }),
        this.prisma.song.findMany({
          where: { deletedAt: null },
          orderBy: { plays: 'desc' },
          take: 10,
          select: { id: true, title: true, plays: true },
        }),
        this.fetchWeeklyTrend(),
      ]);

    return {
      totalUsers,
      totalSongs,
      todayPlays,
      weeklyTrend: weeklyRows,
      topSongs,
    };
  }

  /** 最近 7 天每日播放数（补齐缺失日期为 0） */
  private async fetchWeeklyTrend(): Promise<
    { date: string; count: number }[]
  > {
    const raw = await this.prisma.$queryRaw`
      SELECT date_trunc('day', "playTime") AS day, COUNT(*)::int AS count
      FROM "PlayHistory"
      WHERE "playTime" >= date_trunc('day', NOW()) - INTERVAL '6 days'
      GROUP BY day
      ORDER BY day ASC
    `;
    const rows = raw as Array<{ day: Date; count: number }>;

    const trend: { date: string; count: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const matched = rows.find(
        (r) => new Date(r.day).toISOString().slice(0, 10) === key,
      );
      trend.push({ date: key, count: matched?.count ?? 0 });
    }
    return trend;
  }

  /** 获取全部系统设置 */
  async getSettings() {
    return this.prisma.systemSetting.findMany({
      orderBy: { key: 'asc' },
    });
  }

  /** 批量更新系统设置（不存在则创建） */
  async updateSettings(dto: UpdateSettingsDto) {
    await this.prisma.$transaction(
      dto.settings.map((item) =>
        this.prisma.systemSetting.upsert({
          where: { key: item.key },
          update: { value: item.value },
          create: { key: item.key, value: item.value },
        }),
      ),
    );
    return this.getSettings();
  }
}
