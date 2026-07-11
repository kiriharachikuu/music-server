import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ArtistService {
  constructor(private readonly prisma: PrismaService) {}

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