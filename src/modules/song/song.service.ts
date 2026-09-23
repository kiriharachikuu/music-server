import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { readLyricFile } from '../admin/admin-resource.helpers';
import {
  buildPaginatedResult,
  parsePagination,
} from '../../common/utils/pagination.util';

/** 无损源扩展名集合 (default 原始档按此判断是否为无损) */
const LOSSLESS_EXTS = new Set(['flac', 'wav', 'aiff', 'aif', 'alac', 'ape']);

/** 从 URL 提取小写扩展名 (去 query/hash, 无扩展名返回空串) */
function extFromUrl(url?: string | null): string {
  const name = (url || '').split('?')[0].split('#')[0];
  const idx = name.lastIndexOf('.');
  return idx >= 0 ? name.slice(idx + 1).toLowerCase() : '';
}

/**
 * 音质档位渲染元数据 (服务端统一口径, 客户端直接展示, 不再自行判定格式)
 * - 转码档 (high/medium/low): 固定文案
 * - 原始档 (default): 按源文件扩展名判断, 无损源显示"无损 (SQ)", 有损源显示"原始音质"
 */
function buildQualityMeta(level: string, fileUrl?: string | null) {
  if (level === 'high') {
    return {
      name: '极高品质',
      label: '极高 (HQ)',
      badge: 'HQ',
      desc: '近 CD 音质的细节体验，最高 320kbps MP3',
      isLossless: false,
    };
  }
  if (level === 'medium') {
    return {
      name: '良好音质',
      label: '良好 (MQ)',
      badge: 'MQ',
      desc: '音质与体积均衡，192kbps MP3，日常聆听推荐',
      isLossless: false,
    };
  }
  if (level === 'low') {
    return {
      name: '标准音质',
      label: '标准',
      badge: '标',
      desc: '节省流量，128kbps MP3，适合网络较差环境',
      isLossless: false,
    };
  }
  // default 原始档
  const ext = extFromUrl(fileUrl);
  if (LOSSLESS_EXTS.has(ext)) {
    return {
      name: '无损音质',
      label: '无损 (SQ)',
      badge: 'SQ',
      desc:
        ext === 'flac'
          ? 'FLAC 无损格式，完整保留音频细节'
          : `${ext.toUpperCase()} 无损格式，完整保留音频细节`,
      isLossless: true,
    };
  }
  return {
    name: '原始音质',
    label: '原始音质',
    badge: '原',
    desc: ext ? `原始文件 · ${ext.toUpperCase()} 格式` : '未经转码的原始音频文件',
    isLossless: false,
  };
}

@Injectable()
export class SongService {
  private readonly logger = new Logger(SongService.name);
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 公开单曲列表（分页 + 排序）
   * - 仅返回 status=PUBLISHED 且 deletedAt=null 的单曲
   * - 排序：latest=releaseDate desc, oldest=releaseDate asc, hottest=plays desc, name=title asc
   * - include album 关联
   */
  async list(query: {
    page?: string;
    limit?: string;
    pageSize?: string;
    sort?: string;
  }) {
    const { page, limit, skip, take } = parsePagination(query);
    const sort = query.sort ?? 'latest';

    const orderBy =
      sort === 'hottest'
        ? { plays: 'desc' as const }
        : sort === 'name'
          ? { title: 'asc' as const }
          : sort === 'oldest'
            ? { releaseDate: 'asc' as const }
            : { releaseDate: 'desc' as const };

    const where = { deletedAt: null, status: 'PUBLISHED' as const };

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
      artistId: song.songArtists?.[0]?.artistId ?? null,
    }));

    return buildPaginatedResult(mapped, total, page, limit);
  }

  /** 歌曲详情：包含专辑与标签 */
  async getDetail(id: string) {
    const song = await this.prisma.song.findFirst({
      where: { id, deletedAt: null, status: 'PUBLISHED' },
      include: {
        album: true,
        songTags: { include: { tag: true } },
        songArtists: {
          take: 1,
          orderBy: { sort: 'asc' },
          include: { artist: { select: { id: true } } },
        },
      },
    });
    if (!song) {
      throw new NotFoundException('歌曲不存在');
    }
    return {
      ...song,
      artistId: song.songArtists?.[0]?.artistId ?? null,
    };
  }

  /**
   * 批量查询曲目详情（单曲 + 歌切混合，一次请求最多 100 首）
   * - 按传入 ids 顺序返回，未命中/未发布的 ID 静默跳过
   * - 统一基础字段：id / title / artist / album / cover / duration + trackType
   */
  async batchGetTracks(ids: string[]): Promise<unknown[]> {
    const uniqueIds = Array.from(new Set(ids));

    const [songs, clips] = await Promise.all([
      this.prisma.song.findMany({
        where: { id: { in: uniqueIds }, deletedAt: null, status: 'PUBLISHED' },
        include: {
          album: { select: { id: true, name: true, cover: true } },
          songArtists: {
            take: 1,
            orderBy: { sort: 'asc' },
            include: { artist: { select: { id: true } } },
          },
        },
      }),
      this.prisma.liveClip.findMany({
        where: { id: { in: uniqueIds }, status: 'PUBLISHED' },
        include: {
          session: {
            select: { id: true, title: true, liveTime: true, cover: true },
          },
        },
      }),
    ]);

    const songMap = new Map(
      songs.map((s) => [
        s.id,
        {
          id: s.id,
          trackType: 'song' as const,
          title: s.title,
          artist: s.artist,
          artistId: s.songArtists?.[0]?.artistId ?? null,
          albumId: s.albumId,
          albumName: s.album?.name ?? null,
          album: s.album
            ? { id: s.album.id, name: s.album.name, cover: s.album.cover }
            : null,
          cover: s.coverUrl ?? s.album?.cover ?? null,
          coverUrl: s.coverUrl ?? s.album?.cover ?? null,
          duration: s.duration,
          fileUrl: s.fileUrl,
          url: s.fileUrl,
          playCount: s.plays,
          releaseDate: s.releaseDate.toISOString(),
        },
      ]),
    );
    const clipMap = new Map(
      clips.map((c) => [
        c.id,
        {
          id: c.id,
          trackType: 'live_clip' as const,
          title: c.title,
          artist: c.artist,
          artistId: null,
          albumId: null,
          albumName: null,
          album: null,
          cover: c.coverUrl ?? c.session?.cover ?? null,
          coverUrl: c.coverUrl ?? c.session?.cover ?? null,
          duration: c.duration,
          fileUrl: c.fileUrl,
          url: c.fileUrl,
          sessionId: c.sessionId,
          sessionName: c.session?.title ?? '',
          sessionCover: c.session?.cover ?? null,
          liveTime: c.session?.liveTime?.toISOString() ?? '',
          trackIndex: c.trackIndex,
        },
      ]),
    );

    const result: unknown[] = [];
    for (const id of uniqueIds) {
      const track = songMap.get(id) ?? clipMap.get(id);
      if (track) result.push(track);
    }
    return result;
  }

  /**
   * 获取歌曲音质列表
   * - 从 SongQuality 表查询该歌曲的所有音质版本
   * - 若无音质数据，返回默认音质选项（使用原始文件）
   * - 同时支持 official 歌曲和 live_clip 直播歌切
   */
  async getQualities(id: string) {
    // 先查 song 表
    const song = await this.prisma.song.findFirst({
      where: { id, deletedAt: null, status: 'PUBLISHED' },
      select: { fileUrl: true },
    });

    if (song) {
      const qualities = await this.prisma.songQuality.findMany({
        where: { songId: id },
        select: {
          quality: true,
          bitrate: true,
          fileUrl: true,
          fileSize: true,
        },
        orderBy: [
          // 高音质优先：HIGH → MEDIUM → LOW
          { quality: 'asc' },
        ],
      });

      if (qualities.length === 0) {
        return [
          {
            level: 'default' as const,
            quality: 'DEFAULT',
            bitrate: 0,
            fileUrl: song.fileUrl,
            fileSize: 0,
            ...buildQualityMeta('default', song.fileUrl),
          },
        ];
      }

      // 按音质从高到低排序：HIGH → MEDIUM → LOW
      const qualityOrder: Record<string, number> = {
        HIGH: 0,
        MEDIUM: 1,
        LOW: 2,
      };
      const sorted = [...qualities].sort(
        (a, b) =>
          (qualityOrder[a.quality] ?? 99) - (qualityOrder[b.quality] ?? 99),
      );

      return [
        ...sorted.map((q) => ({
          level: q.quality.toLowerCase() as 'high' | 'medium' | 'low',
          quality: q.quality,
          bitrate: q.bitrate,
          fileUrl: q.fileUrl,
          fileSize: q.fileSize,
          ...buildQualityMeta(q.quality.toLowerCase(), q.fileUrl),
        })),
        // 追加原始文件档（上传的源文件，可能为 FLAC/WAV 等无损格式），供下载无损使用
        ...(song.fileUrl
          ? [
              {
                level: 'default' as const,
                quality: 'DEFAULT',
                bitrate: 0,
                fileUrl: song.fileUrl,
                fileSize: 0,
                ...buildQualityMeta('default', song.fileUrl),
              },
            ]
          : []),
      ];
    }

    // song 表没找到，查 liveClip 表
    const clip = await this.prisma.liveClip.findFirst({
      where: { id, status: 'PUBLISHED' },
      select: { fileUrl: true },
    });
    if (!clip) {
      throw new NotFoundException('歌曲不存在');
    }

    // 歌切只有原始文件，返回默认音质（附渲染元数据，由服务端判定格式口径）
    return [
      {
        level: 'default' as const,
        quality: 'DEFAULT',
        bitrate: 0,
        fileUrl: clip.fileUrl,
        fileSize: 0,
        ...buildQualityMeta('default', clip.fileUrl),
      },
    ];
  }

  /**
   * 获取歌词：优先返回 lyricContent（在线编辑的正文）
   * - 若 lyricContent 为空，回退到读取 lyricUrl 文件内容
   * - 复用 admin-resource.helpers.readLyricFile（已加固路径穿越校验）
   * - 无歌词或读取失败：返回空字符串
   * - 同时支持 official 歌曲和 live_clip 直播歌切
   */
  async getLyric(id: string): Promise<string> {
    this.logger.debug(`获取歌词: id=${id}`);

    // 先查 song 表
    const song = await this.prisma.song.findFirst({
      where: { id, deletedAt: null, status: 'PUBLISHED' },
      select: { lyricContent: true, lyricUrl: true },
    });
    if (song) {
      this.logger.debug(
        `找到官方歌曲: id=${id}, lyricContent=${!!song.lyricContent}, lyricUrl=${song.lyricUrl}`,
      );
      if (song.lyricContent) return song.lyricContent;
      const content = await readLyricFile(song.lyricUrl);
      this.logger.debug(
        `从文件读取歌词: id=${id}, 长度=${content?.length || 0}`,
      );
      return content;
    }

    // song 表没找到，查 liveClip 表
    this.logger.debug(`song 表未找到，查找 liveClip: id=${id}`);
    const clip = await this.prisma.liveClip.findFirst({
      where: { id, status: 'PUBLISHED' },
      select: { lyricContent: true },
    });
    if (!clip) {
      // 更友好的错误：先检查 liveClip 是否存在但状态不对
      const anyClip = await this.prisma.liveClip.findFirst({
        where: { id },
        select: { id: true, status: true },
      });
      if (anyClip) {
        this.logger.warn(
          `liveClip 存在但状态非 PUBLISHED: id=${id}, status=${anyClip.status}`,
        );
      }
      throw new NotFoundException('歌曲不存在');
    }

    this.logger.debug(
      `找到 liveClip: id=${id}, lyricContent=${clip.lyricContent ? `长度${clip.lyricContent.length}` : '空'}`,
    );
    return clip.lyricContent ?? '';
  }
}
