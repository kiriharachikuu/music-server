import {
  Controller,
  Get,
  Query,
  Param,
  Head,
  UseGuards,
} from '@nestjs/common';
import { AppVersionService } from './app-version.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

/**
 * App版本控制器
 * - GET /latest 公开：版本检查可在登录前进行
 * - HEAD /download/:id 需登录：防止匿名刷下载量
 * 路由前缀 /api/app/version
 */
@Controller('app/version')
export class AppVersionController {
  constructor(private readonly appVersionService: AppVersionService) {}

  /**
   * GET /api/app/version/latest 检查最新版本
   * @param channel 发布渠道 stable/beta
   * @param platform 平台 android/ios/desktop
   * @param versionCode 当前版本号
   */
  @Get('latest')
  checkLatest(
    @Query('channel') channel?: string,
    @Query('platform') platform?: string,
    @Query('versionCode') versionCode?: string,
  ) {
    const code = versionCode ? parseInt(versionCode, 10) : undefined;
    return this.appVersionService.getLatestVersion(channel, platform, code);
  }

  /**
   * HEAD /api/app/version/download/:id 记录下载次数
   * 需登录鉴权，防止匿名调用刷下载量
   */
  @Head('download/:id')
  @UseGuards(JwtAuthGuard)
  async trackDownload(@Param('id') id: string) {
    await this.appVersionService.incrementDownloadCount(id);
    return { success: true };
  }
}
