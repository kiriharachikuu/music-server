import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { OperationLogService } from './operation-log.service';

/**
 * 后台操作日志查询控制器
 * 路由前缀 /api/admin/logs，仅 ADMIN 角色可访问
 */
@Controller('admin/logs')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class OperationLogController {
  constructor(private readonly operationLogService: OperationLogService) {}

  /**
   * 列表查询：GET /api/admin/logs
   * 支持 page / pageSize / action / userId / startDate / endDate
   */
  @Get()
  list(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('limit') limit?: string,
    @Query('action') action?: string,
    @Query('userId') userId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.operationLogService.listLogs({
      page,
      pageSize,
      limit,
      action,
      userId,
      startDate,
      endDate,
    });
  }
}
