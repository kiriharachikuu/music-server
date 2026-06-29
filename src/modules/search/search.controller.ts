import { Controller, Get, Query } from '@nestjs/common';
import { SearchService } from './search.service';

/**
 * 搜索控制器
 * 路由前缀 /api/search
 */
@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  /** GET /api/search?q=&sort=time|plays&tag=&page=&limit= */
  @Get()
  search(
    @Query('q') q?: string,
    @Query('sort') sort?: string,
    @Query('tag') tag?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.searchService.search({ q, sort, tag, page, limit, pageSize });
  }

  /** GET /api/search/hot 热门搜索词 */
  @Get('hot')
  hot() {
    return this.searchService.getHotKeywords();
  }
}
