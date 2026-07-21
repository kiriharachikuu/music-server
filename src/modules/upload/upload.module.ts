import { Global, Module } from '@nestjs/common';
import { AudioProcessService } from './audio-process.service';
import { DynamicStorageService } from './dynamic-storage.service';
import { StorageConfigService } from './storage-config.service';
import { STORAGE_SERVICE } from './storage.interface';
import { FileCleanupService } from './file-cleanup.service';

@Global()
@Module({
  providers: [
    StorageConfigService,
    {
      provide: STORAGE_SERVICE,
      useClass: DynamicStorageService,
    },
    AudioProcessService,
    FileCleanupService,
  ],
  exports: [STORAGE_SERVICE, AudioProcessService, StorageConfigService],
})
export class UploadModule {}
