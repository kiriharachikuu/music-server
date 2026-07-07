import { Controller, Get, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { Throttle } from '@nestjs/throttler';
import { SearchService } from './search.service';

/**
 * 搜索控制器
 * 路由前缀 /api/search
 */
@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  /** GET /api/search?q=&sort=time|plays&tag=&startDate=&endDate=&page=&limit=  限制：60秒最多30次 */
  @Get()
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  search(
    @Req() req: Request,
    @Query('q') q?: string,
    @Query('sort') sort?: string,
    @Query('tag') tag?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.searchService.search({
      q,
      sort,
      tag,
      startDate,
      endDate,
      page,
      limit,
      pageSize,
      ip: req.ip,
    });
  }

  /** GET /api/search/hot 热门搜索词 */
  @Get('hot')
  hot() {
    return this.searchService.getHotKeywords();
  }
}
