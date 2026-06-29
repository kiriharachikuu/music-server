import { Controller, Get } from '@nestjs/common';
import { BannerService } from './banner.service';

/**
 * Banner 控制器
 * 路由前缀 /api/banners
 */
@Controller('banners')
export class BannerController {
  constructor(private readonly bannerService: BannerService) {}

  /** GET /api/banners 首页轮播图列表 */
  @Get()
  list() {
    return this.bannerService.getVisibleBanners();
  }
}
