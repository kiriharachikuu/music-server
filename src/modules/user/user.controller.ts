import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { STORAGE_SERVICE } from '../upload/storage.interface';
import type { StorageService } from '../upload/storage.interface';
import { AddSongsToPlaylistDto } from './dto/add-songs.dto';
import { CreatePlaylistDto } from './dto/create-playlist.dto';
import { FavoriteDto } from './dto/favorite.dto';
import { RecordHistoryDto } from './dto/history.dto';
import { UpdatePlaylistDto } from './dto/update-playlist.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UserService } from './user.service';

const IMAGE_MAX_SIZE = parseInt(process.env.UPLOAD_MAX_SIZE_IMAGE_MB || '10', 10) * 1024 * 1024;
const IMAGE_ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
const IMAGE_ALLOWED_EXT = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp']);

/**
 * 用户接口控制器
 * 路由前缀 /api/user，全部需要 JWT 鉴权
 */
@Controller('user')
@UseGuards(JwtAuthGuard)
export class UserController {
  constructor(
    private readonly userService: UserService,
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
  ) {}

  /** GET /api/user/profile 当前用户资料 */
  @Get('profile')
  getProfile(@CurrentUser('id') userId: string) {
    return this.userService.getProfile(userId);
  }

  /** PATCH /api/user/profile 更新昵称/头像 */
  @Patch('profile')
  @HttpCode(HttpStatus.OK)
  updateProfile(
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.userService.updateProfile(userId, dto);
  }

  /** POST /api/user/upload/avatar 上传用户头像（multipart, 字段名 file） */
  @Post('upload/avatar')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: IMAGE_MAX_SIZE },
    }),
  )
  async uploadAvatar(
    @CurrentUser('id') userId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    this.validateImage(file);
    return this.storage.upload(file, 'avatars', userId);
  }

  /** GET /api/user/favorites 收藏列表 */
  @Get('favorites')
  getFavorites(
    @CurrentUser('id') userId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.userService.getFavorites(userId, { page, limit, pageSize });
  }

  /** POST /api/user/favorites 切换收藏 */
  @Post('favorites')
  @HttpCode(HttpStatus.OK)
  toggleFavorite(@CurrentUser('id') userId: string, @Body() dto: FavoriteDto) {
    return this.userService.toggleFavorite(userId, dto.songId);
  }

  /** DELETE /api/user/favorites/:songId 取消收藏 */
  @Delete('favorites/:songId')
  @HttpCode(HttpStatus.OK)
  async removeFavorite(
    @CurrentUser('id') userId: string,
    @Param('songId') songId: string,
  ) {
    const result = await this.userService.toggleFavorite(userId, songId);
    return { ...result, favorited: false };
  }

  /** GET /api/user/songs/:songId/favorite 检查是否已收藏某首歌曲 */
  @Get('songs/:songId/favorite')
  checkSongFavorite(
    @CurrentUser('id') userId: string,
    @Param('songId') songId: string,
  ) {
    return this.userService
      .isSongFavorited(userId, songId)
      .then((favorited) => ({ favorited }));
  }

  /** GET /api/user/playlists 我的歌单 */
  @Get('playlists')
  getMyPlaylists(@CurrentUser('id') userId: string) {
    return this.userService.getMyPlaylists(userId);
  }

  /** POST /api/user/playlists 创建歌单 */
  @Post('playlists')
  createPlaylist(
    @CurrentUser('id') userId: string,
    @Body() dto: CreatePlaylistDto,
  ) {
    return this.userService.createPlaylist(userId, dto);
  }

  /** PUT /api/user/playlists/:id 更新歌单 */
  @Put('playlists/:id')
  updatePlaylist(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdatePlaylistDto,
  ) {
    return this.userService.updatePlaylist(userId, id, dto);
  }

  /** DELETE /api/user/playlists/:id 删除歌单 */
  @Delete('playlists/:id')
  deletePlaylist(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.userService.deletePlaylist(userId, id);
  }

  /** POST /api/user/playlists/:id/cover 上传歌单封面（multipart, 字段名 file） */
  @Post('playlists/:id/cover')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: IMAGE_MAX_SIZE },
    }),
  )
  async uploadPlaylistCover(
    @CurrentUser('id') userId: string,
    @Param('id') playlistId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    await this.userService.assertPlaylistOwned(userId, playlistId);
    this.validateImage(file);
    return this.storage.upload(file, 'playlists', playlistId);
  }

  /** POST /api/user/playlists/:id/songs 批量添加歌曲 */
  @Post('playlists/:id/songs')
  @HttpCode(HttpStatus.OK)
  addSongsToPlaylist(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: AddSongsToPlaylistDto,
  ) {
    return this.userService.addSongsToPlaylist(userId, id, dto.songIds);
  }

  /** DELETE /api/user/playlists/:id/songs/:songId 从歌单删除歌曲 */
  @Delete('playlists/:id/songs/:songId')
  @HttpCode(HttpStatus.OK)
  removeSongFromPlaylist(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Param('songId') songId: string,
  ) {
    return this.userService.removeSongFromPlaylist(userId, id, songId);
  }

  /** PUT /api/user/playlists/:id/songs/reorder 调整歌单歌曲顺序 */
  @Put('playlists/:id/songs/reorder')
  @HttpCode(HttpStatus.OK)
  reorderPlaylistSongs(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: { songIds: string[] },
  ) {
    return this.userService.reorderPlaylistSongs(userId, id, dto.songIds);
  }

  // ============ 专辑收藏 ============

  /** POST /api/user/albums/:id/favorite 切换专辑收藏 */
  @Post('albums/:id/favorite')
  @HttpCode(HttpStatus.OK)
  toggleAlbumFavorite(
    @CurrentUser('id') userId: string,
    @Param('id') albumId: string,
  ) {
    return this.userService.toggleAlbumFavorite(userId, albumId);
  }

  /** GET /api/user/albums/:id/favorite 检查是否已收藏专辑 */
  @Get('albums/:id/favorite')
  checkAlbumFavorite(
    @CurrentUser('id') userId: string,
    @Param('id') albumId: string,
  ) {
    return this.userService
      .isAlbumFavorited(userId, albumId)
      .then((favorited) => ({ favorited }));
  }

  // ============ 歌单收藏 ============

  /** POST /api/user/playlists/:id/favorite 切换歌单收藏 */
  @Post('playlists/:id/favorite')
  @HttpCode(HttpStatus.OK)
  togglePlaylistFavorite(
    @CurrentUser('id') userId: string,
    @Param('id') playlistId: string,
  ) {
    return this.userService.togglePlaylistFavorite(userId, playlistId);
  }

  /** GET /api/user/playlists/:id/favorite 检查是否已收藏歌单 */
  @Get('playlists/:id/favorite')
  checkPlaylistFavorite(
    @CurrentUser('id') userId: string,
    @Param('id') playlistId: string,
  ) {
    return this.userService
      .isPlaylistFavorited(userId, playlistId)
      .then((favorited) => ({ favorited }));
  }

  /** GET /api/user/history 播放历史 */
  @Get('history')
  getHistory(
    @CurrentUser('id') userId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.userService.getHistory(userId, { page, limit, pageSize });
  }

  /** POST /api/user/history 上报播放记录 */
  @Post('history')
  @HttpCode(HttpStatus.OK)
  recordHistory(
    @CurrentUser('id') userId: string,
    @Body() dto: RecordHistoryDto,
  ) {
    return this.userService.recordHistory(userId, dto.songId);
  }

  /** DELETE /api/user/history/:songId 删除单条播放历史 */
  @Delete('history/:songId')
  @HttpCode(HttpStatus.OK)
  deleteHistoryItem(
    @CurrentUser('id') userId: string,
    @Param('songId') songId: string,
  ) {
    return this.userService.deleteHistoryItem(userId, songId);
  }

  /** DELETE /api/user/history 清空全部播放历史 */
  @Delete('history')
  @HttpCode(HttpStatus.OK)
  clearHistory(@CurrentUser('id') userId: string) {
    return this.userService.clearHistory(userId);
  }

  /** GET /api/user/downloads 下载记录 */
  @Get('downloads')
  getDownloads(
    @CurrentUser('id') userId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.userService.getDownloads(userId, { page, limit, pageSize });
  }

  /** 校验上传的图片文件（大小、MIME、扩展名） */
  private validateImage(file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('文件不能为空');
    }
    if (file.size > IMAGE_MAX_SIZE) {
      const sizeMB = (IMAGE_MAX_SIZE / 1024 / 1024).toFixed(0);
      throw new BadRequestException(`文件过大，图片最大支持 ${sizeMB}MB`);
    }
    const mimeType = file.mimetype.toLowerCase();
    if (!IMAGE_ALLOWED_MIME.has(mimeType)) {
      throw new BadRequestException(
        `不支持的图片格式，允许：${Array.from(IMAGE_ALLOWED_EXT).join('、')}`,
      );
    }
    const ext = (file.originalname.slice(file.originalname.lastIndexOf('.')) || '').toLowerCase();
    if (!IMAGE_ALLOWED_EXT.has(ext)) {
      throw new BadRequestException(
        `不支持的图片扩展名，允许：${Array.from(IMAGE_ALLOWED_EXT).join('、')}`,
      );
    }
  }
}
