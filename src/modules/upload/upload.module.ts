import { Global, Module } from '@nestjs/common';
import { storageFactory } from './storage.factory';
import { STORAGE_SERVICE } from './storage.interface';

/**
 * 上传 / 存储模块
 * 全局提供 StorageService（按配置注入 local 或 s3 实现）
 */
@Global()
@Module({
  providers: [storageFactory],
  exports: [STORAGE_SERVICE],
})
export class UploadModule {}
