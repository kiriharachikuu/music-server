import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { RankingItem, RankingKind, RankingType } from './ranking.types';

/**
 * 排行榜系统歌单服务
 *
 * 9 档榜单（综合/单曲/歌切 × 飙升/热歌/新歌）一一对应同名系统歌单：
 *  - 综合-飙升榜 / 综合-热歌榜 / 综合-新歌榜
 *  - 单曲-飙升榜 / 单曲-热歌榜 / 单曲-新歌榜
 *  - 歌切-飙升榜 / 歌切-热歌榜 / 歌切-新歌榜
 *
 * 系统歌单支持同时存歌曲（songId）和歌切（clipId），排序由 sort 字段控制。
 */

export const RANKING_NAMES: Record<string, string> = {
  'combined-soar': '综合-飙升榜',
  'combined-hot': '综合-热歌榜',
  'combined-new': '综合-新歌榜',
  'single-soar': '单曲-飙升榜',
  'single-hot': '单曲-热歌榜',
  'single-new': '单曲-新歌榜',
  'clip-soar': '歌切-飙升榜',
  'clip-hot': '歌切-热歌榜',
  'clip-new': '歌切-新歌榜',
};

export const RANKING_DESCRIPTIONS: Record<string, string> = {
  'combined-soar': '综合单曲与歌切，过去一周播放增长最快 Top 50',
  'combined-hot': '综合单曲与歌切，过去一周播放量最高 Top 50',
  'combined-new': '最新发布的单曲与歌切 Top 50',
  'single-soar': '单曲，过去一周播放增长最快 Top 50',
  'single-hot': '单曲，过去一周播放量最高 Top 50',
  'single-new': '最新发布单曲 Top 50',
  'clip-soar': '歌切，过去一周播放增长最快 Top 50',
  'clip-hot': '歌切，过去一周播放量最高 Top 50',
  'clip-new': '最新发布歌切 Top 50',
};

@Injectable()
export class RankingPlaylistService {
  private readonly logger = new Logger(RankingPlaylistService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** 通过 type + ranking 生成系统歌单名称 */
  static nameOf(type: RankingType, ranking: RankingKind): string {
    return RANKING_NAMES[`${type}-${ranking}`];
  }

  /** 9 档系统歌单组合 */
  static allCombos(): { type: RankingType; ranking: RankingKind }[] {
    const types: RankingType[] = ['combined', 'single', 'clip'];
    const rankings: RankingKind[] = ['soar', 'hot', 'new'];
    const out: { type: RankingType; ranking: RankingKind }[] = [];
    for (const t of types) {
      for (const r of rankings) {
        out.push({ type: t, ranking: r });
      }
    }
    return out;
  }

  /**
   * 确保 9 个系统歌单都存在（懒加载：调用时再创建）。
   * 返回每档对应的 playlistId。
   */
  async ensureAll(): Promise<Record<string, string>> {
    const result: Record<string, string> = {};
    for (const { type, ranking } of RankingPlaylistService.allCombos()) {
      const playlist = await this.findOrCreate(type, ranking);
      result[`${type}-${ranking}`] = playlist.id;
    }
    return result;
  }

  /** 查找或创建单个系统歌单 */
  private async findOrCreate(type: RankingType, ranking: RankingKind) {
    const name = RankingPlaylistService.nameOf(type, ranking);
    const description = RANKING_DESCRIPTIONS[`${type}-${ranking}`];

    const existing = await this.prisma.playlist.findFirst({
      where: { isSystem: true, name, deletedAt: null },
    });
    if (existing) return existing;

    // 找到一个归属用户作为 system 歌单的 userId
    // 优先取已存在的 system 歌单 userId，保持一致；否则取任意一个管理员/用户
    const anySystem = await this.prisma.playlist.findFirst({
      where: { isSystem: true, deletedAt: null },
      select: { userId: true },
    });
    const userId =
      anySystem?.userId ??
      (
        await this.prisma.user.findFirst({
          where: { deletedAt: null, role: 'ADMIN' },
          select: { id: true },
        })
      )?.id ??
      (
        await this.prisma.user.findFirst({
          where: { deletedAt: null },
          select: { id: true },
        })
      )?.id;

    if (!userId) {
      throw new Error('无法找到任何用户作为系统歌单归属者');
    }

    return this.prisma.playlist.create({
      data: {
        name,
        description,
        isSystem: true,
        isPublic: true,
        userId,
      },
    });
  }

  /**
   * 将计算出的 Top 50 同步到对应系统歌单。
   * - 旧关联全部删除
   * - 按 rank 顺序写入新关联，songId 或 clipId 二选一
   * - 同步更新歌单封面（取榜首封面）和 playCount（取榜单项 playCount 累加）
   */
  async syncTop50(
    type: RankingType,
    ranking: RankingKind,
    items: RankingItem[],
  ): Promise<{ playlistId: string | null; synced: number }> {
    try {
      const playlist = await this.findOrCreate(type, ranking);

      await this.prisma.$transaction([
        this.prisma.playlistSong.deleteMany({
          where: { playlistId: playlist.id },
        }),
        ...items.map((item, index) =>
          this.prisma.playlistSong.create({
            data: {
              playlistId: playlist.id,
              songId: item.trackType === 'song' ? item.itemId : null,
              clipId: item.trackType === 'clip' ? item.itemId : null,
              sort: index,
            },
          }),
        ),
        this.prisma.playlist.update({
          where: { id: playlist.id },
          data: {
            cover: items[0]?.cover ?? null,
            playCount: items.reduce((acc, i) => acc + (i.playCount ?? 0), 0),
          },
        }),
      ]);

      this.logger.log(
        `已同步 ${RankingPlaylistService.nameOf(type, ranking)}：${items.length} 项`,
      );
      return { playlistId: playlist.id, synced: items.length };
    } catch (err) {
      this.logger.error(
        `同步系统歌单失败（${type}-${ranking}）：${(err as Error).message}`,
      );
      return { playlistId: null, synced: 0 };
    }
  }

  /** 查找榜单对应的系统歌单 */
  async findPlaylist(type: RankingType, ranking: RankingKind) {
    const name = RankingPlaylistService.nameOf(type, ranking);
    return this.prisma.playlist.findFirst({
      where: { isSystem: true, name, deletedAt: null },
    });
  }
}
