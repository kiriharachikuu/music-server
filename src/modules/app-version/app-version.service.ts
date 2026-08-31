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
import { parseVersion, isNewerVersion } from '../../common/utils/semver.util';
import * as crypto from 'crypto';

/** 官网公共接口返回的平台版本摘要 */
export interface PublicAppVersionSummary {
  android: {
    version: string;
    versionCode: number;
    changelog: string[];
    downloadUrl: string;
    fileSize: number;
    publishedAt: Date;
  } | null;
  pc: {
    version: string;
    versionCode: number;
    changelog: string[];
    downloadUrl: string;
    fileSize: number;
    publishedAt: Date;
  } | null;
}

/** 平台端点支持的平台标识（pc 映射为 windows 存储） */
export type UpdatePlatform = 'android' | 'pc';

@Injectable()
export class AppVersionService {
  /** 公共接口内存缓存 TTL（毫秒） */
  private static readonly PUBLIC_CACHE_TTL_MS = 60_000;
  /** 官网公共接口内存缓存 */
  private publicVersionsCache?: {
    expiresAt: number;
    data: PublicAppVersionSummary;
  };

  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
  ) {}

  /**
   * 平台标识规范化：旧值 desktop / 新值 pc 统一映射为 windows，未传默认 android
   */
  private normalizePlatform(platform?: string): string {
    if (!platform) return 'android';
    return platform === 'desktop' || platform === 'pc' ? 'windows' : platform;
  }

  /**
   * 获取最新版本（用户端检查更新 / 下载页用）
   * @param channel 发布渠道 stable/beta
   * @param platform 平台 android/windows/ios（兼容旧值 desktop / 别名 pc）
   * @param versionCode 当前版本码（数值比较，可选）
   * @param variant 发布形态 full/setup/portable（可选；不传则取该平台最高版本）
   * @param currentVersionName 当前语义化版本号（semver 比较，可选；与 versionCode 任一命中即视为有更新）
   */
  async getLatestVersion(
    channel: string = 'stable',
    platform: string = 'android',
    versionCode?: number,
    variant?: string,
    currentVersionName?: string,
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

    // 版本比较：versionCode 数值比较（兼容旧客户端）与 versionName semver 比较取或；
    // 两者都未提供时保持原有语义（返回最新版本供展示，hasUpdate=true）
    const newerByCode =
      versionCode != null ? latest.versionCode > versionCode : false;
    const newerByName = currentVersionName
      ? isNewerVersion(currentVersionName, latest.versionName)
      : false;
    const hasUpdate =
      versionCode == null && !currentVersionName
        ? true
        : newerByCode || newerByName;
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
   * 平台更新检查端点（/api/update/android、/api/update/pc）
   * Android 与 PC 各自独立取最新版本，互不影响
   * @param platform android / pc（pc 映射为 windows 存储）
   * @param currentVersion 当前版本：纯数字按 versionCode 数值比较，否则按 semver 与 versionName 比较；缺失或非法抛 400
   */
  async getPlatformLatestVersion(
    platform: UpdatePlatform,
    currentVersion: string | undefined,
    channel: string = 'stable',
    variant?: string,
  ) {
    if (!currentVersion || !currentVersion.trim()) {
      throw new BadRequestException('缺少 currentVersion 参数');
    }
    const current = currentVersion.trim();

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

    // currentVersion 兼容两种形态：纯数字（Android versionCode）/ semver（PC 版本号）
    const isNumeric = /^\d+$/.test(current);
    let hasUpdate: boolean;
    let forceUpdate: boolean;

    if (isNumeric) {
      const code = Number(current);
      hasUpdate = latest.versionCode > code;
      forceUpdate = latest.forceUpdate || code < latest.minVersionCode;
    } else {
      if (!parseVersion(current)) {
        throw new BadRequestException(
          'currentVersion 格式非法：应为纯数字版本码或语义化版本号（如 1.4.3）',
        );
      }
      hasUpdate = isNewerVersion(current, latest.versionName);
      // semver 比较无法对应 minVersionCode，强制更新仅按版本标记判断
      forceUpdate = latest.forceUpdate;
    }

    return {
      hasUpdate,
      forceUpdate,
      latest: {
        id: latest.id,
        version: latest.versionName,
        title: latest.title,
        versionCode: latest.versionCode,
        changelog: latest.content ? this.parseContent(latest.content) : [],
        downloadUrl: latest.downloadUrl,
        fileSize: latest.fileSize,
        md5: latest.md5,
        forceUpdate: latest.forceUpdate,
        minVersionCode: latest.minVersionCode,
        channel: latest.channel,
        platform: latest.platform,
        variant: latest.variant,
        publishedAt: latest.createdAt,
      },
    };
  }

  /**
   * 官网公共接口：一次性返回两平台最新正式版（stable + published，60s 内存缓存）
   * 平台暂无版本时对应字段返回 null，不报错
   */
  async getPublicAppVersions(): Promise<PublicAppVersionSummary> {
    const cached = this.publicVersionsCache;
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }

    const [android, pc] = await Promise.all([
      this.prisma.appVersion.findFirst({
        where: { platform: 'android', channel: 'stable', status: 'published' },
        orderBy: { versionCode: 'desc' },
      }),
      this.prisma.appVersion.findFirst({
        where: { platform: 'windows', channel: 'stable', status: 'published' },
        orderBy: { versionCode: 'desc' },
      }),
    ]);

    const toSummary = (
      v: typeof android,
    ): PublicAppVersionSummary['android'] =>
      v
        ? {
            version: v.versionName,
            versionCode: v.versionCode,
            changelog: v.content ? this.parseContent(v.content) : [],
            downloadUrl: v.downloadUrl,
            fileSize: v.fileSize,
            publishedAt: v.createdAt,
          }
        : null;

    const data: PublicAppVersionSummary = {
      android: toSummary(android),
      pc: toSummary(pc),
    };

    this.publicVersionsCache = {
      expiresAt: Date.now() + AppVersionService.PUBLIC_CACHE_TTL_MS,
      data,
    };
    return data;
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
