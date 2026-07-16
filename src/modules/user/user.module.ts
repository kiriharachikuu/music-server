import { Module } from '@nestjs/common';
import { OperationLogModule } from '../operation-log/operation-log.module';
import { UserController } from './user.controller';
import { UserService } from './user.service';

/**
 * 用户模块
 * 提供 /api/user 下全部接口（需 JWT 鉴权）
 */
@Module({
  imports: [OperationLogModule],
  controllers: [UserController],
  providers: [UserService],
  exports: [UserService],
})
export class UserModule {}
