import {
  Body,
  Controller,
  Get,
  Put,
  UseGuards,
} from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { AdminService } from './admin.service';
import { UpdateSettingsDto } from './dto/settings.dto';

/** 后台系统设置 路由前缀 /api/admin/settings */
@Controller('admin/settings')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminSettingController {
  constructor(private readonly adminService: AdminService) {}

  @Get()
  list() {
    return this.adminService.getSettings();
  }

  @Put()
  update(@Body() dto: UpdateSettingsDto) {
    return this.adminService.updateSettings(dto);
  }
}
