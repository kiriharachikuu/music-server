import { Body, Controller, Get, Query } from '@nestjs/common';
import { PlatformChangelogService } from './platform-changelog.service';

/**
 * 公开接口 - 平台 Web 端更新日志
 * 路由前缀 /api/platform-changelogs
 */
@Controller('platform-changelogs')
export class PlatformChangelogController {
  constructor(private readonly service: PlatformChangelogService) {}

  /**
   * 拉取已发布（status=published）更新日志，按 versionCode 倒序
   * ?limit=10 可选限制条数
   */
  @Get()
  list(@Query('limit') limit?: string) {
    return this.service.listPublic(limit ? Number(limit) : undefined);
  }

  /** 获取最新已发布版本 */
  @Get('latest')
  latest() {
    return this.service.getLatest();
  }
}
