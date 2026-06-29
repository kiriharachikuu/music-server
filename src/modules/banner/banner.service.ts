import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class BannerService {
  constructor(private readonly prisma: PrismaService) {}

  /** 获取首页 Banner：仅可见项，按 sort 升序 */
  async getVisibleBanners() {
    return this.prisma.banner.findMany({
      where: { status: 'VISIBLE' },
      orderBy: { sort: 'asc' },
    });
  }
}
