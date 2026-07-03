import { Module } from '@nestjs/common';
import { OperationLogController } from './operation-log.controller';
import { OperationLogService } from './operation-log.service';

/**
 * 操作日志模块
 * - 提供操作日志查询接口（/api/admin/logs）
 * - 导出 OperationLogService 供全局拦截器记录日志使用
 */
@Module({
  controllers: [OperationLogController],
  providers: [OperationLogService],
  exports: [OperationLogService],
})
export class OperationLogModule {}
