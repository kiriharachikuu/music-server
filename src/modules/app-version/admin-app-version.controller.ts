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
import { AppVersionService } from './app-version.service';
import { CreateAppVersionDto } from './dto/create-app-version.dto';
import { UpdateAppVersionDto } from './dto/update-app-version.dto';

/**
 * 后台App版本管理
 * 路由前缀 /api/admin/app-versions
 */
@Controller('admin/app-versions')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminAppVersionController {
  constructor(private readonly appVersionService: AppVersionService) {}

  @Get()
  list(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('channel') channel?: string,
    @Query('platform') platform?: string,
  ) {
    return this.appVersionService.listVersions({ page, limit, channel, platform });
  }

  @Get(':id')
  detail(@Param('id') id: string) {
    return this.appVersionService.getVersion(id);
  }

  @Post()
  create(@Body() dto: CreateAppVersionDto) {
    return this.appVersionService.createVersion(dto);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateAppVersionDto) {
    return this.appVersionService.updateVersion(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.appVersionService.deleteVersion(id);
  }
}
