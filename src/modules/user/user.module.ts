import { Module } from '@nestjs/common';
import { UserController } from './user.controller';
import { UserService } from './user.service';

/**
 * 用户模块
 * 提供 /api/user 下全部接口（需 JWT 鉴权）
 */
@Module({
  controllers: [UserController],
  providers: [UserService],
  exports: [UserService],
})
export class UserModule {}
