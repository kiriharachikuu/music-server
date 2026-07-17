import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

interface ListParams {
  page: number;
  limit: number;
  sort: 'latest' | 'hottest' | 'name';
}

@Injectable()
export class ArtistService {
  constructor(private readonly prisma: PrismaService) {}

  async getList({ page, limit, sort }: ListParams) {
    const where = { deletedAt: null };
    const orderBy =
      sort === 'name'
        ? { name: 'asc' as const }
        : { createdAt: 'desc' as const };

    const [total, list] = await Promise.all([
      this.prisma.artist.count({ where }),
      this.prisma.artist.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        include: {
          _count: {
            select: {
              songArtists: {
                where: { song: { deletedAt: null, status: 'PUBLISHED' } },
              },
            },
          },
        },
      }),
    ]);

    return {
      total,
      page,
      limit,
      hasMore: page * limit < total,
      list: list.map((a) => ({
        id: a.id,
        name: a.name,
        avatar: a.avatar,
        cover: a.avatar,
        bio: a.bio,
        songCount: a._count.songArtists,
      })),
    };
  }

  async getDetail(id: string) {
    const artist = await this.prisma.artist.findFirst({
      where: { id, deletedAt: null },
      include: {
        songArtists: {
          where: { song: { deletedAt: null, status: 'PUBLISHED' } },
          orderBy: { sort: 'asc' },
          include: {
            song: { include: { album: true } },
          },
        },
        albumArtists: {
          where: { album: { deletedAt: null } },
          orderBy: { sort: 'asc' },
          include: { album: true },
        },
      },
    });
    if (!artist) {
      throw new NotFoundException('歌手不存在');
    }
    const songs = artist.songArtists.map((sa) => sa.song);
    const albums = artist.albumArtists.map((aa) => aa.album);
    return {
      ...artist,
      songs,
      albums,
      songCount: songs.length,
      albumCount: albums.length,
    };
  }
}