import { Module } from '@nestjs/common';
import { PlatformChangelogService } from './platform-changelog.service';
import { PlatformChangelogController } from './platform-changelog.controller';
import { AdminPlatformChangelogController } from './admin-platform-changelog.controller';

/** 平台 Web 端更新日志模块 */
@Module({
  controllers: [PlatformChangelogController, AdminPlatformChangelogController],
  providers: [PlatformChangelogService],
  exports: [PlatformChangelogService],
})
export class PlatformChangelogModule {}
