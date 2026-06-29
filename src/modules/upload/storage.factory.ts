import { ConfigService } from '@nestjs/config';
import { LocalStorageService } from './local-storage.service';
import { S3StorageService } from './s3-storage.service';
import { STORAGE_SERVICE } from './storage.interface';

/**
 * 存储服务工厂 Provider
 * 根据环境变量 STORAGE_DRIVER（local | s3）决定注入哪个实现
 * 如需运行时基于 SystemSetting 切换，可在应用启动后读取 DB 并重启注入
 */
export const storageFactory = {
  provide: STORAGE_SERVICE,
  inject: [ConfigService],
  useFactory: (config: ConfigService) => {
    const driver = (
      config.get<string>('storage.driver') || 'local'
    ).toLowerCase();
    return driver === 's3'
      ? new S3StorageService(config)
      : new LocalStorageService(config);
  },
};
