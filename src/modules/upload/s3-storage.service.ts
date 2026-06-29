import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';
import * as path from 'path';
import { StorageService, UploadResult } from './storage.interface';

/**
 * S3 / 对象存储实现
 * 使用 @aws-sdk/client-s3 上传到 bucket，返回 CDN / 公开域名地址
 */
@Injectable()
export class S3StorageService implements StorageService {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly publicDomain: string;

  constructor(config: ConfigService) {
    this.bucket = config.get<string>('storage.s3.bucket') || '';
    this.publicDomain = config.get<string>('storage.s3.publicDomain') || '';
    this.client = new S3Client({
      region: config.get<string>('storage.s3.region') || undefined,
      endpoint: config.get<string>('storage.s3.endpoint') || undefined,
      credentials: {
        accessKeyId: config.get<string>('storage.s3.accessKey') || '',
        secretAccessKey: config.get<string>('storage.s3.secretKey') || '',
      },
    });
  }

  async upload(
    file: Express.Multer.File,
    category: string,
  ): Promise<UploadResult> {
    const ym = this.currentYearMonth();
    const ext = path.extname(file.originalname) || '';
    const key = `${category}/${ym}/${randomUUID()}${ext}`;
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
      }),
    );
    return { url: this.getUrl(key), path: key };
  }

  async delete(key: string): Promise<void> {
    try {
      await this.client.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
      );
    } catch {
      // 删除失败时忽略
    }
  }

  getUrl(key: string): string {
    const base =
      this.publicDomain || `https://${this.bucket}.s3.amazonaws.com`;
    return `${base.replace(/\/+$/, '')}/${key.replace(/^\/+/, '')}`;
  }

  private currentYearMonth(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }
}
