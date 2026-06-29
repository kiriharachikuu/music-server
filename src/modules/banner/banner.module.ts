import { Module } from '@nestjs/common';
import { BannerController } from './banner.controller';
import { BannerService } from './banner.service';

/** Banner 模块 */
@Module({
  controllers: [BannerController],
  providers: [BannerService],
})
export class BannerModule {}
