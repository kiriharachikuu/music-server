import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageConfigService } from '../upload/storage-config.service';
import * as fs from 'fs/promises';
import * as path from 'path';
import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
const COS = require('cos-nodejs-sdk-v5');

export type MigrationStatus = 'idle' | 'running' | 'completed' | 'failed';

export interface MigrationProgress {
  status: MigrationStatus;
  total: number;
  processed: number;
  migrated: number;
  failed: number;
  skipped: number;
  dbUpdated: number;
  logs: string[];
  startedAt?: string;
  finishedAt?: string;
  error?: string;
}

const URL_FIELDS = [
  { model: 'song', field: 'fileUrl' },
  { model: 'song', field: 'coverUrl' },
  { model: 'song', field: 'lyricUrl' },
  { model: 'album', field: 'cover' },
  { model: 'artist', field: 'avatar' },
  { model: 'playlist', field: 'cover' },
  { model: 'banner', field: 'imageUrl' },
  { model: 'user', field: 'avatar' },
  { model: 'appVersion', field: 'downloadUrl' },
];

@Injectable()
export class MigrationService {
  private progress: MigrationProgress = {
    status: 'idle',
    total: 0,
    processed: 0,
    migrated: 0,
    failed: 0,
    skipped: 0,
    dbUpdated: 0,
    logs: [],
  };
  private cancelRequested = false;

  constructor(
    private readonly storageConfig: StorageConfigService,
    private readonly prisma: PrismaService,
  ) {}

  getProgress(): MigrationProgress {
    return { ...this.progress };
  }

  async start(): Promise<MigrationProgress> {
    if (this.progress.status === 'running') {
      return this.progress;
    }

    this.progress = {
      status: 'running',
      total: 0,
      processed: 0,
      migrated: 0,
      failed: 0,
      skipped: 0,
      dbUpdated: 0,
      logs: [],
      startedAt: new Date().toISOString(),
    };
    this.cancelRequested = false;

    void this.runMigration().catch((err: unknown) => {
      this.progress.status = 'failed';
      this.progress.error = err instanceof Error ? err.message : String(err);
      this.progress.finishedAt = new Date().toISOString();
      this.log(`迁移异常：${err instanceof Error ? err.message : String(err)}`);
    });
    return this.progress;
  }

  cancel(): void {
    if (this.progress.status === 'running') {
      this.cancelRequested = true;
      this.log('收到取消请求，将在当前文件处理完成后停止...');
    }
  }

  private log(message: string): void {
    const timestamp = new Date().toLocaleTimeString();
    this.progress.logs.push(`[${timestamp}] ${message}`);
    if (this.progress.logs.length > 200) {
      this.progress.logs = this.progress.logs.slice(-200);
    }
  }

  private async walk(dir: string): Promise<string[]> {
    let results: string[] = [];
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch (e) {
      return results;
    }
    for (const entry of entries as any[]) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results = results.concat(await this.walk(full));
      } else if (entry.isFile()) {
        results.push(full);
      }
    }
    return results;
  }

  private guessContentType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const map: Record<string, string> = {
      '.mp3': 'audio/mpeg', '.flac': 'audio/flac', '.wav': 'audio/wav',
      '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.ogg': 'audio/ogg',
      '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
      '.gif': 'image/gif', '.webp': 'image/webp', '.lrc': 'text/plain',
      '.txt': 'text/plain', '.apk': 'application/vnd.android.package-archive',
    };
    return map[ext] || 'application/octet-stream';
  }

  private async createStorageClient(): Promise<any> {
    const cfg = await this.storageConfig.getConfig();
    const { driver, bucket, region, secretId, secretKey, sessionToken, endpoint, publicDomain } = cfg;

    if (driver === 'cos') {
      const cos = new COS({
        SecretId: secretId,
        SecretKey: secretKey,
        SecurityToken: sessionToken || undefined,
      });
      return {
        type: 'cos',
        bucket,
        region,
        putObject: (params: any) => new Promise((resolve, reject) => {
          cos.putObject({ Bucket: bucket, Region: region, ...params }, (err: any, data: any) => {
            if (err) reject(err);
            else resolve(data);
          });
        }),
        headObject: (params: any) => new Promise((resolve, reject) => {
          cos.headObject({ Bucket: bucket, Region: region, ...params }, (err: any, data: any) => {
            if (err) reject(err);
            else resolve(data);
          });
        }),
        getUrl: (key: string) =>
          `https://${bucket}.cos.${region}.myqcloud.com/${key.replace(/^\/+/, '')}`,
      };
    }

    const s3 = new S3Client({
      region: region || undefined,
      endpoint: endpoint || undefined,
      credentials: {
        accessKeyId: secretId,
        secretAccessKey: secretKey,
        ...(sessionToken ? { sessionToken } : {}),
      },
    });
    return {
      type: 's3',
      bucket,
      region,
      putObject: (params: any) => s3.send(new PutObjectCommand({ Bucket: bucket, ...params })),
      headObject: (params: any) => s3.send(new HeadObjectCommand({ Bucket: bucket, ...params })),
      getUrl: (key: string) => {
        const base = publicDomain || `https://${bucket}.s3.amazonaws.com`;
        return `${base.replace(/\/+$/, '')}/${key.replace(/^\/+/, '')}`;
      },
    };
  }

  private async updateDbReferences(localUrl: string, s3Url: string): Promise<number> {
    let total = 0;
    for (const { model, field } of URL_FIELDS) {
      try {
        const result = await (this.prisma as any)[model].updateMany({
          where: { [field]: { contains: localUrl } },
          data: { [field]: s3Url },
        });
        total += result.count || 0;
      } catch (e: any) {
        this.log(`  数据库更新失败 [${model}.${field}]：${e.message}`);
      }
    }
    return total;
  }

  private async runMigration(): Promise<void> {
    const cfg = await this.storageConfig.getConfig();
    const { driver } = cfg;

    try {
      if (driver === 'local') {
        throw new Error('当前存储驱动为 local，请先在设置中切换到 s3 或 cos');
      }

      const localRoot = path.resolve(
        process.cwd(),
        cfg.localStoragePath || './uploads',
      );

      this.log(`本地目录：${localRoot}`);
      this.log(`目标驱动：${driver.toUpperCase()}`);
      this.log('扫描文件中...');

      const files = await this.walk(localRoot);
      this.progress.total = files.length;
      this.log(`发现 ${files.length} 个文件，开始迁移...`);

      if (files.length === 0) {
        this.progress.status = 'completed';
        this.progress.finishedAt = new Date().toISOString();
        this.log('本地目录为空，无需迁移。');
        return;
      }

      const storage = await this.createStorageClient();
      const urlPrefix = '/uploads';

      for (let i = 0; i < files.length; i++) {
        if (this.cancelRequested) {
          this.log(`迁移已取消，停止在第 ${i}/${files.length} 个文件`);
          this.progress.status = 'failed';
          this.progress.error = '用户取消';
          this.progress.finishedAt = new Date().toISOString();
          return;
        }

        const absPath = files[i];
        const filename = path.basename(absPath);
        const relPath = path.relative(localRoot, absPath).split(path.sep).join('/');
        const key = relPath;
        const s3Url = storage.getUrl(key);
        const localUrl = `${urlPrefix}/${relPath}`;

        this.progress.processed = i + 1;

        try {
          const body = await fs.readFile(absPath);

          let alreadyExists = false;
          try {
            const head = await storage.headObject({ Key: key });
            const size = head.ContentLength ?? head['content-length'];
            if (size !== undefined && size === body.length) {
              alreadyExists = true;
            }
          } catch {}

          if (!alreadyExists) {
            await storage.putObject({
              Key: key,
              Body: body,
              ContentType: this.guessContentType(absPath),
            });
          }

          const dbUpdated = await this.updateDbReferences(localUrl, s3Url);
          this.progress.dbUpdated += dbUpdated;
          this.progress.migrated++;

          const msg = `[${i + 1}/${files.length}] ${filename} - 成功${alreadyExists ? '（已存在，跳过）' : ''}${dbUpdated > 0 ? `（DB ${dbUpdated}）` : ''}`;
          this.log(msg);
        } catch (e: any) {
          this.progress.failed++;
          this.log(`[${i + 1}/${files.length}] ${filename} - 失败：${e.message}`);
        }
      }

      this.progress.status = 'completed';
      this.progress.finishedAt = new Date().toISOString();
      this.log(`迁移完成：成功 ${this.progress.migrated}，失败 ${this.progress.failed}，数据库更新 ${this.progress.dbUpdated}`);
    } catch (e: any) {
      this.progress.status = 'failed';
      this.progress.error = e.message;
      this.progress.finishedAt = new Date().toISOString();
      this.log(`迁移失败：${e.message}`);
    }
  }
}
