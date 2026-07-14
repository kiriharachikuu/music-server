import { ConfigService } from '@nestjs/config';
import { CosStorageService } from './cos-storage.service';
import { LocalStorageService } from './local-storage.service';
import { S3StorageService } from './s3-storage.service';
import { STORAGE_SERVICE } from './storage.interface';

export const storageFactory = {
  provide: STORAGE_SERVICE,
  inject: [ConfigService],
  useFactory: (config: ConfigService) => {
    const driver = (
      config.get<string>('storage.driver') || 'local'
    ).toLowerCase();
    if (driver === 'cos') {
      return new CosStorageService(config);
    }
    if (driver === 's3') {
      return new S3StorageService(config);
    }
    return new LocalStorageService(config);
  },
};
