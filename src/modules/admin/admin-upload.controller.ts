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
import { AudioProcessService } from '../upload/audio-process.service';
import { STORAGE_SERVICE } from '../upload/storage.interface';
import type { StorageService } from '../upload/storage.interface';
import { memoryStorage } from 'multer';

const toMB = (mb: number) => mb * 1024 * 1024;

const envMaxSizeMB = {
  image: parseInt(process.env.UPLOAD_MAX_SIZE_IMAGE_MB || '10', 10),
  audio: parseInt(process.env.UPLOAD_MAX_SIZE_AUDIO_MB || '200', 10),
  lyric: parseInt(process.env.UPLOAD_MAX_SIZE_LYRIC_MB || '5', 10),
  apk: parseInt(process.env.UPLOAD_MAX_SIZE_APK_MB || '200', 10),
};

/** 允许的上传分类及对应的文件限制 */
const UPLOAD_CONFIG = {
  image: {
    maxSize: toMB(envMaxSizeMB.image),
    // 安全：移除 image/svg+xml，SVG 可内嵌 <script> 导致存储型 XSS
    allowedMimeTypes: [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
    ],
    allowedExtensions: ['.jpg', '.jpeg', '.png', '.gif', '.webp'],
  },
  audio: {
    maxSize: toMB(envMaxSizeMB.audio),
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
    maxSize: toMB(envMaxSizeMB.lyric),
    allowedMimeTypes: ['text/plain', 'application/octet-stream'],
    allowedExtensions: ['.lrc', '.txt'],
  },
  apk: {
    maxSize: toMB(envMaxSizeMB.apk),
    allowedMimeTypes: ['application/vnd.android.package-archive'],
    allowedExtensions: ['.apk'],
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
    private readonly audioProcess: AudioProcessService,
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
    @Query('transcode') transcode?: string,
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

    // 图片类型 mime 检测可靠，要求扩展名与 MIME 均匹配（防伪造）
    // 音频/歌词类型 MIME 检测不稳定（常被识别为 application/octet-stream），
    // 保留 OR 逻辑以避免误伤合法文件
    const isImage = category === 'image';
    const passed = isImage ? extAllowed && mimeAllowed : extAllowed || mimeAllowed;

    if (!passed) {
      throw new BadRequestException(
        `文件格式不支持，允许的格式：${config.allowedExtensions.join('、')}`,
      );
    }

    // 仅音频类型支持同步转码为 128kbps MP3；transcode=true 时先转码再走原存储流程
    let transcoded = false;
    if (category === 'audio' && transcode === 'true') {
      const { buffer: mp3Buffer, filename: mp3Name } =
        await this.audioProcess.transcodeToMp3(file.buffer, file.originalname);
      // 替换原 buffer 和 filename，后续 storage.save 与 probeMetadata 均基于转码后的 MP3
      file.buffer = mp3Buffer;
      file.originalname = mp3Name;
      file.size = mp3Buffer.length;
      transcoded = true;
    }

    const result = await this.storage.upload(file, category);

    // 仅音频类型解析元数据与文件名信息，图片 / 歌词保持原响应
    if (category !== 'audio') {
      return result;
    }

    const metadata = await this.audioProcess.probeMetadata(
      file.buffer,
      file.originalname,
    );
    const parsed = this.audioProcess.parseFilename(file.originalname);

    // 仅当实际转码时标注 transcoded: true
    return transcoded
      ? { ...result, metadata, parsed, transcoded: true }
      : { ...result, metadata, parsed };
  }

  private getFileExtension(filename: string): string {
    const idx = filename.lastIndexOf('.');
    return idx >= 0 ? filename.slice(idx) : '';
  }
}
