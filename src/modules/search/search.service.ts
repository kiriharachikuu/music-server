import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  buildPaginatedResult,
  parsePagination,
  type PaginatedResult,
} from '../../common/utils/pagination.util';

export interface SongWithAlbum {
  id: string;
  title: string;
  artist: string;
  duration: number;
  coverUrl: string | null;
  fileUrl: string;
  albumName?: string;
  album: { id: string; name: string } | null;
}

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 综合搜索：歌曲（分页） + 专辑（前20） + 歌单（前20）
   * 支持日期范围过滤：startDate 和 endDate（格式：YYYY-MM-DD）
   */
  async search(query: {
    q?: string;
    sort?: string;
    tag?: string;
    startDate?: string;
    endDate?: string;
    page?: string;
    limit?: string;
    pageSize?: string;
    ip?: string;
  }) {
    const q = (query.q ?? '').trim();
    const tag = (query.tag ?? '').trim();
    const startDate = query.startDate?.trim();
    const endDate = query.endDate?.trim();

    if (!q) {
      return {
        songs: buildPaginatedResult<SongWithAlbum>([], 0, 1, 20),
        albums: [],
        playlists: [],
        artists: [],
      };
    }

    // 记录搜索词到 SearchLog（fire-and-forget，用于热门搜索词统计）
    void this.recordSearchKeyword(q, query.ip);

    const dateFilter = this.buildDateFilter(startDate, endDate);

    const songWhere = {
      deletedAt: null,
      status: 'PUBLISHED' as const,
      OR: [
        { title: { contains: q } },
        { artist: { contains: q } },
        { album: { name: { contains: q } } },
        {
          playlistSongs: {
            some: { playlist: { name: { contains: q } } },
          },
        },
      ],
      ...(tag ? { songTags: { some: { tag: { name: tag } } } } : {}),
      ...dateFilter,
    };

    const orderBy =
      query.sort === 'plays'
        ? { plays: 'desc' as const }
        : { releaseDate: 'desc' as const };

    const pagination = parsePagination(query);

    const [songTotal, songs, albums, playlists, dbArtists] = await Promise.all([
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
          OR: [
            { name: { contains: q } },
            { artist: { contains: q } },
          ],
        },
        take: 20,
      }),
      this.prisma.playlist.findMany({
        where: {
          deletedAt: null,
          isPublic: true,
          name: { contains: q },
        },
        orderBy: [
          { isSystem: 'desc' },
          { playCount: 'desc' },
        ],
        take: 20,
        include: {
          user: { select: { id: true, username: true, avatar: true } },
        },
      }),
      this.prisma.artist.findMany({
        where: {
          deletedAt: null,
          name: { contains: q },
        },
        take: 20,
        select: { id: true, name: true, avatar: true },
      }),
    ]);

    const mappedSongs = songs.map((song) => ({
      ...song,
      albumName: song.album?.name,
    })) as unknown as SongWithAlbum[];

    const artists = dbArtists.length > 0
      ? dbArtists.map((a) => ({
          id: a.id,
          name: a.name,
          cover: a.avatar,
          avatar: a.avatar,
          songCount: 0,
        }))
      : (() => {
          const map = new Map<string, number>();
          for (const song of songs) {
            const count = map.get(song.artist) ?? 0;
            map.set(song.artist, count + 1);
          }
          return Array.from(map.entries())
            .map(([name, songCount]) => ({ id: undefined, name, songCount, cover: null as string | null, avatar: null as string | null }))
            .slice(0, 20);
        })();

    return {
      songs: buildPaginatedResult(
        mappedSongs,
        songTotal,
        pagination.page,
        pagination.limit,
      ),
      albums,
      playlists,
      artists,
    };
  }

  /**
   * 构建日期范围过滤条件
   * @param startDate 开始日期（YYYY-MM-DD）
   * @param endDate 结束日期（YYYY-MM-DD）
   */
  private buildDateFilter(
    startDate?: string,
    endDate?: string,
  ): Record<string, unknown> {
    const filter: Record<string, unknown> = {};

    if (startDate || endDate) {
      filter.releaseDate = {} as Record<string, unknown>;

      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        (filter.releaseDate as Record<string, Date>).gte = start;
      }

      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        (filter.releaseDate as Record<string, Date>).lte = end;
      }
    }

    return filter;
  }

  /**
   * 热门搜索词：取最近 7 天 SearchLog 中搜索次数最多的 10 个关键词。
   * 当历史日志不足时，回退为播放量 Top10 歌曲标题，避免空列表。
   */
  async getHotKeywords(): Promise<string[]> {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const rows = await this.prisma.searchLog.groupBy({
      by: ['keyword'],
      where: { createdAt: { gte: sevenDaysAgo } },
      _count: { keyword: true },
      orderBy: { _count: { keyword: 'desc' } },
      take: 10,
    });
    if (rows.length > 0) {
      return rows.map((r) => r.keyword);
    }
    // 日志不足时回退：播放量 Top10 歌曲标题（保证前端始终有热门词展示）
    const songs = await this.prisma.song.findMany({
      where: { deletedAt: null, status: 'PUBLISHED' },
      orderBy: { plays: 'desc' },
      take: 10,
      select: { title: true },
    });
    return songs.map((s) => s.title);
  }

  /**
   * 记录搜索词：同一关键词 + 同一 IP 在 1 小时内只刷新时间不重复新增，
   * 避免单 IP 短时间刷量；同时清理 30 天前的旧日志，避免表无限膨胀。
   * 任何异常均静默吞掉，不影响搜索结果。
   */
  private async recordSearchKeyword(keyword: string, ip?: string) {
    try {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

      const recent = await this.prisma.searchLog.findFirst({
        where: {
          keyword,
          createdAt: { gte: oneHourAgo },
          ...(ip ? { ip } : { ip: null }),
        },
      });
      if (recent) {
        await this.prisma.searchLog.update({
          where: { id: recent.id },
          data: { createdAt: now },
        });
        return;
      }

      await this.prisma.searchLog.create({
        data: { keyword, ip: ip ?? null },
      });

      // 清理 30 天前的旧日志（轻量索引查询，保持表体量可控）
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      await this.prisma.searchLog.deleteMany({
        where: { createdAt: { lt: thirtyDaysAgo } },
      });
    } catch {
      // 记录失败不影响搜索
    }
  }
}

