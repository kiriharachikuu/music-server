import { Module } from '@nestjs/common';
import { DiscoverController } from './discover.controller';
import { RankingsController } from './rankings.controller';
import { SettingsController } from './settings.controller';
import { StatsService } from './stats.service';
import { HotRankingService } from './hot-ranking.service';
import { SoarRankingService } from './soar-ranking.service';

/**
 * 统计/聚合模块
 * 提供发现页、排行榜、站点公开设置接口
 * HotRankingService：热歌榜定时计算与缓存
 * SoarRankingService：飙升榜定时计算与缓存
 */
@Module({
  controllers: [DiscoverController, RankingsController, SettingsController],
  providers: [StatsService, HotRankingService, SoarRankingService],
})
export class StatsModule {}
