import { Injectable, NotFoundException } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import { PrismaService } from '../../prisma/prisma.service';

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
   * 获取歌词：读取 lyricUrl 内容返回 LRC 文本
   * - http(s) 远程地址：通过 fetch 拉取
   * - 本地相对地址：相对项目根目录解析后读取
   * - 无 lyricUrl 或读取失败：返回空字符串
   */
  async getLyric(id: string): Promise<string> {
    const song = await this.prisma.song.findFirst({
      where: { id, deletedAt: null, status: 'PUBLISHED' },
      select: { lyricUrl: true },
    });
    if (!song) {
      throw new NotFoundException('歌曲不存在');
    }
    return this.readLyric(song.lyricUrl);
  }

  private async readLyric(lyricUrl?: string | null): Promise<string> {
    if (!lyricUrl) return '';
    try {
      // 远程地址直接抓取文本
      if (/^https?:\/\//i.test(lyricUrl)) {
        const res = await fetch(lyricUrl);
        if (!res.ok) return '';
        return await res.text();
      }
      // 本地地址：去除前导斜杠后相对项目根目录解析
      const rel = lyricUrl.replace(/^\/+/, '');
      const abs = path.resolve(process.cwd(), rel);
      return await fs.readFile(abs, 'utf-8');
    } catch {
      return '';
    }
  }
}
