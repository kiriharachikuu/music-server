import {
  Body,
  Controller,
  Get,
  Param,
  Put,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { AdminResourceService } from './admin-resource.service';
import {
  UpdateUserRoleDto,
  UpdateUserStatusDto,
  UpdateUserDto,
  BatchUserIdsDto,
} from './dto/user-manage.dto';

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
    @Query('includeDisabled') includeDisabled?: string,
  ) {
    return this.resource.listUsers({ keyword, page, limit, pageSize, includeDisabled });
  }

  @Put(':id/role')
  updateRole(@Param('id') id: string, @Body() dto: UpdateUserRoleDto) {
    return this.resource.updateUserRole(id, dto.role);
  }

  @Put(':id/status')
  updateStatus(@Param('id') id: string, @Body() dto: UpdateUserStatusDto) {
    return this.resource.updateUserStatus(id, dto.disabled);
  }

  @Patch(':id')
  updateUser(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.resource.updateUser(id, dto);
  }

  @Post('batch/status')
  batchUpdateStatus(@Body() dto: BatchUserIdsDto & { disabled: boolean }) {
    return this.resource.batchUpdateUserStatus(dto.ids, dto.disabled);
  }

  @Post('batch/role')
  batchUpdateRole(@Body() dto: BatchUserIdsDto & { role: 'USER' | 'ADMIN' }) {
    return this.resource.batchUpdateUserRole(dto.ids, dto.role);
  }
}
