import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';

export interface StorageRuntimeConfig {
  driver: 'local' | 's3' | 'cos';
  localStoragePath: string;
  bucket: string;
  region: string;
  secretId: string;
  secretKey: string;
  sessionToken: string;
  endpoint: string;
  publicDomain: string;
}

@Injectable()
export class StorageConfigService {
  private cache: StorageRuntimeConfig | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async getConfig(): Promise<StorageRuntimeConfig> {
    if (this.cache) return this.cache;
    this.cache = await this.loadFromDb();
    return this.cache;
  }

  refresh(): void {
    this.cache = null;
  }

  private async loadFromDb(): Promise<StorageRuntimeConfig> {
    const envDriver = (
      this.configService.get<string>('storage.driver') || 'local'
    ).toLowerCase() as 'local' | 's3' | 'cos';

    let driver = envDriver;
    let bucket = this.configService.get<string>('storage.bucket') || '';
    let region = this.configService.get<string>('storage.region') || '';
    let secretId = this.configService.get<string>('storage.secretId') || '';
    let secretKey = this.configService.get<string>('storage.secretKey') || '';
    let sessionToken = this.configService.get<string>('storage.sessionToken') || '';
    let endpoint = this.configService.get<string>('storage.endpoint') || '';
    let publicDomain = this.configService.get<string>('storage.publicDomain') || '';

    try {
      const rows = await this.prisma.systemSetting.findMany({
        where: {
          key: {
            in: [
              'storageType',
              'bucket',
              'region',
              'secretId',
              'secretKey',
              'sessionToken',
              'endpoint',
              'publicDomain',
            ],
          },
        },
      });
      const obj: Record<string, string> = {};
      for (const row of rows) {
        obj[row.key] = row.value;
      }

      if (obj.storageType && ['local', 's3', 'cos'].includes(obj.storageType)) {
        driver = obj.storageType as 'local' | 's3' | 'cos';
      }
      if (obj.bucket !== undefined) bucket = obj.bucket;
      if (obj.region !== undefined) region = obj.region;
      if (obj.secretId !== undefined) secretId = obj.secretId;
      if (obj.secretKey !== undefined) secretKey = obj.secretKey;
      if (obj.sessionToken !== undefined) sessionToken = obj.sessionToken;
      if (obj.endpoint !== undefined) endpoint = obj.endpoint;
      if (obj.publicDomain !== undefined) publicDomain = obj.publicDomain;
    } catch {
    }

    return {
      driver,
      localStoragePath:
        this.configService.get<string>('storage.localStoragePath') || './uploads',
      bucket,
      region,
      secretId,
      secretKey,
      sessionToken,
      endpoint,
      publicDomain,
    };
  }
}
