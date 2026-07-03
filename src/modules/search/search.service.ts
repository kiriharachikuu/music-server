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
    ip?: string;
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

    // 记录搜索词到 SearchLog（fire-and-forget，用于热门搜索词统计）
    void this.recordSearchKeyword(q, query.ip);

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

