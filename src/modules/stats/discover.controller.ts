import { Controller, Get } from '@nestjs/common';
import { StatsService } from './stats.service';

/**
 * 发现页控制器
 * 路由 GET /api/discover
 */
@Controller('discover')
export class DiscoverController {
  constructor(private readonly statsService: StatsService) {}

  @Get()
  discover() {
    return this.statsService.getDiscover();
  }
}
