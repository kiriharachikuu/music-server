import { Controller, Get } from '@nestjs/common';
import { StatsService } from './stats.service';

/**
 * 排行榜控制器
 * 路由 GET /api/rankings
 */
@Controller('rankings')
export class RankingsController {
  constructor(private readonly statsService: StatsService) {}

  @Get()
  rankings() {
    return this.statsService.getRankings();
  }
}
