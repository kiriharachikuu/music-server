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

/** 允许的上传分类 */
const ALLOWED_CATEGORIES = ['image', 'audio', 'lyric'] as const;
type AllowedCategory = (typeof ALLOWED_CATEGORIES)[number];

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
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Query('type') type?: string,
  ) {
    if (!file) {
      throw new BadRequestException('文件不能为空');
    }
    const category: AllowedCategory | 'other' = ALLOWED_CATEGORIES.includes(
      type as AllowedCategory,
    )
      ? (type as AllowedCategory)
      : 'other';
    return this.storage.upload(file, category);
  }
}
