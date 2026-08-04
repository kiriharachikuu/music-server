import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { readLyricFile } from '../admin/admin-resource.helpers';

@Injectable()
export class SongService {
  private readonly logger = new Logger(SongService.name);
  constructor(private readonly prisma: PrismaService) {}

  /** 歌曲详情：包含专辑与标签 */
  async getDetail(id: string) {
    const song = await this.prisma.song.findFirst({
      where: { id, deletedAt: null, status: 'PUBLISHED' },
      include: {
        album: true,
        songTags: { include: { tag: true } },
      },
    });
    if (!song) {
      throw new NotFoundException('歌曲不存在');
    }
    return song;
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
          },
        ];
      }

      // 按音质从高到低排序：HIGH → MEDIUM → LOW
      const qualityOrder: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
      const sorted = [...qualities].sort(
        (a, b) => (qualityOrder[a.quality] ?? 99) - (qualityOrder[b.quality] ?? 99),
      );

      return sorted.map((q) => ({
        level: q.quality.toLowerCase() as 'high' | 'medium' | 'low',
        quality: q.quality,
        bitrate: q.bitrate,
        fileUrl: q.fileUrl,
        fileSize: q.fileSize,
      }));
    }

    // song 表没找到，查 liveClip 表
    const clip = await this.prisma.liveClip.findFirst({
      where: { id, status: 'PUBLISHED' },
      select: { fileUrl: true },
    });
    if (!clip) {
      throw new NotFoundException('歌曲不存在');
    }

    // 歌切只有原始文件，返回默认音质
    return [
      {
        level: 'default' as const,
        quality: 'DEFAULT',
        bitrate: 0,
        fileUrl: clip.fileUrl,
        fileSize: 0,
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
      this.logger.debug(`找到官方歌曲: id=${id}, lyricContent=${!!song.lyricContent}, lyricUrl=${song.lyricUrl}`);
      if (song.lyricContent) return song.lyricContent;
      const content = await readLyricFile(song.lyricUrl);
      this.logger.debug(`从文件读取歌词: id=${id}, 长度=${content?.length || 0}`);
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
        this.logger.warn(`liveClip 存在但状态非 PUBLISHED: id=${id}, status=${anyClip.status}`);
      }
      throw new NotFoundException('歌曲不存在');
    }

    this.logger.debug(`找到 liveClip: id=${id}, lyricContent=${clip.lyricContent ? `长度${clip.lyricContent.length}` : '空'}`);
    return clip.lyricContent ?? '';
  }
}
