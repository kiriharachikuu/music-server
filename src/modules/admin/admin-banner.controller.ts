import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
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
  list() {
    return this.resource.listBanners();
  }

  @Post()
  create(@Body() dto: CreateBannerDto) {
    return this.resource.createBanner(dto);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateBannerDto) {
    return this.resource.updateBanner(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.resource.deleteBanner(id);
  }
}
