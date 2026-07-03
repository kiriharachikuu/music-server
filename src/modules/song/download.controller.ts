import {
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { STORAGE_SERVICE } from '../upload/storage.interface';
import type { StorageService } from '../upload/storage.interface';

/**
 * 歌曲下载控制器
 * 路由前缀 /api/songs
 * 提供预签名下载直链，登录用户可调用
 */
@Controller('songs')
@UseGuards(JwtAuthGuard)
export class DownloadController {
  /** 预签名 URL 默认有效期（秒） */
  private static readonly DEFAULT_EXPIRES_IN = 3600;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
  ) {}

  /** GET /api/songs/:id/download-url 获取预签名下载直链 */
  @Get(':id/download-url')
  async getDownloadUrl(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    // 1. 查询歌曲（未删除）
    const song = await this.prisma.song.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, fileUrl: true },
    });
    if (!song) {
      throw new NotFoundException('歌曲不存在');
    }

    // 2. 从完整 fileUrl 反推存储内部 path
    const filePath = this.storage.extractPath(song.fileUrl);

    // 3. 生成预签名下载 URL
    const expiresIn = DownloadController.DEFAULT_EXPIRES_IN;
    const url = await this.storage.presign(filePath, expiresIn);

    // 4. 记录下载到 DownloadRecord（fire-and-forget，失败忽略）
    void this.recordDownload(userId, id);

    // 5. 返回下载直链
    return { url, expiresIn };
  }

  /**
   * 记录下载：同一用户同一首歌 1 小时内只刷新时间不重复新增，
   * 同时清理超出上限（每用户最多 200 条）的旧记录，避免表无限膨胀。
   * 任何异常均静默吞掉，不影响下载链接生成。
   */
  private async recordDownload(userId: string, songId: string) {
    try {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

      // 1 小时内已有记录：仅刷新时间，避免短时间重复刷量
      const recent = await this.prisma.downloadRecord.findFirst({
        where: { userId, songId, createdAt: { gte: oneHourAgo } },
      });
      if (recent) {
        await this.prisma.downloadRecord.update({
          where: { id: recent.id },
          data: { createdAt: now },
        });
        return;
      }

      await this.prisma.downloadRecord.create({ data: { userId, songId } });

      // 清理超出上限的旧记录（每用户最多保留 200 条）
      const total = await this.prisma.downloadRecord.count({
        where: { userId },
      });
      if (total > 200) {
        const excess = await this.prisma.downloadRecord.findMany({
          where: { userId },
          orderBy: { createdAt: 'asc' },
          take: total - 200,
          select: { id: true },
        });
        await this.prisma.downloadRecord.deleteMany({
          where: { id: { in: excess.map((r) => r.id) } },
        });
      }
    } catch {
      // 记录失败不影响下载链接生成
    }
  }
}
