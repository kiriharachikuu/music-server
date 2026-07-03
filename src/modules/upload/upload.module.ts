import { Global, Module } from '@nestjs/common';
import { AudioProcessService } from './audio-process.service';
import { storageFactory } from './storage.factory';
import { STORAGE_SERVICE } from './storage.interface';

/**
 * 上传 / 存储模块
 * 全局提供 StorageService（按配置注入 local 或 s3 实现）
 * 同时全局提供 AudioProcessService（音频元数据探测 + 文件名解析）
 */
@Global()
@Module({
  providers: [storageFactory, AudioProcessService],
  exports: [STORAGE_SERVICE, AudioProcessService],
})
export class UploadModule {}
