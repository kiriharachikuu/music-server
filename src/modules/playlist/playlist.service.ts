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

  /** 公开歌单分页列表（isPublic=true），官方歌单（isSystem=true）永远优先展示 */
  async list(query: {
    page?: string;
    limit?: string;
    pageSize?: string;
    sort?: string;
  }): Promise<PaginatedResult<unknown>> {
    const { page, limit, skip, take } = parsePagination(query);
    const where = { isPublic: true, deletedAt: null };
    const sort = query.sort ?? 'latest';
    const createdAtOrder = sort === 'oldest' ? 'asc' as const : 'desc' as const;
    const [list, total] = await this.prisma.$transaction([
      this.prisma.playlist.findMany({
        where,
        skip,
        take,
        orderBy: [
          { isSystem: 'desc' },
          { createdAt: createdAtOrder },
        ],
        include: { user: { select: { id: true, username: true, avatar: true } } },
      }),
      this.prisma.playlist.count({ where }),
    ]);
    return buildPaginatedResult(list, total, page, limit);
  }

  /** 歌单详情 + 歌曲/歌切（按 sort 升序） */
  async getDetail(id: string) {
    const playlist = await this.prisma.playlist.findFirst({
      where: { id, deletedAt: null, isPublic: true },
      include: {
        user: { select: { id: true, username: true, avatar: true } },
        playlistSongs: {
          where: {
            OR: [
              { song: { deletedAt: null } },
              { clip: { status: 'PUBLISHED' } },
            ],
          },
          orderBy: { sort: 'asc' },
          include: {
            song: {
              include: {
                album: true,
                songArtists: {
                  take: 1,
                  orderBy: { sort: 'asc' },
                  include: { artist: { select: { id: true } } },
                },
              },
            },
            clip: { include: { session: true } },
          },
        },
      },
    });
    if (!playlist) {
      throw new NotFoundException('歌单不存在或不可见');
    }
    // 为每个歌曲添加 artistId
    return {
      ...playlist,
      playlistSongs: playlist.playlistSongs.map((ps) => ({
        ...ps,
        song: ps.song
          ? {
              ...ps.song,
              artistId: ps.song.songArtists?.[0]?.artistId ?? null,
            }
          : ps.song,
      })),
    };
  }

  /** 歌单下的歌曲/歌切列表（扁平数组，按 sort 升序） */
  async getSongs(id: string) {
    const playlist = await this.getDetail(id);
    return playlist.playlistSongs.map((ps) => {
      if (ps.song) {
        return { ...ps.song, artistId: ps.song.artistId ?? ps.song.songArtists?.[0]?.artistId ?? null };
      }
      return ps.clip;
    });
  }
}
