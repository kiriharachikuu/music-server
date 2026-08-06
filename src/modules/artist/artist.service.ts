import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  buildPaginatedResult,
  parsePagination,
} from '../../common/utils/pagination.util';

interface ListParams {
  page: number;
  limit: number;
  sort: 'latest' | 'oldest' | 'name';
}

@Injectable()
export class ArtistService {
  constructor(private readonly prisma: PrismaService) {}

  async getList({ page, limit, sort }: ListParams) {
    const where = { deletedAt: null };
    const orderBy =
      sort === 'name'
        ? { name: 'asc' as const }
        : sort === 'oldest'
          ? { createdAt: 'asc' as const }
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

    // 歌切：LiveClip.artist 字符串模糊匹配歌手名（取前 10 首用于详情页预览）
    const liveClipWhere = {
      status: 'PUBLISHED' as const,
      artist: { contains: artist.name },
    };
    const [liveClips, liveClipCount] = await Promise.all([
      this.prisma.liveClip.findMany({
        where: liveClipWhere,
        orderBy: [{ sessionId: 'asc' }, { trackIndex: 'asc' }],
        include: {
          session: { select: { id: true, title: true, liveTime: true, cover: true } },
        },
        take: 10,
      }),
      this.prisma.liveClip.count({ where: liveClipWhere }),
    ]);

    // 映射为 LiveClipTrack 格式（与 searchByCategory 一致）
    const mappedLiveClips = liveClips.map((clip) => ({
      id: clip.id,
      title: clip.title,
      artist: clip.artist,
      cover: clip.coverUrl ?? clip.session?.cover,
      url: clip.fileUrl,
      duration: clip.duration,
      trackType: 'live_clip' as const,
      sessionId: clip.sessionId,
      sessionName: clip.session?.title ?? '',
      liveTime: clip.session?.liveTime?.toISOString() ?? '',
      trackIndex: clip.trackIndex,
    }));

    return {
      ...artist,
      songs,
      albums,
      songCount: songs.length,
      albumCount: albums.length,
      liveClips: mappedLiveClips,
      liveClipCount,
    };
  }

  /** 歌手单曲列表（分页 + 排序） */
  async getSongs(
    id: string,
    query: { page?: string; limit?: string; pageSize?: string; sort?: string },
  ) {
    const artist = await this.prisma.artist.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, name: true },
    });
    if (!artist) {
      throw new NotFoundException('歌手不存在');
    }

    const { page, limit, skip, take } = parsePagination(query);
    const sort = query.sort ?? 'latest';
    const orderBy =
      sort === 'hottest'
        ? { plays: 'desc' as const }
        : sort === 'name'
          ? { title: 'asc' as const }
          : { releaseDate: 'desc' as const };

    const where = {
      deletedAt: null,
      status: 'PUBLISHED' as const,
      songArtists: { some: { artistId: id } },
    };

    const [list, total] = await this.prisma.$transaction([
      this.prisma.song.findMany({
        where,
        orderBy,
        skip,
        take,
        include: { album: true },
      }),
      this.prisma.song.count({ where }),
    ]);

    return buildPaginatedResult(list, total, page, limit);
  }

  /** 歌手歌切列表（分页） */
  async getClips(
    id: string,
    query: { page?: string; limit?: string; pageSize?: string },
  ) {
    const artist = await this.prisma.artist.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, name: true },
    });
    if (!artist) {
      throw new NotFoundException('歌手不存在');
    }

    const { page, limit, skip, take } = parsePagination(query);
    const where = {
      status: 'PUBLISHED' as const,
      artist: { contains: artist.name },
    };

    const [list, total] = await this.prisma.$transaction([
      this.prisma.liveClip.findMany({
        where,
        orderBy: [{ sessionId: 'asc' }, { trackIndex: 'asc' }],
        include: {
          session: { select: { id: true, title: true, liveTime: true, cover: true } },
        },
        skip,
        take,
      }),
      this.prisma.liveClip.count({ where }),
    ]);

    const mapped = list.map((clip) => ({
      id: clip.id,
      title: clip.title,
      artist: clip.artist,
      cover: clip.coverUrl ?? clip.session?.cover,
      url: clip.fileUrl,
      duration: clip.duration,
      trackType: 'live_clip' as const,
      sessionId: clip.sessionId,
      sessionName: clip.session?.title ?? '',
      liveTime: clip.session?.liveTime?.toISOString() ?? '',
      trackIndex: clip.trackIndex,
    }));

    return buildPaginatedResult(mapped, total, page, limit);
  }
}