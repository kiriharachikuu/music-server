import { BadRequestException, Injectable } from '@nestjs/common';
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

  /** 允许的分类目录白名单（防止路径遍历） */
  private static readonly ALLOWED_CATEGORIES = new Set([
    'image',
    'audio',
    'lyric',
    'other',
  ]);

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
    const safeCategory = this.sanitizeCategory(category);
    const ym = this.currentYearMonth();
    const safeExt = this.sanitizeExtension(file.originalname);
    const filename = `${randomUUID()}${safeExt}`;

    const dir = path.join(this.root, safeCategory, ym);
    const absPath = path.join(dir, filename);

    const resolvedDir = path.resolve(dir);
    if (!resolvedDir.startsWith(this.root)) {
      throw new BadRequestException('非法的文件路径');
    }

    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(absPath, file.buffer);

    const relPath = `${safeCategory}/${ym}/${filename}`;
    return { url: this.getUrl(relPath), path: relPath };
  }

  async delete(relPath: string): Promise<void> {
    const abs = path.join(this.root, relPath);
    const resolved = path.resolve(abs);

    if (!resolved.startsWith(this.root)) {
      return;
    }

    try {
      await fs.unlink(resolved);
    } catch {
      // 文件不存在时忽略
    }
  }

  getUrl(relPath: string): string {
    const normalized = relPath.split(path.sep).join('/');
    const stripped = normalized.replace(/^\/+/, '');
    return `${LocalStorageService.URL_PREFIX}/${stripped}`;
  }

  /**
   * 净化分类目录名，防止路径遍历
   */
  private sanitizeCategory(category: string): string {
    const cleaned = category.trim().toLowerCase();
    if (LocalStorageService.ALLOWED_CATEGORIES.has(cleaned)) {
      return cleaned;
    }
    return 'other';
  }

  /**
   * 净化文件扩展名，防止路径遍历
   */
  private sanitizeExtension(filename: string): string {
    const ext = path.extname(filename);
    if (ext.length > 10) return '';
    if (!/^\.[a-zA-Z0-9]+$/.test(ext)) return '';
    return ext.toLowerCase();
  }

  private currentYearMonth(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }
}
