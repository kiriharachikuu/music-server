import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { PlatformChangelogService } from './platform-changelog.service';
import { CreatePlatformChangelogDto } from './dto/create-platform-changelog.dto';
import { UpdatePlatformChangelogDto } from './dto/update-platform-changelog.dto';

/**
 * 后台管理 - 平台 Web 端更新日志
 * 路由前缀 /api/admin/platform-changelogs
 */
@Controller('admin/platform-changelogs')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminPlatformChangelogController {
  constructor(private readonly service: PlatformChangelogService) {}

  @Get()
  list(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
  ) {
    return this.service.list({ page, limit, status });
  }

  @Get(':id')
  detail(@Param('id') id: string) {
    return this.service.detail(id);
  }

  @Post()
  create(@Body() dto: CreatePlatformChangelogDto) {
    return this.service.create(dto);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdatePlatformChangelogDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
