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
import { CreateSongDto, UpdateSongDto } from './dto/song.dto';

/** 后台歌曲管理 路由前缀 /api/admin/songs */
@Controller('admin/songs')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminSongController {
  constructor(private readonly resource: AdminResourceService) {}

  @Get()
  list(
    @Query('keyword') keyword?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.resource.listSongs({ keyword, page, limit, pageSize });
  }

  @Post()
  create(@Body() dto: CreateSongDto) {
    return this.resource.createSong(dto);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateSongDto) {
    return this.resource.updateSong(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.resource.deleteSong(id);
  }
}
