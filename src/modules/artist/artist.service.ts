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

    // 歌切统计：优先用 LiveClipArtist 关联表，回退用 artist 字符串 contains
    // 关联表统计（防御式：关联表尚未生成时走 catch 兜底）
    const liveClipArtistModel = (this.prisma as unknown as {
      liveClipArtist?: {
        groupBy: (args: {
          by: string[];
          where: Record<string, unknown>;
          _count: Record<string, true>;
        }) => Promise<Array<{ artistId: string; _count: { artistId: number } }>>;
      };
    }).liveClipArtist;
    const relatedCountRows: Array<{
      artistId: string;
      _count: { artistId: number };
    }> = liveClipArtistModel
      ? await liveClipArtistModel
          .groupBy({
            by: ['artistId'],
            where: {
              artistId: { in: list.map((a) => a.id) },
              clip: { status: 'PUBLISHED' },
            },
            _count: { artistId: true },
          })
          .catch(
            () =>
              [] as Array<{ artistId: string; _count: { artistId: number } }>,
          )
      : [];
    const relatedCountMap = new Map(
      relatedCountRows.map((r) => [r.artistId, r._count.artistId] as const),
    );

    // 字符串 contains 兜底（兼容关联表尚未建立的历史数据）
    const stringCountRows = await this.prisma.liveClip.groupBy({
      by: ['artist'],
      where: {
        status: 'PUBLISHED',
        OR: list.map((a) => ({ artist: { contains: a.name } })),
      },
      _count: { _all: true },
    });
    const stringCountMap = new Map<string, number>();
    for (const a of list) {
      const total2 = stringCountRows
        .filter((g) => g.artist.includes(a.name))
        .reduce((s, g) => s + g._count._all, 0);
      stringCountMap.set(a.id, total2);
    }

    // 优先关联表（更精确），兜底字符串 contains
    const clipCountMap = new Map<string, number>();
    for (const a of list) {
      const related = relatedCountMap.get(a.id) ?? 0;
      const stringMatch = stringCountMap.get(a.id) ?? 0;
      clipCountMap.set(a.id, related > 0 ? related : stringMatch);
    }

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
        clipCount: clipCountMap.get(a.id) ?? 0,
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
          take: 10,
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
    const songs = artist.songArtists.map((sa) => ({
      ...sa.song,
      artistId: sa.song.songArtists?.[0]?.artistId ?? id,
    }));
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
      artistId: id,
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
        include: {
          album: true,
          songArtists: {
            take: 1,
            orderBy: { sort: 'asc' },
            include: { artist: { select: { id: true } } },
          },
        },
      }),
      this.prisma.song.count({ where }),
    ]);

    const mapped = list.map((song) => ({
      ...song,
      artistId: song.songArtists?.[0]?.artistId ?? id,
    }));
    return buildPaginatedResult(mapped, total, page, limit);
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