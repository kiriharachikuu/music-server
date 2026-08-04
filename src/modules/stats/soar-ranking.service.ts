import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * 飙升榜服务
 *
 * 对比最近 7 天和之前 7 天的播放量增长，按增长量降序排名前 50 歌曲。
 * - 每周一 00:05 执行（错开热歌榜 00:00 避免并发压力）
 * - 服务启动时若缓存不存在则立即计算一次
 * - 读取时返回缓存的 songId 列表，由 StatsService 查询歌曲详情
 */
@Injectable()
export class SoarRankingService implements OnModuleInit {
  private readonly logger = new Logger(SoarRankingService.name);
  private static readonly SETTING_KEY = 'soarRankingData';
  private static readonly TOP_N = 50;

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    const cached = await this.readCache();
    if (!cached) {
      this.logger.log('飙升榜缓存不存在，启动时立即计算...');
      await this.computeAndCache();
    } else {
      this.logger.log(`飙升榜缓存已存在，计算时间：${cached.computedAt}`);
    }
  }

  /**
   * 每周一 00:05 执行（错开热歌榜避免并发）
   */
  @Cron('5 0 * * 1')
  async scheduledCompute() {
    this.logger.log('每周一定时任务：开始计算飙升榜...');
    await this.computeAndCache();
  }

  /**
   * 计算播放量增长最快的前 50 歌曲 ID 列表，并缓存到 SystemSetting
   *
   * 算法：对比最近 7 天（本周）和之前 7 天（上周）的播放次数，
   * 按增长量（本周 - 上周）降序排序，只取增长量 > 0 的歌曲。
   */
  async computeAndCache(): Promise<string[]> {
    const now = Date.now();
    const weekMs = 7 * 24 * 60 * 60 * 1000;
    const thisWeekStart = new Date(now - weekMs);
    const lastWeekStart = new Date(now - 2 * weekMs);

    // 并行查询本周和上周的播放统计
    const [thisWeek, lastWeek] = await Promise.all([
      this.prisma.playHistory.groupBy({
        by: ['songId'],
        where: { playTime: { gte: thisWeekStart } },
        _count: { _all: true },
      }),
      this.prisma.playHistory.groupBy({
        by: ['songId'],
        where: {
          playTime: { gte: lastWeekStart, lt: thisWeekStart },
        },
        _count: { _all: true },
      }),
    ]);

    const lastWeekMap = new Map(lastWeek.map((g) => [g.songId, g._count._all]));

    // 计算增长量并排序
    const growth = thisWeek
      .map((g) => ({
        songId: g.songId,
        growth: g._count._all - (lastWeekMap.get(g.songId) ?? 0),
      }))
      .filter((g) => g.growth > 0)
      .sort((a, b) => b.growth - a.growth)
      .slice(0, SoarRankingService.TOP_N);

    const songIds = growth.map((g) => g.songId);

    // 缓存到 SystemSetting
    const payload = JSON.stringify({
      songIds,
      computedAt: new Date().toISOString(),
    });

    await this.prisma.systemSetting.upsert({
      where: { key: SoarRankingService.SETTING_KEY },
      update: { value: payload },
      create: { key: SoarRankingService.SETTING_KEY, value: payload },
    });

    this.logger.log(`飙升榜计算完成，共 ${songIds.length} 首`);

    // 同步到飙升系统歌单（若存在）
    await this.syncToSoarPlaylist(songIds);

    return songIds;
  }

  /**
   * 将计算结果同步到名为"飙升"的系统歌单
   */
  private async syncToSoarPlaylist(songIds: string[]) {
    try {
      const playlist = await this.prisma.playlist.findFirst({
        where: {
          isSystem: true,
          name: { contains: '飙升' },
          deletedAt: null,
        },
      });

      if (!playlist) {
        this.logger.log('未找到飙升系统歌单，跳过同步');
        return;
      }

      await this.prisma.playlistSong.deleteMany({
        where: { playlistId: playlist.id },
      });

      if (songIds.length > 0) {
        await this.prisma.playlistSong.createMany({
          data: songIds.map((songId, index) => ({
            playlistId: playlist.id,
            songId,
            sort: index,
          })),
        });
      }

      this.logger.log(`飙升系统歌单已同步 ${songIds.length} 首`);
    } catch (err) {
      this.logger.error(`同步飙升系统歌单失败: ${err}`);
    }
  }

  /**
   * 读取缓存的飙升榜 songId 列表
   * 若缓存不存在则实时计算
   */
  async getCachedSongIds(): Promise<string[]> {
    const cached = await this.readCache();
    if (cached && cached.songIds.length > 0) {
      return cached.songIds;
    }
    this.logger.warn('飙升榜缓存为空，实时计算...');
    return this.computeAndCache();
  }

  private async readCache(): Promise<{ songIds: string[]; computedAt: string } | null> {
    const row = await this.prisma.systemSetting.findUnique({
      where: { key: SoarRankingService.SETTING_KEY },
    });
    if (!row) return null;
    try {
      return JSON.parse(row.value);
    } catch {
      return null;
    }
  }
}
