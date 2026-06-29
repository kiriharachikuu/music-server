import { Module } from '@nestjs/common';
import { AdminAlbumController } from './admin-album.controller';
import { AdminBannerController } from './admin-banner.controller';
import { AdminPlaylistController } from './admin-playlist.controller';
import { AdminSettingController } from './admin-setting.controller';
import { AdminSongController } from './admin-song.controller';
import { AdminTagController } from './admin-tag.controller';
import { AdminUploadController } from './admin-upload.controller';
import { AdminUserController } from './admin-user.controller';
import { AdminController } from './admin.controller';
import { AdminResourceService } from './admin-resource.service';
import { AdminService } from './admin.service';

/**
 * 后台管理模块
 * 全部接口需 JwtAuthGuard + RolesGuard(@Roles('ADMIN'))
 * StorageService 由全局 UploadModule 提供，直接注入
 */
@Module({
  controllers: [
    AdminController,
    AdminSongController,
    AdminTagController,
    AdminAlbumController,
    AdminPlaylistController,
    AdminBannerController,
    AdminUserController,
    AdminSettingController,
    AdminUploadController,
  ],
  providers: [AdminService, AdminResourceService],
})
export class AdminModule {}
