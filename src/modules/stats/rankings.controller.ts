import { Controller, Get, Query } from '@nestjs/common';
import { StatsService } from './stats.service';

/**
 * 排行榜控制器
 * 路由 GET /api/rankings?by=play|favorite
 * - by=play：按播放量（默认）
 * - by=favorite：按收藏量
 * - 其他值统一当作 play 处理
 */
@Controller('rankings')
export class RankingsController {
  constructor(private readonly statsService: StatsService) {}

  @Get()
  rankings(@Query('by') by?: string) {
    // 仅允许 'play' / 'favorite'，其他值统一当作 'play'
    const dimension =
      by === 'favorite' ? 'favorite' : 'play';
    return this.statsService.getRankings(dimension);
  }
}
