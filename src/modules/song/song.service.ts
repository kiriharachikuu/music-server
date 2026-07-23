import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { readLyricFile } from '../admin/admin-resource.helpers';

@Injectable()
export class SongService {
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
   */
  async getQualities(id: string) {
    const song = await this.prisma.song.findFirst({
      where: { id, deletedAt: null, status: 'PUBLISHED' },
      select: { fileUrl: true },
    });

    if (!song) {
      throw new NotFoundException('歌曲不存在');
    }

    const qualities = await this.prisma.songQuality.findMany({
      where: { songId: id },
      select: {
        quality: true,
        bitrate: true,
        fileUrl: true,
        fileSize: true,
      },
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

    return qualities.map((q) => ({
      level: q.quality.toLowerCase() as 'high' | 'medium' | 'low',
      quality: q.quality,
      bitrate: q.bitrate,
      fileUrl: q.fileUrl,
      fileSize: q.fileSize,
    }));
  }

  /**
   * 获取歌词：优先返回 lyricContent（在线编辑的正文）
   * - 若 lyricContent 为空，回退到读取 lyricUrl 文件内容
   * - 复用 admin-resource.helpers.readLyricFile（已加固路径穿越校验）
   * - 无歌词或读取失败：返回空字符串
   * - 同时支持 official 歌曲和 live_clip 直播歌切
   */
  async getLyric(id: string): Promise<string> {
    // 先查 song 表
    const song = await this.prisma.song.findFirst({
      where: { id, deletedAt: null, status: 'PUBLISHED' },
      select: { lyricContent: true, lyricUrl: true },
    });
    if (song) {
      if (song.lyricContent) return song.lyricContent;
      return readLyricFile(song.lyricUrl);
    }

    // song 表没找到，查 liveClip 表
    const clip = await this.prisma.liveClip.findFirst({
      where: { id, status: 'PUBLISHED' },
      select: { lyricContent: true },
    });
    if (!clip) {
      throw new NotFoundException('歌曲不存在');
    }
    return clip.lyricContent ?? '';
  }
}
