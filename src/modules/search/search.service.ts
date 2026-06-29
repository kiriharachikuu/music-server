import { Injectable } from '@nestjs/common';
import {
  buildPaginatedResult,
  PaginatedResult,
  parsePagination,
} from '../../common/utils/pagination.util';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 综合搜索歌曲
   * - q 模糊匹配 title / artist / album.name / 所属 playlist.name
   * - sort=time 按 releaseDate 降序；sort=plays 按 plays 降序
   * - tag 过滤关联 SongTag
   */
  async search(query: {
    q?: string;
    sort?: string;
    tag?: string;
    page?: string;
    limit?: string;
    pageSize?: string;
  }): Promise<PaginatedResult<unknown>> {
    const { page, limit, skip, take } = parsePagination(query);
    const q = (query.q ?? '').trim();
    const tag = (query.tag ?? '').trim();
    const orderBy =
      query.sort === 'plays' ? { plays: 'desc' as const } : { releaseDate: 'desc' as const };

    // 关键词过滤条件
    const qFilter = q
      ? {
          OR: [
            { title: { contains: q, mode: 'insensitive' as const } },
            { artist: { contains: q, mode: 'insensitive' as const } },
            { album: { name: { contains: q, mode: 'insensitive' as const } } },
            {
              playlistSongs: {
                some: {
                  playlist: { name: { contains: q, mode: 'insensitive' as const } },
                },
              },
            },
          ],
        }
      : {};

    // 标签过滤条件
    const tagFilter = tag
      ? { songTags: { some: { tag: { name: tag } } } }
      : {};

    const where = {
      deletedAt: null,
      status: 'PUBLISHED' as const,
      AND: [qFilter, tagFilter],
    };

    const [list, total] = await this.prisma.$transaction([
      this.prisma.song.findMany({
        where,
        skip,
        take,
        orderBy,
        include: {
          album: true,
          songTags: { include: { tag: true } },
        },
      }),
      this.prisma.song.count({ where }),
    ]);

    return buildPaginatedResult(list, total, page, limit);
  }
}
