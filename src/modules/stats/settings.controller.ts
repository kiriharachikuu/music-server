import { Controller, Get } from '@nestjs/common';
import { StatsService } from './stats.service';

/**
 * 站点公开设置控制器
 * 路由 GET /api/settings/site
 */
@Controller('settings')
export class SettingsController {
  constructor(private readonly statsService: StatsService) {}

  @Get('site')
  site() {
    return this.statsService.getSiteSettings();
  }
}
