import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import * as path from 'path';
import { StorageService, UploadResult } from './storage.interface';

const COS = require('cos-nodejs-sdk-v5');

@Injectable()
export class CosStorageService implements StorageService {
  private readonly cos: any;
  private readonly bucket: string;
  private readonly region: string;

  constructor(config: ConfigService) {
    this.bucket = config.get<string>('storage.bucket') || '';
    this.region = config.get<string>('storage.region') || '';
    this.cos = new COS({
      SecretId: config.get<string>('storage.secretId') || '',
      SecretKey: config.get<string>('storage.secretKey') || '',
      SecurityToken: config.get<string>('storage.sessionToken') || undefined,
    });
  }

  async upload(
    file: Express.Multer.File,
    category: string,
  ): Promise<UploadResult> {
    const ym = this.currentYearMonth();
    const ext = path.extname(file.originalname) || '';
    const key = `${category}/${ym}/${randomUUID()}${ext}`;

    await new Promise<void>((resolve, reject) => {
      this.cos.putObject(
        {
          Bucket: this.bucket,
          Region: this.region,
          Key: key,
          Body: file.buffer,
          ContentType: file.mimetype,
        },
        (err: any) => {
          if (err) reject(err);
          else resolve();
        },
      );
    });

    return { url: this.getUrl(key), path: key };
  }

  async delete(key: string): Promise<void> {
    try {
      await new Promise<void>((resolve, reject) => {
        this.cos.deleteObject(
          {
            Bucket: this.bucket,
            Region: this.region,
            Key: key,
          },
          (err: any) => {
            if (err) reject(err);
            else resolve();
          },
        );
      });
    } catch {
    }
  }

  getUrl(key: string): string {
    return `https://${this.bucket}.cos.${this.region}.myqcloud.com/${key.replace(/^\/+/, '')}`;
  }

  async presign(key: string, expiresIn = 3600): Promise<string> {
    return new Promise((resolve, reject) => {
      this.cos.getObjectUrl(
        {
          Bucket: this.bucket,
          Region: this.region,
          Key: key,
          Expires: expiresIn,
        },
        (err: any, data: any) => {
          if (err) reject(err);
          else resolve(data.Url);
        },
      );
    });
  }

  extractPath(url: string): string {
    const clean = url.split('?')[0].split('#')[0];
    const base = `https://${this.bucket}.cos.${this.region}.myqcloud.com`;
    if (clean.startsWith(base)) {
      return clean.slice(base.length).replace(/^\/+/, '');
    }
    try {
      if (/^https?:\/\//i.test(clean)) {
        return new URL(clean).pathname.replace(/^\/+/, '');
      }
    } catch {
    }
    return clean.replace(/^\/+/, '');
  }

  private currentYearMonth(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }
}
