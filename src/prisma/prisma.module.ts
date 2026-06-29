import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/**
 * 全局 Prisma 模块，导出 PrismaService 供全应用注入
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
