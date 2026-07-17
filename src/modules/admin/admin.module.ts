import { Module } from '@nestjs/common';
import { AdminAlbumController } from './admin-album.controller';
import { AdminArtistController } from './admin-artist.controller';
import { AdminBannerController } from './admin-banner.controller';
import { AdminMigrationController } from './admin-migration.controller';
import { AdminPlaylistController } from './admin-playlist.controller';
import { AdminSettingController } from './admin-setting.controller';
import { AdminSongController } from './admin-song.controller';
import { AdminTagController } from './admin-tag.controller';
import { AdminUploadController } from './admin-upload.controller';
import { AdminUserController } from './admin-user.controller';
import { AdminController } from './admin.controller';
import { AdminResourceService } from './admin-resource.service';
import { AdminService } from './admin.service';
import { MigrationService } from './migration.service';
import { OperationLogModule } from '../operation-log/operation-log.module';
import { AdminLiveSessionController } from './admin-live-session.controller';
import { AdminLiveClipController } from './admin-live-clip.controller';
import { LiveSessionModule } from '../live-session/live-session.module';

/**
 * 后台管理模块
 * 全部接口需 JwtAuthGuard + RolesGuard(@Roles('ADMIN'))
 * StorageService 由全局 UploadModule 提供，直接注入
 * OperationLogModule 提供 OperationLogService，便于后续在管理服务中按需注入
 */
@Module({
  imports: [OperationLogModule, LiveSessionModule],
  controllers: [
    AdminController,
    AdminSongController,
    AdminTagController,
    AdminAlbumController,
    AdminArtistController,
    AdminPlaylistController,
    AdminBannerController,
    AdminUserController,
    AdminSettingController,
    AdminUploadController,
    AdminMigrationController,
    AdminLiveSessionController,
    AdminLiveClipController,
  ],
  providers: [AdminService, AdminResourceService, MigrationService],
})
export class AdminModule {}
