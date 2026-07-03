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
import { CreateBannerDto, UpdateBannerDto } from './dto/banner.dto';

/** 后台 Banner 管理 路由前缀 /api/admin/banners */
@Controller('admin/banners')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminBannerController {
  constructor(private readonly resource: AdminResourceService) {}

  @Get()
  list(@Query() query: { page?: string; limit?: string; pageSize?: string }) {
    return this.resource.listBanners(query);
  }

  @Post()
  create(@Body() dto: CreateBannerDto) {
    return this.resource.createBanner(dto);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateBannerDto) {
    return this.resource.updateBanner(id, dto);
  }

  /** PUT /api/admin/banners/:id/sort 排序（上移/下移） */
  @Put(':id/sort')
  sort(@Param('id') id: string, @Body() dto: { direction: 'up' | 'down' }) {
    return this.resource.sortBanner(id, dto.direction);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.resource.deleteBanner(id);
  }
}
