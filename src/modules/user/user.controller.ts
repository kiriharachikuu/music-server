import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AddSongsToPlaylistDto } from './dto/add-songs.dto';
import { CreatePlaylistDto } from './dto/create-playlist.dto';
import { FavoriteDto } from './dto/favorite.dto';
import { RecordHistoryDto } from './dto/history.dto';
import { UpdatePlaylistDto } from './dto/update-playlist.dto';
import { UserService } from './user.service';

/**
 * 用户接口控制器
 * 路由前缀 /api/user，全部需要 JWT 鉴权
 */
@Controller('user')
@UseGuards(JwtAuthGuard)
export class UserController {
  constructor(private readonly userService: UserService) {}

  /** GET /api/user/profile 当前用户资料 */
  @Get('profile')
  getProfile(@CurrentUser('id') userId: string) {
    return this.userService.getProfile(userId);
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
}
