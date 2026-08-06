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

  /** GET /api/live-sessions?page=&limit=&sort=latest|oldest */
  @Get()
  list(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('pageSize') pageSize?: string,
    @Query('sort') sort?: string,
  ) {
    return this.liveSessionService.list({ page, limit, pageSize, sort });
  }

  /** GET /api/live-sessions/clips?sort=latest|oldest 歌切单曲列表 */
  @Get('clips')
  listClips(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('pageSize') pageSize?: string,
    @Query('sort') sort?: string,
  ) {
    return this.liveSessionService.listClips({ page, limit, pageSize, sort });
  }

  /** GET /api/live-sessions/:id */
  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.liveSessionService.findOne(id);
  }
}
