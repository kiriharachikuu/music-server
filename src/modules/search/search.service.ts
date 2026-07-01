import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  buildPaginatedResult,
  parsePagination,
  type PaginatedResult,
} from '../../common/utils/pagination.util';

export interface SongWithAlbum {
  id: number;
  title: string;
  artist: string;
  duration: number;
  coverUrl: string | null;
  audioUrl: string;
  album: { id: number; name: string } | null;
}

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 综合搜索：歌曲（分页） + 专辑（前20） + 歌单（前20）
   */
  async search(query: {
    q?: string;
    sort?: string;
    tag?: string;
    page?: string;
    limit?: string;
    pageSize?: string;
  }) {
    const q = (query.q ?? '').trim();
    const tag = (query.tag ?? '').trim();

    if (!q) {
      return {
        songs: buildPaginatedResult<SongWithAlbum>([], 0, 1, 20),
        albums: [],
        playlists: [],
      };
    }

    const insensitive = { contains: q, mode: 'insensitive' as const };

    // 歌曲搜索条件
    const songWhere = {
      deletedAt: null,
      status: 'PUBLISHED' as const,
      OR: [
        { title: insensitive },
        { artist: insensitive },
        { album: { name: insensitive } },
        {
          playlistSongs: {
            some: { playlist: { name: insensitive } },
          },
        },
      ],
      ...(tag ? { songTags: { some: { tag: { name: tag } } } } : {}),
    };

    const orderBy =
      query.sort === 'plays'
        ? { plays: 'desc' as const }
        : { releaseDate: 'desc' as const };

    const pagination = parsePagination(query);

    const [songTotal, songs, albums, playlists] = await Promise.all([
      this.prisma.song.count({ where: songWhere }),
      this.prisma.song.findMany({
        where: songWhere,
        orderBy,
        skip: pagination.skip,
        take: pagination.take,
        include: { album: { select: { id: true, name: true } } },
      }),
      this.prisma.album.findMany({
        where: {
          deletedAt: null,
          OR: [{ name: insensitive }, { artist: insensitive }],
        },
        take: 20,
      }),
      this.prisma.playlist.findMany({
        where: {
          deletedAt: null,
          isPublic: true,
          name: insensitive,
        },
        take: 20,
        include: {
          user: { select: { id: true, username: true, avatar: true } },
        },
      }),
    ]);

    return {
      songs: buildPaginatedResult(
        songs as unknown as SongWithAlbum[],
        songTotal,
        pagination.page,
        pagination.limit,
      ),
      albums,
      playlists,
    };
  }

  /** 热门搜索词 */
  async getHotKeywords(): Promise<string[]> {
    const songs = await this.prisma.song.findMany({
      where: { deletedAt: null, status: 'PUBLISHED' },
      orderBy: { plays: 'desc' },
      take: 10,
      select: { title: true },
    });
    return songs.map((s) => s.title);
  }
}

