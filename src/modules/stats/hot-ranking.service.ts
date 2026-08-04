import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * 热歌榜服务
 *
 * 基于过去 7 天的 PlayHistory 播放量统计，自动排名前 50 歌曲。
 * - 每周一 00:00 定时计算并缓存结果到 SystemSetting 表
 * - 服务启动时若缓存不存在则立即计算一次
 * - 读取时返回缓存的 songId 列表，由 StatsService 查询歌曲详情
 */
@Injectable()
export class HotRankingService implements OnModuleInit {
  private readonly logger = new Logger(HotRankingService.name);
  private static readonly SETTING_KEY = 'hotRankingData';
  private static readonly TOP_N = 50;

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    // 启动时检查缓存是否存在，不存在则立即计算
    const cached = await this.readCache();
    if (!cached) {
      this.logger.log('热歌榜缓存不存在，启动时立即计算...');
      await this.computeAndCache();
    } else {
      this.logger.log(`热歌榜缓存已存在，计算时间：${cached.computedAt}`);
    }
  }

  /**
   * 每周一 00:00 执行
   * Cron 表达式：秒 分 时 日 月 周
   */
  @Cron('0 0 * * 1')
  async scheduledCompute() {
    this.logger.log('每周一定时任务：开始计算热歌榜...');
    await this.computeAndCache();
  }

  /**
   * 计算过去 7 天播放量前 50 的歌曲 ID 列表，并缓存到 SystemSetting
   */
  async computeAndCache(): Promise<string[]> {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    // 按歌曲分组统计过去 7 天的播放次数，取前 50
    const grouped = await this.prisma.playHistory.groupBy({
      by: ['songId'],
      where: { playTime: { gte: since } },
      _count: { _all: true },
      orderBy: { _count: { songId: 'desc' } },
      take: HotRankingService.TOP_N,
    });

    const songIds = grouped.map((g) => g.songId);

    // 缓存到 SystemSetting
    const payload = JSON.stringify({
      songIds,
      computedAt: new Date().toISOString(),
    });

    await this.prisma.systemSetting.upsert({
      where: { key: HotRankingService.SETTING_KEY },
      update: { value: payload },
      create: { key: HotRankingService.SETTING_KEY, value: payload },
    });

    this.logger.log(`热歌榜计算完成，共 ${songIds.length} 首`);

    // 同步更新热歌榜系统歌单（若存在）
    await this.syncToHotPlaylist(songIds);

    return songIds;
  }

  /**
   * 将计算结果同步到名为"热歌"的系统歌单，使歌单详情页也能展示
   */
  private async syncToHotPlaylist(songIds: string[]) {
    try {
      const hotPlaylist = await this.prisma.playlist.findFirst({
        where: {
          isSystem: true,
          name: { contains: '热歌' },
          deletedAt: null,
        },
      });

      if (!hotPlaylist) {
        this.logger.log('未找到热歌系统歌单，跳过同步');
        return;
      }

      // 删除旧关联
      await this.prisma.playlistSong.deleteMany({
        where: { playlistId: hotPlaylist.id },
      });

      // 写入新关联（按排名排序）
      if (songIds.length > 0) {
        await this.prisma.playlistSong.createMany({
          data: songIds.map((songId, index) => ({
            playlistId: hotPlaylist.id,
            songId,
            sort: index,
          })),
        });
      }

      this.logger.log(`热歌系统歌单已同步 ${songIds.length} 首`);
    } catch (err) {
      this.logger.error(`同步热歌系统歌单失败: ${err}`);
    }
  }

  /**
   * 读取缓存的热歌榜 songId 列表
   * 若缓存不存在则实时计算
   */
  async getCachedSongIds(): Promise<string[]> {
    const cached = await this.readCache();
    if (cached && cached.songIds.length > 0) {
      return cached.songIds;
    }
    // 缓存不存在或为空，实时计算
    this.logger.warn('热歌榜缓存为空，实时计算...');
    return this.computeAndCache();
  }

  /** 读取缓存原始数据 */
  private async readCache(): Promise<{ songIds: string[]; computedAt: string } | null> {
    const row = await this.prisma.systemSetting.findUnique({
      where: { key: HotRankingService.SETTING_KEY },
    });
    if (!row) return null;
    try {
      return JSON.parse(row.value);
    } catch {
      return null;
    }
  }
}
