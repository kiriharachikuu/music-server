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
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { AdminResourceService } from './admin-resource.service';
import { CreatePlaylistDto, UpdatePlaylistDto } from './dto/playlist.dto';

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

  @Post()
  create(@Body() dto: CreatePlaylistDto) {
    return this.resource.createPlaylist(dto);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdatePlaylistDto) {
    return this.resource.updatePlaylist(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.resource.deletePlaylist(id);
  }
}
