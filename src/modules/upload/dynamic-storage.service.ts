import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
const COS = require('cos-nodejs-sdk-v5');
import {
  StorageService,
  UploadResult,
} from './storage.interface';
import {
  StorageConfigService,
  StorageRuntimeConfig,
} from './storage-config.service';

interface StorageClient {
  upload(
    file: Express.Multer.File,
    category: string,
    subPath?: string,
  ): Promise<UploadResult>;
  delete(key: string): Promise<void>;
  getUrl(key: string): string;
  presign(key: string, expiresIn?: number): Promise<string>;
  extractPath(url: string): string;
}

@Injectable()
export class DynamicStorageService implements StorageService {
  private currentDriver = '';
  private client: StorageClient | null = null;
  private configFingerprint = '';

  constructor(
    private readonly storageConfigService: StorageConfigService,
    private readonly configService: ConfigService,
  ) {}

  private async getClient(): Promise<StorageClient> {
    const cfg = await this.storageConfigService.getConfig();
    const fingerprint = JSON.stringify(cfg);

    if (this.client && this.configFingerprint === fingerprint) {
      return this.client;
    }

    this.client = this.createClient(cfg);
    this.configFingerprint = fingerprint;
    this.currentDriver = cfg.driver;
    return this.client;
  }

  private createClient(cfg: StorageRuntimeConfig): StorageClient {
    if (cfg.driver === 'cos') {
      return this.createCosClient(cfg);
    }
    if (cfg.driver === 's3') {
      return this.createS3Client(cfg);
    }
    return this.createLocalClient();
  }

  private createLocalClient(): StorageClient {
    const URL_PREFIX = '/uploads';
    const ALLOWED_CATEGORIES = new Set([
      'image', 'audio', 'lyric', 'apk', 'other',
    ]);
    const configured =
      this.configService.get<string>('storage.localStoragePath') || './uploads';
    const root = path.resolve(process.cwd(), configured);

    const sanitizeCategory = (category: string): string => {
      const cleaned = category.trim().toLowerCase();
      return ALLOWED_CATEGORIES.has(cleaned) ? cleaned : 'other';
    };

    const sanitizeExtension = (filename: string): string => {
      const ext = path.extname(filename);
      if (ext.length > 10 || !/^\.[a-zA-Z0-9]+$/.test(ext)) return '';
      return ext.toLowerCase();
    };

    const currentYearMonth = (): string => {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    };

    return {
      async upload(file: Express.Multer.File, category: string, subPath?: string): Promise<UploadResult> {
        const safeCategory = sanitizeCategory(category);
        const safeExt = sanitizeExtension(file.originalname);
        const filename = `${randomUUID()}${safeExt}`;
        let relPath: string;
        if (subPath) {
          const safeSub = subPath.replace(/[^a-zA-Z0-9/_-]/g, '');
          relPath = `${safeCategory}/${safeSub}/${filename}`;
        } else {
          const ym = currentYearMonth();
          relPath = `${safeCategory}/${ym}/${filename}`;
        }
        const absPath = path.join(root, relPath);
        const resolvedDir = path.resolve(path.dirname(absPath));
        if (!resolvedDir.startsWith(root)) {
          throw new Error('非法的文件路径');
        }
        await fs.mkdir(path.dirname(absPath), { recursive: true });
        await fs.writeFile(absPath, file.buffer);
        return { url: `${URL_PREFIX}/${relPath}`, path: relPath };
      },

      async delete(relPath: string): Promise<void> {
        const abs = path.join(root, relPath);
        const resolved = path.resolve(abs);
        if (!resolved.startsWith(root)) return;
        try { await fs.unlink(resolved); } catch {}
      },

      getUrl(relPath: string): string {
        const stripped = relPath.split(path.sep).join('/').replace(/^\/+/, '');
        return `${URL_PREFIX}/${stripped}`;
      },

      async presign(relPath: string): Promise<string> {
        return `${URL_PREFIX}/${relPath}`;
      },

      extractPath(url: string): string {
        let p = url;
        try {
          if (/^https?:\/\//i.test(url)) p = new URL(url).pathname;
          else p = url.split('?')[0].split('#')[0];
        } catch { p = url.split('?')[0].split('#')[0]; }
        if (p.startsWith(URL_PREFIX)) return p.slice(URL_PREFIX.length).replace(/^\/+/, '');
        return p.replace(/^\/+/, '');
      },
    };
  }

  private createS3Client(cfg: StorageRuntimeConfig): StorageClient {
    const s3 = new S3Client({
      region: cfg.region || undefined,
      endpoint: cfg.endpoint || undefined,
      credentials: {
        accessKeyId: cfg.secretId,
        secretAccessKey: cfg.secretKey,
        ...(cfg.sessionToken ? { sessionToken: cfg.sessionToken } : {}),
      },
    });
    const publicDomain = cfg.publicDomain || '';
    const bucket = cfg.bucket;

    const guessContentType = (filePath: string): string => {
      const ext = path.extname(filePath).toLowerCase();
      const map: Record<string, string> = {
        '.mp3': 'audio/mpeg', '.flac': 'audio/flac', '.wav': 'audio/wav',
        '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.ogg': 'audio/ogg',
        '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
        '.gif': 'image/gif', '.webp': 'image/webp', '.lrc': 'text/plain',
        '.txt': 'text/plain', '.apk': 'application/vnd.android.package-archive',
      };
      return map[ext] || 'application/octet-stream';
    };

    const getS3Url = (key: string): string => {
      const base = publicDomain || `https://${bucket}.s3.amazonaws.com`;
      return `${base.replace(/\/+$/, '')}/${key.replace(/^\/+/, '')}`;
    };

    return {
      async upload(file: Express.Multer.File, category: string, subPath?: string): Promise<UploadResult> {
        const ext = path.extname(file.originalname) || '';
        let key: string;
        if (subPath) {
          const safeSub = subPath.replace(/[^a-zA-Z0-9/_-]/g, '');
          key = `${category}/${safeSub}/${randomUUID()}${ext}`;
        } else {
          const ym = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
          key = `${category}/${ym}/${randomUUID()}${ext}`;
        }
        await s3.send(new PutObjectCommand({
          Bucket: bucket, Key: key, Body: file.buffer, ContentType: guessContentType(file.originalname),
        }));
        return { url: getS3Url(key), path: key };
      },

      async delete(key: string): Promise<void> {
        try {
          const { DeleteObjectCommand } = require('@aws-sdk/client-s3');
          await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
        } catch {}
      },

      getUrl: getS3Url,

      async presign(key: string, expiresIn = 3600): Promise<string> {
        const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
        const { GetObjectCommand } = require('@aws-sdk/client-s3');
        return getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn });
      },

      extractPath(url: string): string {
        const clean = url.split('?')[0].split('#')[0];
        const base = publicDomain || `https://${bucket}.s3.amazonaws.com`;
        if (clean.startsWith(base)) return clean.slice(base.length).replace(/^\/+/, '');
        try {
          if (/^https?:\/\//i.test(clean)) return new URL(clean).pathname.replace(/^\/+/, '');
        } catch {}
        return clean.replace(/^\/+/, '');
      },
    };
  }

  private createCosClient(cfg: StorageRuntimeConfig): StorageClient {
    const cos = new COS({
      SecretId: cfg.secretId,
      SecretKey: cfg.secretKey,
      SecurityToken: cfg.sessionToken || undefined,
    });
    const bucket = cfg.bucket;
    const region = cfg.region;

    const guessContentType = (filePath: string): string => {
      const ext = path.extname(filePath).toLowerCase();
      const map: Record<string, string> = {
        '.mp3': 'audio/mpeg', '.flac': 'audio/flac', '.wav': 'audio/wav',
        '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.ogg': 'audio/ogg',
        '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
        '.gif': 'image/gif', '.webp': 'image/webp', '.lrc': 'text/plain',
        '.txt': 'text/plain', '.apk': 'application/vnd.android.package-archive',
      };
      return map[ext] || 'application/octet-stream';
    };

    const getCosUrl = (key: string): string =>
      `https://${bucket}.cos.${region}.myqcloud.com/${key.replace(/^\/+/, '')}`;

    return {
      async upload(file: Express.Multer.File, category: string, subPath?: string): Promise<UploadResult> {
        const ext = path.extname(file.originalname) || '';
        let key: string;
        if (subPath) {
          const safeSub = subPath.replace(/[^a-zA-Z0-9/_-]/g, '');
          key = `${category}/${safeSub}/${randomUUID()}${ext}`;
        } else {
          const ym = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
          key = `${category}/${ym}/${randomUUID()}${ext}`;
        }
        await new Promise<void>((resolve, reject) => {
          cos.putObject({
            Bucket: bucket, Region: region, Key: key,
            Body: file.buffer, ContentType: guessContentType(file.originalname),
          }, (err: any) => err ? reject(err) : resolve());
        });
        return { url: getCosUrl(key), path: key };
      },

      async delete(key: string): Promise<void> {
        try {
          await new Promise<void>((resolve, reject) => {
            cos.deleteObject({ Bucket: bucket, Region: region, Key: key }, (err: any) =>
              err ? reject(err) : resolve(),
            );
          });
        } catch {}
      },

      getUrl: getCosUrl,

      async presign(key: string, expiresIn = 3600): Promise<string> {
        return new Promise((resolve, reject) => {
          cos.getObjectUrl({ Bucket: bucket, Region: region, Key: key, Expires: expiresIn },
            (err: any, data: any) => err ? reject(err) : resolve(data.Url),
          );
        });
      },

      extractPath(url: string): string {
        const clean = url.split('?')[0].split('#')[0];
        const base = `https://${bucket}.cos.${region}.myqcloud.com`;
        if (clean.startsWith(base)) return clean.slice(base.length).replace(/^\/+/, '');
        try {
          if (/^https?:\/\//i.test(clean)) return new URL(clean).pathname.replace(/^\/+/, '');
        } catch {}
        return clean.replace(/^\/+/, '');
      },
    };
  }

  async upload(file: Express.Multer.File, category: string, subPath?: string): Promise<UploadResult> {
    const client = await this.getClient();
    return client.upload(file, category, subPath);
  }

  async delete(key: string): Promise<void> {
    const client = await this.getClient();
    return client.delete(key);
  }

  getUrl(key: string): string {
    if (this.client) return this.client.getUrl(key);
    const configured =
      this.configService.get<string>('storage.localStoragePath') || './uploads';
    const root = path.resolve(process.cwd(), configured);
    return `/uploads/${key.replace(/^\/+/, '')}`;
  }

  async presign(key: string, expiresIn?: number): Promise<string> {
    const client = await this.getClient();
    return client.presign(key, expiresIn);
  }

  extractPath(url: string): string {
    if (this.client) return this.client.extractPath(url);
    let p = url;
    try {
      if (/^https?:\/\//i.test(url)) p = new URL(url).pathname;
      else p = url.split('?')[0].split('#')[0];
    } catch { p = url.split('?')[0].split('#')[0]; }
    if (p.startsWith('/uploads')) return p.slice('/uploads'.length).replace(/^\/+/, '');
    return p.replace(/^\/+/, '');
  }
}
