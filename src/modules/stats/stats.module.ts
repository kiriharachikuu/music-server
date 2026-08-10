import { Module } from '@nestjs/common';
import { DiscoverController } from './discover.controller';
import { RankingsController } from './rankings.controller';
import { SettingsController } from './settings.controller';
import { StatsService } from './stats.service';
import { HotRankingService } from './hot-ranking.service';
import { SoarRankingService } from './soar-ranking.service';
import { NewRankingService } from './new-ranking.service';
import { RankingPlaylistService } from './ranking-playlist.service';

/**
 * 统计/聚合模块
 * 提供发现页、3 档综合排行榜、站点公开设置接口
 *
 * 3 档 = 分类（飙升/热歌/新歌），均为"综合"（单曲 + 歌切混合排序）
 *
 * - HotRankingService：综合热歌榜定时计算（每周一 00:10）
 * - SoarRankingService：综合飙升榜定时计算（每周一 00:25）
 * - NewRankingService：综合新歌榜（按 createdAt 倒序，10 分钟缓存）
 * - RankingPlaylistService：3 个系统歌单创建与同步
 */
@Module({
  controllers: [DiscoverController, RankingsController, SettingsController],
  providers: [
    StatsService,
    HotRankingService,
    SoarRankingService,
    NewRankingService,
    RankingPlaylistService,
  ],
  exports: [
    StatsService,
    HotRankingService,
    SoarRankingService,
    NewRankingService,
    RankingPlaylistService,
  ],
})
export class StatsModule {}
