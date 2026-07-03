import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
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

  /**
   * 生成预签名下载 URL
   * 使用 @aws-sdk/s3-request-presigner 对 GetObjectCommand 签名
   * 默认有效期 3600 秒（1 小时），可通过 expiresIn 自定义
   */
  async presign(key: string, expiresIn = 3600): Promise<string> {
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    return getSignedUrl(this.client, command, { expiresIn });
  }

  /**
   * 从完整 URL 反向提取 S3 对象 Key
   * 与 getUrl 互逆：优先剥离已知 base 前缀，兜底解析 URL pathname
   */
  extractPath(url: string): string {
    const clean = url.split('?')[0].split('#')[0];
    const base = (
      this.publicDomain || `https://${this.bucket}.s3.amazonaws.com`
    ).replace(/\/+$/, '');
    if (clean.startsWith(base)) {
      return clean.slice(base.length).replace(/^\/+/, '');
    }
    // 兜底：path-style 或未知域名，取 URL pathname 作为 Key
    try {
      if (/^https?:\/\//i.test(clean)) {
        return new URL(clean).pathname.replace(/^\/+/, '');
      }
    } catch {
      // 忽略解析异常
    }
    return clean.replace(/^\/+/, '');
  }

  private currentYearMonth(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }
}
