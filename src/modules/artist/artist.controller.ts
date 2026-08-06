import { Controller, Get, Param, Query } from '@nestjs/common';
import { ArtistService } from './artist.service';

@Controller('artists')
export class ArtistController {
  constructor(private readonly artistService: ArtistService) {}

  @Get()
  getList(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('sort') sort?: string,
  ) {
    return this.artistService.getList({
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 12,
      sort: (sort as 'latest' | 'hottest' | 'name') || 'latest',
    });
  }

  /** GET /api/artists/:id/songs 歌手单曲列表（分页 + 排序） */
  @Get(':id/songs')
  getSongs(
    @Param('id') id: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('pageSize') pageSize?: string,
    @Query('sort') sort?: string,
  ) {
    return this.artistService.getSongs(id, { page, limit, pageSize, sort });
  }

  /** GET /api/artists/:id/clips 歌手歌切列表（分页） */
  @Get(':id/clips')
  getClips(
    @Param('id') id: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.artistService.getClips(id, { page, limit, pageSize });
  }

  @Get(':id')
  getDetail(@Param('id') id: string) {
    return this.artistService.getDetail(id);
  }
}