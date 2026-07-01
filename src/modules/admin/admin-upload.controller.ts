import {
  BadRequestException,
  Controller,
  Inject,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { STORAGE_SERVICE } from '../upload/storage.interface';
import type { StorageService } from '../upload/storage.interface';
import { memoryStorage } from 'multer';

/** 允许的上传分类及对应的文件限制 */
const UPLOAD_CONFIG = {
  image: {
    maxSize: 5 * 1024 * 1024,
    allowedMimeTypes: [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'image/svg+xml',
    ],
    allowedExtensions: ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'],
  },
  audio: {
    maxSize: 50 * 1024 * 1024,
    allowedMimeTypes: [
      'audio/mpeg',
      'audio/mp3',
      'audio/flac',
      'audio/wav',
      'audio/ogg',
      'audio/x-m4a',
      'audio/aac',
    ],
    allowedExtensions: ['.mp3', '.flac', '.wav', '.ogg', '.m4a', '.aac'],
  },
  lyric: {
    maxSize: 1 * 1024 * 1024,
    allowedMimeTypes: ['text/plain', 'application/octet-stream'],
    allowedExtensions: ['.lrc', '.txt'],
  },
} as const;

type AllowedCategory = keyof typeof UPLOAD_CONFIG;

/** 后台文件上传 路由前缀 /api/admin/upload */
@Controller('admin/upload')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminUploadController {
  constructor(
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
  ) {}

  /** POST /api/admin/upload?type=image|audio|lyric (multipart, 字段名 file) */
  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: {
        fileSize: Math.max(...Object.values(UPLOAD_CONFIG).map((c) => c.maxSize)),
      },
    }),
  )
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Query('type') type?: string,
  ) {
    if (!file) {
      throw new BadRequestException('文件不能为空');
    }

    const category = (type && type in UPLOAD_CONFIG
      ? type
      : 'other') as AllowedCategory | 'other';

    if (category === 'other') {
      throw new BadRequestException(
        `不支持的文件类型，仅支持：${Object.keys(UPLOAD_CONFIG).join('、')}`,
      );
    }

    const config = UPLOAD_CONFIG[category];

    if (file.size > config.maxSize) {
      const sizeMB = (config.maxSize / 1024 / 1024).toFixed(0);
      throw new BadRequestException(`文件过大，${category} 类型最大支持 ${sizeMB}MB`);
    }

    const ext = this.getFileExtension(file.originalname).toLowerCase();
    const mimeType = file.mimetype.toLowerCase();

    const extAllowed = config.allowedExtensions.includes(ext as never);
    const mimeAllowed = config.allowedMimeTypes.includes(mimeType as never);

    if (!extAllowed && !mimeAllowed) {
      throw new BadRequestException(
        `文件格式不支持，允许的格式：${config.allowedExtensions.join('、')}`,
      );
    }

    return this.storage.upload(file, category);
  }

  private getFileExtension(filename: string): string {
    const idx = filename.lastIndexOf('.');
    return idx >= 0 ? filename.slice(idx) : '';
  }
}
