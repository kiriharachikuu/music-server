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
   * 获取歌词：优先返回 lyricContent（在线编辑的正文）
   * - 若 lyricContent 为空，回退到读取 lyricUrl 文件内容
   * - 复用 admin-resource.helpers.readLyricFile（已加固路径穿越校验）
   * - 无歌词或读取失败：返回空字符串
   */
  async getLyric(id: string): Promise<string> {
    const song = await this.prisma.song.findFirst({
      where: { id, deletedAt: null, status: 'PUBLISHED' },
      select: { lyricContent: true, lyricUrl: true },
    });
    if (!song) {
      throw new NotFoundException('歌曲不存在');
    }
    // 优先返回在线编辑的歌词正文
    if (song.lyricContent) return song.lyricContent;
    return readLyricFile(song.lyricUrl);
  }
}
