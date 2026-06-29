import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import { StorageService, UploadResult } from './storage.interface';

/**
 * 本地文件存储实现
 * 文件落到 {LOCAL_STORAGE_PATH}/uploads/{category}/{年月}/{随机名}
 * 通过 express.static 在 /uploads 前缀下提供静态访问
 */
@Injectable()
export class LocalStorageService implements StorageService {
  /** 本地静态资源对外暴露的 URL 前缀 */
  private static readonly URL_PREFIX = '/uploads';

  constructor(private readonly config: ConfigService) {}

  /** 本地存储根目录（绝对路径） */
  private get root(): string {
    const configured =
      this.config.get<string>('storage.localStoragePath') || './uploads';
    return path.resolve(process.cwd(), configured);
  }

  async upload(
    file: Express.Multer.File,
    category: string,
  ): Promise<UploadResult> {
    const ym = this.currentYearMonth();
    const ext = path.extname(file.originalname) || '';
    const filename = `${randomUUID()}${ext}`;
    const dir = path.join(this.root, category, ym);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, filename), file.buffer);
    const relPath = `${category}/${ym}/${filename}`;
    return { url: this.getUrl(relPath), path: relPath };
  }

  async delete(relPath: string): Promise<void> {
    const abs = path.join(this.root, relPath);
    try {
      await fs.unlink(abs);
    } catch {
      // 文件不存在时忽略
    }
  }

  getUrl(relPath: string): string {
    const normalized = relPath.split(path.sep).join('/');
    const stripped = normalized.replace(/^\/+/, '');
    return `${LocalStorageService.URL_PREFIX}/${stripped}`;
  }

  private currentYearMonth(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }
}
