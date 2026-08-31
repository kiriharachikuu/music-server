import { Controller, Get } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AppVersionService } from './app-version.service';

/**
 * 官网公共接口控制器（无需登录）
 * - GET /public/app-versions 一次性返回 Android / PC 两平台最新正式版
 * 供官网下载页展示；平台暂无版本时对应字段返回 null
 * 路由前缀 /api/public
 */
@Controller('public')
export class PublicAppVersionController {
  constructor(private readonly appVersionService: AppVersionService) {}

  /**
   * GET /api/public/app-versions 官网公共版本查询
   * 限流：60 秒最多 30 次；服务端内存缓存 60 秒
   */
  @Get('app-versions')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  getAppVersions() {
    return this.appVersionService.getPublicAppVersions();
  }
}
