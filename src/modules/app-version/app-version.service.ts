import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Inject,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateAppVersionDto } from './dto/create-app-version.dto';
import { UpdateAppVersionDto } from './dto/update-app-version.dto';
import {
  buildPaginatedResult,
  parsePagination,
} from '../../common/utils/pagination.util';
import { STORAGE_SERVICE } from '../upload/storage.interface';
import type { StorageService } from '../upload/storage.interface';
import * as crypto from 'crypto';

@Injectable()
export class AppVersionService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
  ) {}

  /**
   * 平台标识规范化：旧值 desktop 统一映射为 windows，未传默认 android
   */
  private normalizePlatform(platform?: string): string {
    if (!platform) return 'android';
    return platform === 'desktop' ? 'windows' : platform;
  }

  /**
   * 获取最新版本（用户端检查更新 / 下载页用）
   * @param channel 发布渠道 stable/beta
   * @param platform 平台 android/windows/ios（兼容旧值 desktop）
   * @param versionCode 当前版本号
   * @param variant 发布形态 full/setup/portable（可选；不传则取该平台最高版本）
   */
  async getLatestVersion(
    channel: string = 'stable',
    platform: string = 'android',
    versionCode?: number,
    variant?: string,
  ) {
    const normalizedPlatform = this.normalizePlatform(platform);
    const latest = await this.prisma.appVersion.findFirst({
      where: {
        channel,
        platform: normalizedPlatform,
        status: 'published',
        ...(variant ? { variant } : {}),
      },
      orderBy: { versionCode: 'desc' },
    });

    if (!latest) {
      return { hasUpdate: false, forceUpdate: false, latest: null };
    }

    const hasUpdate = versionCode ? latest.versionCode > versionCode : true;
    // 强制更新语义：本版本被标记强制 或 当前版本低于最低兼容版本
    const forceUpdate =
      latest.forceUpdate ||
      (versionCode != null ? versionCode < latest.minVersionCode : false);

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
        variant: latest.variant,
        releaseDate: latest.createdAt,
      },
    };
  }

  /**
   * 公开历史版本列表（下载页"历史版本"用，仅 published）
   */
  async listPublicVersions(query: {
    platform?: string;
    channel?: string;
    variant?: string;
    page?: string;
    limit?: string;
    pageSize?: string;
  }) {
    const { page, limit, skip, take } = parsePagination(query);
    const normalizedPlatform = this.normalizePlatform(query.platform);
    const where = {
      platform: normalizedPlatform,
      status: 'published',
      ...(query.channel ? { channel: query.channel } : { channel: 'stable' }),
      ...(query.variant ? { variant: query.variant } : {}),
    };

    const [list, total] = await this.prisma.$transaction([
      this.prisma.appVersion.findMany({
        where,
        orderBy: { versionCode: 'desc' },
        skip,
        take,
      }),
      this.prisma.appVersion.count({ where }),
    ]);

    return buildPaginatedResult(
      list.map((v) => ({
        id: v.id,
        versionCode: v.versionCode,
        versionName: v.versionName,
        title: v.title,
        content: v.content ? this.parseContent(v.content) : [],
        fileSize: v.fileSize,
        variant: v.variant,
        channel: v.channel,
        platform: v.platform,
        downloadCount: v.downloadCount,
        releaseDate: v.createdAt,
      })),
      total,
      page,
      limit,
    );
  }

  /**
   * 下载跳转：计数 +1 后返回真实下载地址（供 302 代理端点使用）
   */
  async trackAndResolveDownload(id: string): Promise<string> {
    const version = await this.prisma.appVersion.findUnique({
      where: { id },
      select: { id: true, downloadUrl: true },
    });
    if (!version) {
      throw new NotFoundException('版本不存在');
    }
    await this.incrementDownloadCount(id);
    return version.downloadUrl;
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
  async listVersions(query: {
    page?: string;
    limit?: string;
    channel?: string;
    platform?: string;
    variant?: string;
  }) {
    const { page, limit, skip, take } = parsePagination(query);
    const where: Prisma.AppVersionWhereInput = {};

    if (query.channel) where.channel = query.channel;
    if (query.platform) where.platform = this.normalizePlatform(query.platform);
    if (query.variant) where.variant = query.variant;

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
   * 管理后台：创建新版本（支持上传 APK/EXE 文件）
   * 版本号按 (platform, versionCode) 组合唯一，各平台独立递增
   */
  async createVersion(dto: CreateAppVersionDto, file?: Express.Multer.File) {
    const platform = this.normalizePlatform(dto.platform);
    const variant = dto.variant ?? 'full';

    const existing = await this.prisma.appVersion.findFirst({
      where: { platform, versionCode: dto.versionCode },
    });
    if (existing) {
      throw new ConflictException('该平台下此版本号已存在');
    }

    let downloadUrl = dto.downloadUrl;
    let fileSize = dto.fileSize;
    let md5 = dto.md5;

    if (file) {
      // Windows 安装包存 exe 目录，其余存 apk 目录
      const category = platform === 'windows' ? 'exe' : 'apk';
      const uploadResult = await this.storage.upload(file, category);
      if (!downloadUrl) {
        downloadUrl = uploadResult.url;
      }
      if (!fileSize || fileSize === 0) {
        fileSize = file.size;
      }
      if (!md5) {
        md5 = crypto.createHash('md5').update(file.buffer).digest('hex');
      }
    }

    if (!downloadUrl) {
      throw new BadRequestException('请上传安装包文件或填写下载地址');
    }

    return this.prisma.appVersion.create({
      data: {
        versionCode: dto.versionCode,
        versionName: dto.versionName,
        title: dto.title,
        content: dto.content,
        downloadUrl,
        fileSize,
        md5,
        forceUpdate: dto.forceUpdate ?? false,
        minVersionCode: dto.minVersionCode ?? 0,
        channel: dto.channel ?? 'stable',
        platform,
        variant,
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

    // 平台/版本号变更后按组合唯一重新查重
    const nextPlatform = this.normalizePlatform(
      dto.platform ?? existing.platform,
    );
    const nextVersionCode = dto.versionCode ?? existing.versionCode;
    if (
      nextPlatform !== existing.platform ||
      nextVersionCode !== existing.versionCode
    ) {
      const duplicate = await this.prisma.appVersion.findFirst({
        where: {
          platform: nextPlatform,
          versionCode: nextVersionCode,
          id: { not: id },
        },
      });
      if (duplicate) {
        throw new ConflictException('该平台下此版本号已存在');
      }
    }

    return this.prisma.appVersion.update({
      where: { id },
      data: { ...dto, platform: nextPlatform },
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
      const parsed: unknown = JSON.parse(content);
      if (Array.isArray(parsed)) {
        return parsed.filter(
          (item): item is string => typeof item === 'string',
        );
      }
      return [content];
    } catch {
      return [content];
    }
  }
}
