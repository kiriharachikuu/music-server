import { Controller, Get, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AppVersionService } from './app-version.service';

/**
 * 平台更新检查控制器（Android / PC 版本分离）
 * - GET /update/android?currentVersion=15   Android 端更新检查（versionCode 数值比较）
 * - GET /update/pc?currentVersion=1.4.3     PC 端更新检查（semver 比较）
 * 两平台各自独立取最新版本，互不影响
 * 路由前缀 /api/update
 */
@Controller('update')
export class PlatformUpdateController {
  constructor(private readonly appVersionService: AppVersionService) {}

  /**
   * GET /api/update/android Android 端检查更新
   * @param currentVersion 当前版本码（纯数字，必填）
   * @param channel 发布渠道 stable/beta（可选）
   * @param variant 发布形态 full/setup/portable（可选）
   */
  @Get('android')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  checkAndroid(
    @Query('currentVersion') currentVersion?: string,
    @Query('channel') channel?: string,
    @Query('variant') variant?: string,
  ) {
    return this.appVersionService.getPlatformLatestVersion(
      'android',
      currentVersion,
      channel,
      variant,
    );
  }

  /**
   * GET /api/update/pc PC 端检查更新
   * @param currentVersion 当前版本号（semver，必填）
   * @param channel 发布渠道 stable/beta（可选）
   * @param variant 发布形态 full/setup/portable（可选）
   */
  @Get('pc')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  checkPc(
    @Query('currentVersion') currentVersion?: string,
    @Query('channel') channel?: string,
    @Query('variant') variant?: string,
  ) {
    return this.appVersionService.getPlatformLatestVersion(
      'pc',
      currentVersion,
      channel,
      variant,
    );
  }
}
