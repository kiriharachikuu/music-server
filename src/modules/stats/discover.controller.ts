import { Controller, Get, Query } from '@nestjs/common';
import { StatsService } from './stats.service';

/**
 * 发现页控制器
 * 路由 GET /api/discover
 */
@Controller('discover')
export class DiscoverController {
  constructor(private readonly statsService: StatsService) {}

  /** GET /api/discover/daily-songs 随机单曲（默认 20） */
  @Get('daily-songs')
  dailySongs(@Query('limit') limit?: string) {
    const n = Math.max(1, Math.min(100, parseInt(limit ?? '20', 10) || 20));
    return this.statsService.getDailySongs(n);
  }

  /** GET /api/discover/daily-clips 随机歌切（默认 20） */
  @Get('daily-clips')
  dailyClips(@Query('limit') limit?: string) {
    const n = Math.max(1, Math.min(100, parseInt(limit ?? '20', 10) || 20));
    return this.statsService.getDailyClips(n);
  }

  /** GET /api/discover 发现页聚合数据 */
  @Get()
  discover() {
    return this.statsService.getDiscover();
  }
}
