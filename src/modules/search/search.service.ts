import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  buildPaginatedResult,
  parsePagination,
} from '../../common/utils/pagination.util';
import { toPinyinInitials } from './pinyin.util';
import { expandQuery, type SearchQuery } from './query-expander';

export interface SongWithAlbum {
  id: string;
  title: string;
  artist: string;
  duration: number;
  coverUrl: string | null;
  fileUrl: string;
  albumName?: string;
  album: { id: string; name: string; cover?: string | null } | null;
  artistId?: string | null;
  /** 统一 track 基础字段别名（id/title/artist/album/cover/duration） */
  cover?: string | null;
  url?: string;
  trackType?: 'song';
}

type SortMode = 'relevance' | 'plays' | 'time' | 'time_asc';

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 综合搜索：歌曲（分页） + 专辑（前20） + 歌单（前20） + 艺人（前20） + 直播歌切（前10） + 直播场次（前10）
   * 支持：
   *   - 同义词扩展（SearchSynonym 表）
   *   - 拼音首字母匹配（tiny-pinyin）
   *   - 相关度打分（默认按相关度排序；可指定 sort=plays|time|time_asc）
   *   - 日期范围过滤：startDate / endDate（YYYY-MM-DD）
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
        liveClips: buildPaginatedResult([], 0, 1, 20),
        liveSessions: buildPaginatedResult([], 0, 1, 20),
      };
    }

    // 记录搜索词到 SearchLog（fire-and-forget，用于热门搜索词统计）
    void this.recordSearchKeyword(q, query.ip);

    // 1) 展开查询：原文 + 同义词 + 拼音首字母
    const searchQuery = await expandQuery(this.prisma, q);
    // 用于 OR-contains 的去重 term 列表
    const terms = this.uniqueTerms(searchQuery);
    // 排序模式（默认 relevance）
    const sort = this.parseSortMode(query.sort);

    const dateFilter = this.buildDateFilter(startDate, endDate);

    // 2) 歌曲查询：把所有 term 拼到一个 OR 子句里
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
        // 同义词 / 拼音：每个 term 都尝试匹配 title / artist / album.name
        ...this.buildSongTermClauses(terms, q),
      ],
      ...(tag ? { songTags: { some: { tag: { name: tag } } } } : {}),
      ...dateFilter,
    };

    const pagination = parsePagination(query);

    const liveClipWhere = {
      status: 'PUBLISHED' as const,
      OR: [
        { title: { contains: q } },
        { artist: { contains: q } },
        ...this.buildLiveClipTermClauses(terms, q),
      ],
    };

    const liveSessionWhere = {
      status: 'PUBLISHED' as const,
      deletedAt: null,
      OR: [
        { title: { contains: q } },
        { artist: { contains: q } },
        ...this.buildLiveClipTermClauses(terms, q),
      ],
    };

    // 3) 并发拉取全部子模块；歌曲/歌切数量大，先拉够再做打分排序
    //    orderBy：相关度排序在内存里做（不传 orderBy 让 Prisma 不参与排序）；
    //    sort=plays / time / time_asc 仍然走 Prisma 的索引排序以保证性能。
    const songOrderBy =
      sort === 'plays'
        ? { plays: 'desc' as const }
        : sort === 'time'
          ? { releaseDate: 'desc' as const }
          : sort === 'time_asc'
            ? { releaseDate: 'asc' as const }
            : undefined;

    const [
      songTotal,
      songs,
      albums,
      playlists,
      dbArtists,
      liveClips,
      liveSessions,
    ] = await Promise.all([
      this.prisma.song.count({ where: songWhere }),
      this.prisma.song.findMany({
        where: songWhere,
        ...(songOrderBy ? { orderBy: songOrderBy } : {}),
        skip: pagination.skip,
        take: pagination.take,
        include: {
          album: { select: { id: true, name: true, cover: true } },
          songArtists: {
            take: 1,
            orderBy: { sort: 'asc' },
            where: { artist: { hasHomepage: true } },
            include: { artist: { select: { id: true } } },
          },
        },
      }),
      this.prisma.album.findMany({
        where: {
          deletedAt: null,
          OR: [
            { name: { contains: q } },
            { artist: { contains: q } },
            ...this.buildAlbumTermClauses(terms, q),
          ],
        },
        take: 20,
      }),
      this.prisma.playlist.findMany({
        where: {
          deletedAt: null,
          isPublic: true,
          OR: [
            { name: { contains: q } },
            ...this.buildPlaylistTermClauses(terms, q),
          ],
        },
        orderBy: [{ isSystem: 'desc' }, { playCount: 'desc' }],
        take: 20,
        include: {
          user: { select: { id: true, username: true, avatar: true } },
        },
      }),
      this.prisma.artist.findMany({
        where: {
          deletedAt: null,
          // 虚拟歌手不参与歌手搜索结果
          hasHomepage: true,
          OR: [
            { name: { contains: q } },
            ...this.buildArtistTermClauses(terms, q),
          ],
        },
        take: 20,
        select: { id: true, name: true, avatar: true },
      }),
      this.prisma.liveClip.findMany({
        where: liveClipWhere,
        orderBy: [{ sessionId: 'asc' }, { trackIndex: 'asc' }],
        include: {
          session: {
            select: { id: true, title: true, liveTime: true, cover: true },
          },
        },
        take: 10,
      }),
      this.prisma.liveSession.findMany({
        where: liveSessionWhere,
        orderBy: { liveTime: 'desc' },
        take: 10,
      }),
    ]);

    // 4) 内存打分 + 相关度排序（仅对 songs；其它子模块保持原样）
    const scoredSongs = this.scoreAndSortSongs(songs, searchQuery, sort);

    const mappedSongs = scoredSongs.map((song) => ({
      ...song,
      albumName: song.album?.name,
      artistId: song.songArtists?.[0]?.artistId ?? null,
      // 统一 track 基础字段别名
      trackType: 'song' as const,
      cover: song.coverUrl ?? song.album?.cover ?? null,
      url: song.fileUrl,
    })) as unknown as SongWithAlbum[];

    let artists: Array<{
      id?: string;
      name: string;
      songCount: number;
      clipCount: number;
      cover: string | null;
      avatar: string | null;
    }>;

    if (dbArtists.length > 0) {
      const artistIds = dbArtists.map((a) => a.id);
      const [songCountRows, clipCountRows] = await Promise.all([
        this.prisma.songArtist.groupBy({
          by: ['artistId'],
          where: {
            artistId: { in: artistIds },
            song: {
              deletedAt: null,
              status: 'PUBLISHED',
            },
          },
          _count: { artistId: true },
        }),
        this.prisma.liveClipArtist.groupBy({
          by: ['artistId'],
          where: {
            artistId: { in: artistIds },
            clip: { status: 'PUBLISHED' },
          },
          _count: { artistId: true },
        }),
      ]);
      const countMap = new Map(
        songCountRows.map((r) => [r.artistId, r._count.artistId]),
      );
      const clipCountMap = new Map(
        clipCountRows.map((r) => [r.artistId, r._count.artistId]),
      );
      artists = dbArtists.map((a) => ({
        id: a.id,
        name: a.name,
        cover: a.avatar,
        avatar: a.avatar,
        songCount: countMap.get(a.id) ?? 0,
        clipCount: clipCountMap.get(a.id) ?? 0,
      }));
    } else {
      const map = new Map<string, number>();
      for (const song of songs) {
        const count = map.get(song.artist) ?? 0;
        map.set(song.artist, count + 1);
      }
      const names = Array.from(map.keys());
      // Artist 表关键词未命中时，按歌曲 artist 字符串回查 Artist 表，尽量补齐 id / avatar
      const namedArtists = names.length
        ? await this.prisma.artist.findMany({
            where: { deletedAt: null, hasHomepage: true, name: { in: names } },
            select: { id: true, name: true, avatar: true },
          })
        : [];
      const artistByName = new Map(namedArtists.map((a) => [a.name, a]));
      const clipRows = names.length
        ? await this.prisma.liveClip.groupBy({
            by: ['artist'],
            where: { status: 'PUBLISHED', artist: { in: names } },
            _count: { artist: true },
          })
        : [];
      const clipCountByName = new Map(
        clipRows.map((r) => [r.artist, r._count.artist]),
      );
      artists = names
        .map((name) => {
          const hit = artistByName.get(name);
          return {
            id: hit?.id,
            name,
            songCount: map.get(name) ?? 0,
            clipCount: clipCountByName.get(name) ?? 0,
            cover: hit?.avatar ?? null,
            avatar: hit?.avatar ?? null,
          };
        })
        .slice(0, 20);
    }

    // 映射 liveClips -> LiveClipTrack 格式（与 searchByCategory 一致）
    const mappedLiveClips = liveClips.map((clip) => ({
      id: clip.id,
      title: clip.title,
      artist: clip.artist,
      cover: clip.coverUrl ?? clip.session?.cover,
      coverUrl: clip.coverUrl ?? clip.session?.cover ?? null,
      url: clip.fileUrl,
      fileUrl: clip.fileUrl,
      albumName: null,
      album: null,
      duration: clip.duration,
      trackType: 'live_clip' as const,
      sessionId: clip.sessionId,
      sessionName: clip.session?.title ?? '',
      liveTime: clip.session?.liveTime?.toISOString() ?? '',
      trackIndex: clip.trackIndex,
    }));

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
      liveClips: buildPaginatedResult(
        mappedLiveClips,
        mappedLiveClips.length,
        1,
        mappedLiveClips.length || 20,
      ),
      liveSessions: buildPaginatedResult(
        liveSessions,
        liveSessions.length,
        1,
        liveSessions.length || 20,
      ),
    };
  }

  /**
   * 带分类的搜索：支持按 category 筛选特定类型结果
   * category: 'live_clips' | 'live_sessions'
   *
   * 同样集成同义词 + 拼音首字母扩展。
   */
  async searchByCategory(query: {
    q?: string;
    category?: string;
    page?: string;
    limit?: string;
    pageSize?: string;
  }) {
    const q = (query.q ?? '').trim();
    const pagination = parsePagination(query);

    if (!q) {
      return {
        liveClips: buildPaginatedResult([], 0, 1, 20),
        liveSessions: buildPaginatedResult([], 0, 1, 20),
      };
    }

    // 展开 term
    const searchQuery = await expandQuery(this.prisma, q);
    const terms = this.uniqueTerms(searchQuery);

    if (query.category === 'live_clips') {
      const where: any = {
        status: 'PUBLISHED',
        OR: [
          { title: { contains: q } },
          { artist: { contains: q } },
          ...this.buildLiveClipTermClauses(terms, q),
        ],
      };
      const [list, total] = await this.prisma.$transaction([
        this.prisma.liveClip.findMany({
          where,
          orderBy: [{ sessionId: 'asc' }, { trackIndex: 'asc' }],
          include: {
            session: {
              select: { id: true, title: true, liveTime: true, cover: true },
            },
          },
          skip: pagination.skip,
          take: pagination.take,
        }),
        this.prisma.liveClip.count({ where }),
      ]);
      // 转换为前端 LiveClipTrack 格式：扁平化 session 字段 + 添加 trackType
      const mapped = list.map((clip) => ({
        id: clip.id,
        title: clip.title,
        artist: clip.artist,
        cover: clip.coverUrl ?? clip.session?.cover,
        coverUrl: clip.coverUrl ?? clip.session?.cover ?? null,
        url: clip.fileUrl,
        fileUrl: clip.fileUrl,
        albumName: null,
        album: null,
        duration: clip.duration,
        trackType: 'live_clip' as const,
        sessionId: clip.sessionId,
        sessionName: clip.session?.title ?? '',
        liveTime: clip.session?.liveTime?.toISOString() ?? '',
        trackIndex: clip.trackIndex,
      }));
      return {
        liveClips: buildPaginatedResult(
          mapped,
          total,
          pagination.page,
          pagination.limit,
        ),
        liveSessions: buildPaginatedResult([], 0, 1, 20),
      };
    }

    if (query.category === 'live_sessions') {
      const where: any = {
        status: 'PUBLISHED',
        deletedAt: null,
        OR: [
          { title: { contains: q } },
          { artist: { contains: q } },
          ...this.buildLiveClipTermClauses(terms, q),
        ],
      };
      const [list, total] = await this.prisma.$transaction([
        this.prisma.liveSession.findMany({
          where,
          orderBy: { liveTime: 'desc' },
          skip: pagination.skip,
          take: pagination.take,
        }),
        this.prisma.liveSession.count({ where }),
      ]);
      return {
        liveClips: buildPaginatedResult([], 0, 1, 20),
        liveSessions: buildPaginatedResult(
          list,
          total,
          pagination.page,
          pagination.limit,
        ),
      };
    }

    return {
      liveClips: buildPaginatedResult([], 0, 1, 20),
      liveSessions: buildPaginatedResult([], 0, 1, 20),
    };
  }

  /**
   * 解析 sort 参数到合法 SortMode，无效值回退为 relevance
   */
  private parseSortMode(raw?: string): SortMode {
    switch (raw) {
      case 'plays':
        return 'plays';
      case 'time':
        return 'time';
      case 'time_asc':
        return 'time_asc';
      case 'relevance':
      default:
        return 'relevance';
    }
  }

  /**
   * 拼出 terms 中除 raw 外的其它 term，每个 term 生成 title/artist/album 三个 contains 子句
   * （q 本身已经被前几个 OR 单独覆盖；这里只补同义词 / 拼音 的匹配）
   */
  private buildSongTermClauses(terms: string[], q: string) {
    const clauses: Array<Record<string, unknown>> = [];
    for (const term of terms) {
      if (term === q.toLowerCase()) continue;
      clauses.push({ title: { contains: term } });
      clauses.push({ artist: { contains: term } });
      clauses.push({ album: { name: { contains: term } } });
    }
    return clauses;
  }

  private buildAlbumTermClauses(terms: string[], q: string) {
    const clauses: Array<Record<string, unknown>> = [];
    for (const term of terms) {
      if (term === q.toLowerCase()) continue;
      clauses.push({ name: { contains: term } });
      clauses.push({ artist: { contains: term } });
    }
    return clauses;
  }

  private buildPlaylistTermClauses(terms: string[], q: string) {
    const clauses: Array<Record<string, unknown>> = [];
    for (const term of terms) {
      if (term === q.toLowerCase()) continue;
      clauses.push({ name: { contains: term } });
    }
    return clauses;
  }

  private buildArtistTermClauses(terms: string[], q: string) {
    const clauses: Array<Record<string, unknown>> = [];
    for (const term of terms) {
      if (term === q.toLowerCase()) continue;
      clauses.push({ name: { contains: term } });
    }
    return clauses;
  }

  private buildLiveClipTermClauses(terms: string[], q: string) {
    const clauses: Array<Record<string, unknown>> = [];
    for (const term of terms) {
      if (term === q.toLowerCase()) continue;
      clauses.push({ title: { contains: term } });
      clauses.push({ artist: { contains: term } });
    }
    return clauses;
  }

  /**
   * 把 raw + synonyms 合并去重，pinyin 单独追加（如果和 raw 相同则跳过）
   */
  private uniqueTerms(query: SearchQuery): string[] {
    const set = new Set<string>();
    if (query.raw) set.add(query.raw);
    for (const s of query.synonyms) {
      if (s) set.add(s.toLowerCase());
    }
    return Array.from(set);
  }

  /**
   * 给一组 song 算相关度得分，并按当前 sort 模式排序
   *  - relevance（默认）：按 score 降序
   *  - plays / time / time_asc：Prisma 已经按这个排序，但 score 仍会被计算以便后续扩展
   *
   * 评分规则（每条记录取最高得分匹配，避免重复加分）：
   *   标题命中（raw  包含）          +4
   *   艺人命中（raw  包含）          +3
   *   专辑命中（raw  包含）          +2
   *   标题命中（同义词 包含）        +4 * 0.8
   *   艺人命中（同义词 包含）        +3 * 0.8
   *   专辑命中（同义词 包含）        +2 * 0.8
   *   标题拼音首字母 startsWith q.pinyin  +4 * 0.6
   *   艺人拼音首字母 startsWith q.pinyin  +3 * 0.6
   */
  private scoreAndSortSongs<
    T extends {
      id: string;
      title: string;
      artist: string;
      album?: { name: string } | null;
      plays: number;
      releaseDate: Date;
    },
  >(
    songs: T[],
    query: SearchQuery,
    sort: SortMode,
  ): Array<T & { score: number }> {
    const synonyms = query.synonyms;
    const pinyin = query.pinyin;
    const raw = query.raw;

    const scored = songs.map((song) => {
      let score = 0;
      const title = (song.title ?? '').toLowerCase();
      const artist = (song.artist ?? '').toLowerCase();
      const albumName = (song.album?.name ?? '').toLowerCase();

      if (raw) {
        if (title.includes(raw)) score += 4;
        if (artist.includes(raw)) score += 3;
        if (albumName.includes(raw)) score += 2;
      }

      // 同义词命中（按该同义词"是否被 raw 直接包含"判断去重，避免同义词与 raw 重复加分）
      for (const term of synonyms) {
        if (!term || term === raw || term === pinyin) continue;
        if (title.includes(term)) score += 4 * 0.8;
        if (artist.includes(term)) score += 3 * 0.8;
        if (albumName.includes(term)) score += 2 * 0.8;
      }

      // 拼音首字母前缀匹配（仅在 raw 是字母组合时启用，避免中文输入误伤）
      if (pinyin && /^[a-z]/.test(pinyin)) {
        const titlePy = toPinyinInitials(song.title ?? '');
        const artistPy = toPinyinInitials(song.artist ?? '');
        if (titlePy.startsWith(pinyin)) score += 4 * 0.6;
        else if (titlePy.includes(pinyin)) score += 4 * 0.3;
        if (artistPy.startsWith(pinyin)) score += 3 * 0.6;
        else if (artistPy.includes(pinyin)) score += 3 * 0.3;
      }

      return Object.assign({}, song, { score });
    });

    if (sort === 'relevance') {
      scored.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        // 兜底：分数相同时按播放量
        return b.plays - a.plays;
      });
    } else if (sort === 'plays') {
      scored.sort((a, b) => b.plays - a.plays);
    } else if (sort === 'time') {
      scored.sort(
        (a, b) =>
          new Date(b.releaseDate).getTime() - new Date(a.releaseDate).getTime(),
      );
    } else if (sort === 'time_asc') {
      scored.sort(
        (a, b) =>
          new Date(a.releaseDate).getTime() - new Date(b.releaseDate).getTime(),
      );
    }

    return scored;
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
      filter.releaseDate = {};

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

      // 清理 30 天前的旧日志：按 1% 概率执行，避免每次搜索都触发 deleteMany 造成性能瓶颈
      // 既能保持表体量可控，又不影响搜索主路径的响应时间
      if (Math.random() < 0.01) {
        const thirtyDaysAgo = new Date(
          now.getTime() - 30 * 24 * 60 * 60 * 1000,
        );
        await this.prisma.searchLog.deleteMany({
          where: { createdAt: { lt: thirtyDaysAgo } },
        });
      }
    } catch {
      // 记录失败不影响搜索
    }
  }
}
