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

  @Get(':id')
  getDetail(@Param('id') id: string) {
    return this.artistService.getDetail(id);
  }
}