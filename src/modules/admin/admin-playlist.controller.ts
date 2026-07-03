import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { AdminResourceService } from './admin-resource.service';
import {
  CreatePlaylistDto,
  UpdatePlaylistDto,
  UpdatePlaylistSongsDto,
} from './dto/playlist.dto';

/** 后台歌单管理 路由前缀 /api/admin/playlists */
@Controller('admin/playlists')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminPlaylistController {
  constructor(private readonly resource: AdminResourceService) {}

  @Get()
  list(
    @Query('keyword') keyword?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.resource.listPlaylists({ keyword, page, limit, pageSize });
  }

  /** GET /api/admin/playlists/:id 获取歌单详情（含歌曲） */
  @Get(':id')
  detail(@Param('id') id: string) {
    return this.resource.getPlaylistDetail(id);
  }

  @Post()
  create(@Body() dto: CreatePlaylistDto, @CurrentUser('id') userId: string) {
    // 未指定归属用户时，归属当前操作的管理员
    return this.resource.createPlaylist(dto, dto.userId || userId);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdatePlaylistDto) {
    return this.resource.updatePlaylist(id, dto);
  }

  /** PUT /api/admin/playlists/:id/songs 批量更新歌单歌曲 */
  @Put(':id/songs')
  updateSongs(
    @Param('id') id: string,
    @Body() dto: UpdatePlaylistSongsDto,
  ) {
    return this.resource.updatePlaylistSongs(id, dto.songIds);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.resource.deletePlaylist(id);
  }
}
