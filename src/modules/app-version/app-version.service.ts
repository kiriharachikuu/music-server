import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateAppVersionDto } from './dto/create-app-version.dto';
import { UpdateAppVersionDto } from './dto/update-app-version.dto';
import {
  buildPaginatedResult,
  parsePagination,
} from '../../common/utils/pagination.util';

@Injectable()
export class AppVersionService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 获取最新版本（用户端检查更新用）
   * @param channel 发布渠道 stable/beta
   * @param platform 平台 android/ios/desktop
   * @param versionCode 当前版本号
   */
  async getLatestVersion(
    channel: string = 'stable',
    platform: string = 'android',
    versionCode?: number,
  ) {
    const latest = await this.prisma.appVersion.findFirst({
      where: {
        channel,
        platform,
        status: 'published',
      },
      orderBy: { versionCode: 'desc' },
    });

    if (!latest) {
      return { hasUpdate: false, latest: null };
    }

    const hasUpdate = versionCode ? latest.versionCode > versionCode : true;
    const forceUpdate = versionCode ? versionCode < latest.minVersionCode : latest.forceUpdate;

    return {
      hasUpdate,
      forceUpdate,
      latest: {
        id: latest.id,
        versionCode: latest.versionCode,
        versionName: latest.versionName,
        title: latest.title,
        content: latest.content ? this.parseContent(latest.content) : [],
        downloadUrl: latest.downloadUrl,
        fileSize: latest.fileSize,
        md5: latest.md5,
        forceUpdate: latest.forceUpdate,
        minVersionCode: latest.minVersionCode,
        channel: latest.channel,
        platform: latest.platform,
        releaseDate: latest.createdAt,
      },
    };
  }

  /**
   * 记录下载次数
   */
  async incrementDownloadCount(id: string) {
    try {
      await this.prisma.appVersion.update({
        where: { id },
        data: { downloadCount: { increment: 1 } },
      });
    } catch {
      // 忽略错误，不影响下载
    }
  }

  /**
   * 管理后台：获取版本列表（分页）
   */
  async listVersions(query: { page?: string; limit?: string; channel?: string; platform?: string }) {
    const { page, limit, skip, take } = parsePagination(query);
    const where: any = {};

    if (query.channel) where.channel = query.channel;
    if (query.platform) where.platform = query.platform;

    const [list, total] = await this.prisma.$transaction([
      this.prisma.appVersion.findMany({
        where,
        skip,
        take,
        orderBy: { versionCode: 'desc' },
      }),
      this.prisma.appVersion.count({ where }),
    ]);

    return buildPaginatedResult(list, total, page, limit);
  }

  /**
   * 管理后台：获取单个版本详情
   */
  async getVersion(id: string) {
    const version = await this.prisma.appVersion.findUnique({ where: { id } });
    if (!version) {
      throw new NotFoundException('版本不存在');
    }
    return version;
  }

  /**
   * 管理后台：创建新版本
   */
  async createVersion(dto: CreateAppVersionDto) {
    // 检查 versionCode 是否已存在
    const existing = await this.prisma.appVersion.findUnique({
      where: { versionCode: dto.versionCode },
    });
    if (existing) {
      throw new ConflictException('版本号已存在');
    }

    return this.prisma.appVersion.create({
      data: {
        versionCode: dto.versionCode,
        versionName: dto.versionName,
        title: dto.title,
        content: dto.content,
        downloadUrl: dto.downloadUrl,
        fileSize: dto.fileSize,
        md5: dto.md5,
        forceUpdate: dto.forceUpdate ?? false,
        minVersionCode: dto.minVersionCode ?? 0,
        channel: dto.channel ?? 'stable',
        platform: dto.platform ?? 'android',
        status: dto.status ?? 'published',
      },
    });
  }

  /**
   * 管理后台：更新版本
   */
  async updateVersion(id: string, dto: UpdateAppVersionDto) {
    const existing = await this.prisma.appVersion.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('版本不存在');
    }

    // 如果修改了 versionCode，检查是否冲突
    if (dto.versionCode && dto.versionCode !== existing.versionCode) {
      const duplicate = await this.prisma.appVersion.findUnique({
        where: { versionCode: dto.versionCode },
      });
      if (duplicate) {
        throw new ConflictException('版本号已存在');
      }
    }

    return this.prisma.appVersion.update({
      where: { id },
      data: dto,
    });
  }

  /**
   * 管理后台：删除版本
   */
  async deleteVersion(id: string) {
    const existing = await this.prisma.appVersion.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('版本不存在');
    }
    return this.prisma.appVersion.delete({ where: { id } });
  }

  /**
   * 解析 content JSON 字符串为数组
   */
  private parseContent(content: string): string[] {
    try {
      const parsed = JSON.parse(content);
      return Array.isArray(parsed) ? parsed : [content];
    } catch {
      return [content];
    }
  }
}
