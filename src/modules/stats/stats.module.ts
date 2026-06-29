import { Module } from '@nestjs/common';
import { DiscoverController } from './discover.controller';
import { RankingsController } from './rankings.controller';
import { SettingsController } from './settings.controller';
import { StatsService } from './stats.service';

/**
 * 统计/聚合模块
 * 提供发现页、排行榜、站点公开设置接口
 */
@Module({
  controllers: [DiscoverController, RankingsController, SettingsController],
  providers: [StatsService],
})
export class StatsModule {}
