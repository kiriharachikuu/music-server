import { Injectable, NotFoundException } from '@nestjs/common';
import {
  buildPaginatedResult,
  PaginatedResult,
  parsePagination,
} from '../../common/utils/pagination.util';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class PlaylistService {
  constructor(private readonly prisma: PrismaService) {}

  /** 公开歌单分页列表（isPublic=true） */
  async list(query: {
    page?: string;
    limit?: string;
    pageSize?: string;
  }): Promise<PaginatedResult<unknown>> {
    const { page, limit, skip, take } = parsePagination(query);
    const where = { isPublic: true, deletedAt: null };
    const [list, total] = await this.prisma.$transaction([
      this.prisma.playlist.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { id: true, username: true, avatar: true } } },
      }),
      this.prisma.playlist.count({ where }),
    ]);
    return buildPaginatedResult(list, total, page, limit);
  }

  /** 歌单详情 + 歌曲（按 sort 升序） */
  async getDetail(id: string) {
    const playlist = await this.prisma.playlist.findFirst({
      where: { id, deletedAt: null, isPublic: true },
      include: {
        user: { select: { id: true, username: true, avatar: true } },
        playlistSongs: {
          where: { song: { deletedAt: null } },
          orderBy: { sort: 'asc' },
          include: {
            song: { include: { album: true } },
          },
        },
      },
    });
    if (!playlist) {
      throw new NotFoundException('歌单不存在或不可见');
    }
    return playlist;
  }

  /** 歌单下的歌曲列表（扁平数组，按 sort 升序） */
  async getSongs(id: string) {
    const playlist = await this.getDetail(id);
    return playlist.playlistSongs.map((ps) => ps.song);
  }
}
