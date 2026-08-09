import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreatePlatformChangelogDto } from './dto/create-platform-changelog.dto';
import { UpdatePlatformChangelogDto } from './dto/update-platform-changelog.dto';
import {
  buildPaginatedResult,
  parsePagination,
} from '../../common/utils/pagination.util';

@Injectable()
export class PlatformChangelogService {
  constructor(private readonly prisma: PrismaService) {}

  /** 后台分页列表 */
  async list(query: { page?: string; limit?: string; status?: string }) {
    const { page, limit, skip, take } = parsePagination(query);
    const where: any = {};
    if (query.status) where.status = query.status;

    const [list, total] = await this.prisma.$transaction([
      this.prisma.platformChangelog.findMany({
        where,
        skip,
        take,
        orderBy: { versionCode: 'desc' },
      }),
      this.prisma.platformChangelog.count({ where }),
    ]);

    return buildPaginatedResult(
      list.map((item) => this.toDto(item)),
      total,
      page,
      limit,
    );
  }

  /** 后台详情 */
  async detail(id: string) {
    const item = await this.prisma.platformChangelog.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('平台更新日志不存在');
    return this.toDto(item);
  }

  /** 后台新建 */
  async create(dto: CreatePlatformChangelogDto) {
    const existing = await this.prisma.platformChangelog.findUnique({
      where: { versionCode: dto.versionCode },
    });
    if (existing) {
      throw new ConflictException('版本号已存在');
    }
    const created = await this.prisma.platformChangelog.create({
      data: {
        version: dto.version,
        versionCode: dto.versionCode,
        title: dto.title,
        content: dto.content,
        status: dto.status ?? 'published',
        releaseDate: dto.releaseDate ? new Date(dto.releaseDate) : new Date(),
      },
    });
    return this.toDto(created);
  }

  /** 后台更新 */
  async update(id: string, dto: UpdatePlatformChangelogDto) {
    const existing = await this.prisma.platformChangelog.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('平台更新日志不存在');
    if (dto.versionCode && dto.versionCode !== existing.versionCode) {
      const dup = await this.prisma.platformChangelog.findUnique({
        where: { versionCode: dto.versionCode },
      });
      if (dup) throw new ConflictException('版本号已存在');
    }
    const updated = await this.prisma.platformChangelog.update({
      where: { id },
      data: {
        ...dto,
        releaseDate: dto.releaseDate ? new Date(dto.releaseDate) : undefined,
      },
    });
    return this.toDto(updated);
  }

  /** 后台删除 */
  async remove(id: string) {
    const existing = await this.prisma.platformChangelog.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('平台更新日志不存在');
    await this.prisma.platformChangelog.delete({ where: { id } });
    return { id };
  }

  /** 公开列表（仅已发布） */
  async listPublic(limit?: number) {
    const take = limit && limit > 0 ? Math.min(limit, 100) : 50;
    const list = await this.prisma.platformChangelog.findMany({
      where: { status: 'published' },
      orderBy: { versionCode: 'desc' },
      take,
    });
    return list.map((item) => this.toDto(item));
  }

  /** 公开最新版本 */
  async getLatest() {
    const latest = await this.prisma.platformChangelog.findFirst({
      where: { status: 'published' },
      orderBy: { versionCode: 'desc' },
    });
    if (!latest) return null;
    return this.toDto(latest);
  }

  /** Prisma 记录 → 对外 DTO（content 解析为数组） */
  private toDto(item: any) {
    return {
      id: item.id,
      version: item.version,
      versionCode: item.versionCode,
      releaseDate: item.releaseDate,
      title: item.title,
      content: this.parseContent(item.content),
      status: item.status,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  }

  private parseContent(content: string | null | undefined): string[] {
    if (!content) return [];
    try {
      const parsed = JSON.parse(content);
      return Array.isArray(parsed) ? parsed : [content];
    } catch {
      return [content];
    }
  }
}
