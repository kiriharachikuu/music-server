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
 * 提供发现页、9 档排行榜、站点公开设置接口
 *
 * 9 档 = 主体（综合/单曲/歌切）× 分类（飙升/热歌/新歌）
 *
 * - HotRankingService：热歌榜定时计算（每周一 00:00/00:05/00:10）
 * - SoarRankingService：飙升榜定时计算（每周一 00:15/00:20/00:25）
 * - NewRankingService：新歌榜（按 createdAt 倒序，10 分钟缓存）
 * - RankingPlaylistService：9 个系统歌单创建与同步
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
