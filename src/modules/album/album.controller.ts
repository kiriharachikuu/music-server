import { Controller, Get, Param, Query } from '@nestjs/common';
import { AlbumService } from './album.service';

/**
 * 专辑控制器
 * 路由前缀 /api/albums
 */
@Controller('albums')
export class AlbumController {
  constructor(private readonly albumService: AlbumService) {}

  /** GET /api/albums 专辑分页列表 */
  @Get()
  list(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.albumService.list({ page, limit, pageSize });
  }

  /** GET /api/albums/:id 专辑详情 */
  @Get(':id')
  getDetail(@Param('id') id: string) {
    return this.albumService.getDetail(id);
  }
}
