import {
  Controller,
  Get,
  Query,
  Param,
  Head,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { AppVersionService } from './app-version.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

/**
 * App版本控制器
 * - GET  /latest          公开：版本检查可在登录前进行
 * - GET  /list            公开：历史版本列表（下载页用）
 * - GET  /download/:id    公开：302 计数跳转（匿名下载也计入统计）
 * - HEAD /download/:id    需登录：旧版上报入口（保留兼容）
 * 路由前缀 /api/app/version
 */
@Controller('app/version')
export class AppVersionController {
  constructor(private readonly appVersionService: AppVersionService) {}

  /**
   * GET /api/app/version/latest 检查最新版本
   * @param channel 发布渠道 stable/beta
   * @param platform 平台 android/windows/ios（兼容旧值 desktop）
   * @param versionCode 当前版本号
   * @param variant 发布形态 full/setup/portable（可选）
   */
  @Get('latest')
  checkLatest(
    @Query('channel') channel?: string,
    @Query('platform') platform?: string,
    @Query('versionCode') versionCode?: string,
    @Query('variant') variant?: string,
  ) {
    const code = versionCode ? parseInt(versionCode, 10) : undefined;
    return this.appVersionService.getLatestVersion(
      channel,
      platform,
      code,
      variant,
    );
  }

  /**
   * GET /api/app/version/list 公开历史版本列表
   * 限制：60 秒最多 30 次
   */
  @Get('list')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  listVersions(
    @Query('platform') platform?: string,
    @Query('channel') channel?: string,
    @Query('variant') variant?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.appVersionService.listPublicVersions({
      platform,
      channel,
      variant,
      page,
      limit,
      pageSize,
    });
  }

  /**
   * GET /api/app/version/download/:id 下载 302 跳转
   * 服务端计数 +1 后重定向到真实下载地址，匿名下载同样计入统计
   */
  @Get('download/:id')
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  async download(@Param('id') id: string, @Res() res: Response) {
    const url = await this.appVersionService.trackAndResolveDownload(id);
    return res.redirect(302, url);
  }

  /**
   * HEAD /api/app/version/download/:id 旧版下载计数上报
   * 需登录鉴权，防止匿名调用刷下载量（保留向后兼容）
   */
  @Head('download/:id')
  @UseGuards(JwtAuthGuard)
  async trackDownload(@Param('id') id: string) {
    await this.appVersionService.incrementDownloadCount(id);
    return { success: true };
  }
}
