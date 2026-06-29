import { Injectable, NotFoundException } from '@nestjs/common';
import {
  buildPaginatedResult,
  PaginatedResult,
  parsePagination,
} from '../../common/utils/pagination.util';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AlbumService {
  constructor(private readonly prisma: PrismaService) {}

  /** 专辑分页列表（含 songCount 字段） */
  async list(query: {
    page?: string;
    limit?: string;
    pageSize?: string;
  }): Promise<PaginatedResult<unknown>> {
    const { page, limit, skip, take } = parsePagination(query);
    const where = { deletedAt: null };
    const [list, total] = await this.prisma.$transaction([
      this.prisma.album.findMany({
        where,
        skip,
        take,
        orderBy: { releaseDate: 'desc' },
      }),
      this.prisma.album.count({ where }),
    ]);
    return buildPaginatedResult(list, total, page, limit);
  }

  /** 专辑详情 + 所属歌曲列表 */
  async getDetail(id: string) {
    const album = await this.prisma.album.findFirst({
      where: { id, deletedAt: null },
      include: {
        songs: {
          where: { deletedAt: null },
          orderBy: { releaseDate: 'asc' },
        },
      },
    });
    if (!album) {
      throw new NotFoundException('专辑不存在');
    }
    return album;
  }
}
