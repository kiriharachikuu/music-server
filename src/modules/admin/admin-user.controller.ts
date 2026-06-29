import {
  Body,
  Controller,
  Get,
  Param,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { AdminResourceService } from './admin-resource.service';
import { UpdateUserRoleDto, UpdateUserStatusDto } from './dto/user-manage.dto';

/** 后台用户管理 路由前缀 /api/admin/users */
@Controller('admin/users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminUserController {
  constructor(private readonly resource: AdminResourceService) {}

  @Get()
  list(
    @Query('keyword') keyword?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.resource.listUsers({ keyword, page, limit, pageSize });
  }

  /** 设置用户角色：PUT /api/admin/users/:id/role */
  @Put(':id/role')
  updateRole(@Param('id') id: string, @Body() dto: UpdateUserRoleDto) {
    return this.resource.updateUserRole(id, dto.role);
  }

  /** 启用/禁用用户：PUT /api/admin/users/:id/status */
  @Put(':id/status')
  updateStatus(@Param('id') id: string, @Body() dto: UpdateUserStatusDto) {
    return this.resource.updateUserStatus(id, dto.disabled);
  }
}
