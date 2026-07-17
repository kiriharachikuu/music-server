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
import { CreateAlbumDto, UpdateAlbumDto } from './dto/album.dto';

/** 后台专辑管理 路由前缀 /api/admin/albums */
@Controller('admin/albums')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'EDITOR')
export class AdminAlbumController {
  constructor(private readonly resource: AdminResourceService) {}

  @Get()
  list(
    @Query('keyword') keyword?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.resource.listAlbums({ keyword, page, limit, pageSize });
  }

  @Post()
  create(@Body() dto: CreateAlbumDto) {
    return this.resource.createAlbum(dto);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateAlbumDto) {
    return this.resource.updateAlbum(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.resource.deleteAlbum(id);
  }
}
