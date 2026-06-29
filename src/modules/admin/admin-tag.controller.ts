import { Controller, Get, UseGuards } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { AdminResourceService } from './admin-resource.service';

/** 后台标签管理 路由前缀 /api/admin/tags */
@Controller('admin/tags')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminTagController {
  constructor(private readonly resource: AdminResourceService) {}

  @Get()
  list() {
    return this.resource.listTags();
  }
}
