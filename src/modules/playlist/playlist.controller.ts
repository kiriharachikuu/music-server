import { Controller, Get, Param, Query } from '@nestjs/common';
import { PlaylistService } from './playlist.service';

/**
 * 歌单控制器（公开接口）
 * 路由前缀 /api/playlists
 */
@Controller('playlists')
export class PlaylistController {
  constructor(private readonly playlistService: PlaylistService) {}

  /** GET /api/playlists 公开歌单分页列表 */
  @Get()
  list(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.playlistService.list({ page, limit, pageSize });
  }

  /** GET /api/playlists/:id 歌单详情 */
  @Get(':id')
  getDetail(@Param('id') id: string) {
    return this.playlistService.getDetail(id);
  }
}
