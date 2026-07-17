import { Controller, Get, Param, Query } from '@nestjs/common';
import { LiveSessionService } from './live-session.service';

/**
 * 公开直播场次接口
 * 路由前缀 /api/live-sessions
 * 无需鉴权
 */
@Controller('live-sessions')
export class LiveSessionController {
  constructor(private readonly liveSessionService: LiveSessionService) {}

  /** GET /api/live-sessions?page=&limit= */
  @Get()
  list(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.liveSessionService.list({ page, limit, pageSize });
  }

  /** GET /api/live-sessions/:id */
  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.liveSessionService.findOne(id);
  }
}
