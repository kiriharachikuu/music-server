import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  buildPaginatedResult,
  parsePagination,
} from '../../common/utils/pagination.util';
import { buildKeywordWhere } from '../admin/admin-resource.helpers';
import type { Prisma } from '@prisma/client';

@Injectable()
export class LiveSessionService {
  constructor(private readonly prisma: PrismaService) {}

  /** 公开：获取已发布场次列表（分页） */
  async list(query: { page?: string; limit?: string; pageSize?: string }) {
    const { page, limit, skip, take } = parsePagination(query);
    const where: Prisma.LiveSessionWhereInput = {
      status: 'PUBLISHED',
      deletedAt: null,
    };
    const [list, total] = await this.prisma.$transaction([
      this.prisma.liveSession.findMany({
        where,
        orderBy: { liveTime: 'desc' },
        skip,
        take,
      }),
      this.prisma.liveSession.count({ where }),
    ]);
    return buildPaginatedResult(list, total, page, limit);
  }

  /** 公开：根据 sessionId 获取该场次 + 全部已发布歌切（按 trackIndex 升序） */
  async findOne(id: string) {
    const session = await this.prisma.liveSession.findFirst({
      where: { id, deletedAt: null },
      include: {
        clips: {
          where: { status: 'PUBLISHED' },
          orderBy: { trackIndex: 'asc' },
          select: {
            id: true,
            title: true,
            artist: true,
            trackIndex: true,
            duration: true,
            fileUrl: true,
            coverUrl: true,
          },
        },
      },
    });
    if (!session) throw new NotFoundException('场次不存在');

    // 同步 songCount
    const actualCount = session.clips.length;
    if (session.songCount !== actualCount) {
      await this.prisma.liveSession.update({
        where: { id },
        data: { songCount: actualCount },
      });
    }

    // 将 clips 转换为前端 LiveClipTrack 格式：扁平化字段 + 添加 trackType
    const sessionTitle = session.title;
    const sessionLiveTime = session.liveTime.toISOString();
    const mappedClips = session.clips.map((clip) => ({
      id: clip.id,
      title: clip.title,
      artist: clip.artist,
      cover: clip.coverUrl,
      url: clip.fileUrl,
      duration: clip.duration,
      trackType: 'live_clip' as const,
      sessionId: session.id,
      sessionName: sessionTitle,
      liveTime: sessionLiveTime,
      trackIndex: clip.trackIndex,
    }));

    const { clips: _originalClips, ...sessionWithoutClips } = session as Record<string, unknown>;
    return { ...sessionWithoutClips, songCount: actualCount, clips: mappedClips };
  }

  // ============ 用户收藏 ============

  /** 切换场次收藏状态 */
  async toggleFavorite(
    userId: string,
    sessionId: string,
  ): Promise<{ favorited: boolean }> {
    const session = await this.prisma.liveSession.findFirst({
      where: { id: sessionId, deletedAt: null },
    });
    if (!session) throw new NotFoundException('场次不存在');

    const existing = await this.prisma.liveSessionFavorite.findUnique({
      where: { userId_sessionId: { userId, sessionId } },
    });
    if (existing) {
      await this.prisma.liveSessionFavorite.delete({
        where: { id: existing.id },
      });
      return { favorited: false };
    }
    await this.prisma.liveSessionFavorite.create({
      data: { userId, sessionId },
    });
    return { favorited: true };
  }

  /** 检查用户是否已收藏某场次 */
  async isFavorited(userId: string, sessionId: string): Promise<boolean> {
    const fav = await this.prisma.liveSessionFavorite.findUnique({
      where: { userId_sessionId: { userId, sessionId } },
    });
    return !!fav;
  }

  /** 显式取消收藏（直接删除，不 toggle） */
  async unfavorite(userId: string, sessionId: string): Promise<void> {
    await this.prisma.liveSessionFavorite.deleteMany({
      where: { userId, sessionId },
    });
  }

  /** 获取用户已收藏的场次列表 */
  async getFavorites(userId: string) {
    const favorites = await this.prisma.liveSessionFavorite.findMany({
      where: { userId },
      include: {
        session: {
          include: {
            _count: { select: { clips: { where: { status: 'PUBLISHED' } } } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return favorites
      .filter((f) => f.session?.deletedAt === null)
      .map((f) => ({
        ...f.session,
        songCount: f.session?._count?.clips ?? 0,
      }));
  }

  // ============ Admin ============

  /** Admin：分页搜索 + 状态筛选 */
  async adminList(query: {
    keyword?: string;
    status?: string;
    page?: string;
    limit?: string;
    pageSize?: string;
  }) {
    const { page, limit, skip, take } = parsePagination(query);
    const where: Prisma.LiveSessionWhereInput = { deletedAt: null };
    if (query.status) where.status = query.status as any;
    const keywordWhere = buildKeywordWhere(query.keyword, ['title', 'artist']);
    const finalWhere = { ...where, ...keywordWhere };

    const [list, total] = await this.prisma.$transaction([
      this.prisma.liveSession.findMany({
        where: finalWhere,
        orderBy: { liveTime: 'desc' },
        skip,
        take,
      }),
      this.prisma.liveSession.count({ where: finalWhere }),
    ]);
    return buildPaginatedResult(list, total, page, limit);
  }

  /** Admin：获取场次详情（含所有歌切，不限状态） */
  async adminFindOne(id: string) {
    const session = await this.prisma.liveSession.findFirst({
      where: { id, deletedAt: null },
      include: {
        clips: {
          orderBy: { trackIndex: 'asc' },
        },
      },
    });
    if (!session) throw new NotFoundException('场次不存在');
    return session;
  }

  /** Admin：新增场次 */
  async adminCreate(dto: any) {
    return this.prisma.liveSession.create({ data: dto });
  }

  /** Admin：编辑场次 */
  async adminUpdate(id: string, dto: any) {
    await this.prisma.liveSession.update({ where: { id }, data: dto });
    return this.adminFindOne(id);
  }

  /** Admin：软删除场次 + 级联软删除所有歌切 + 清除收藏 */
  async adminDelete(id: string): Promise<{ deleted: true }> {
    const session = await this.prisma.liveSession.findFirst({
      where: { id, deletedAt: null },
    });
    if (!session) throw new NotFoundException('场次不存在');

    await this.prisma.$transaction([
      this.prisma.liveSession.update({
        where: { id },
        data: { deletedAt: new Date() },
      }),
      this.prisma.liveClip.deleteMany({ where: { sessionId: id } }),
      this.prisma.liveSessionFavorite.deleteMany({
        where: { sessionId: id },
      }),
    ]);
    return { deleted: true };
  }

  /** Admin：批量删除 */
  async adminBatchDelete(ids: string[]) {
    await this.prisma.$transaction([
      this.prisma.liveSession.updateMany({
        where: { id: { in: ids } },
        data: { deletedAt: new Date() },
      }),
      this.prisma.liveClip.deleteMany({
        where: { sessionId: { in: ids } },
      }),
      this.prisma.liveSessionFavorite.deleteMany({
        where: { sessionId: { in: ids } },
      }),
    ]);
    return { deleted: true };
  }

  /** Admin：批量更新状态 */
  async adminBatchStatus(ids: string[], status: 'PUBLISHED' | 'DRAFT') {
    await this.prisma.liveSession.updateMany({
      where: { id: { in: ids } },
      data: { status },
    });
    return { updated: true };
  }

  // ============ Admin LiveClip ============

  /** Admin：歌切列表（分页 + 搜索 + 场次筛选 + 状态筛选） */
  async adminClipsList(query: {
    keyword?: string;
    sessionId?: string;
    status?: string;
    page?: string;
    limit?: string;
    pageSize?: string;
  }) {
    const { page, limit, skip, take } = parsePagination(query);
    const where: Prisma.LiveClipWhereInput = {};
    if (query.status) where.status = query.status as any;
    if (query.sessionId) where.sessionId = query.sessionId;
    const keywordWhere = buildKeywordWhere(query.keyword, ['title', 'artist']);
    const finalWhere = { ...where, ...keywordWhere };

    const [list, total] = await this.prisma.$transaction([
      this.prisma.liveClip.findMany({
        where: finalWhere,
        orderBy: [{ sessionId: 'asc' }, { trackIndex: 'asc' }],
        include: {
          session: { select: { id: true, title: true, liveTime: true } },
        },
        skip,
        take,
      }),
      this.prisma.liveClip.count({ where: finalWhere }),
    ]);
    return buildPaginatedResult(list, total, page, limit);
  }

  /** Admin：获取歌切详情 */
  async adminClipFindOne(id: string) {
    const clip = await this.prisma.liveClip.findUnique({
      where: { id },
      include: {
        session: { select: { id: true, title: true, liveTime: true } },
      },
    });
    if (!clip) throw new NotFoundException('歌切不存在');
    return clip;
  }

  /** Admin：新增歌切 + 同步更新场次 songCount */
  async adminClipCreate(dto: any) {
    const clip = await this.prisma.$transaction(async (tx) => {
      const created = await tx.liveClip.create({ data: dto });
      await tx.liveSession.update({
        where: { id: dto.sessionId },
        data: { songCount: { increment: 1 } },
      });
      return created;
    });
    return clip;
  }

  /** Admin：编辑歌切 */
  async adminClipUpdate(id: string, dto: any) {
    const old = await this.prisma.liveClip.findUnique({ where: { id } });
    if (!old) throw new NotFoundException('歌切不存在');

    const updated = await this.prisma.$transaction(async (tx) => {
      const clip = await tx.liveClip.update({ where: { id }, data: dto });
      // 如果更换了场次，同步两边的 songCount
      if (dto.sessionId && dto.sessionId !== old.sessionId) {
        await tx.liveSession.update({
          where: { id: old.sessionId },
          data: { songCount: { decrement: 1 } },
        });
        await tx.liveSession.update({
          where: { id: dto.sessionId },
          data: { songCount: { increment: 1 } },
        });
      }
      return clip;
    });
    return updated;
  }

  /** Admin：物理删除歌切 + 同步更新场次 songCount */
  async adminClipDelete(id: string): Promise<{ deleted: true }> {
    const clip = await this.prisma.liveClip.findUnique({ where: { id } });
    if (!clip) throw new NotFoundException('歌切不存在');

    await this.prisma.$transaction([
      this.prisma.liveClip.delete({ where: { id } }),
      this.prisma.liveSession.update({
        where: { id: clip.sessionId },
        data: { songCount: { decrement: 1 } },
      }),
    ]);
    return { deleted: true };
  }

  /** Admin：批量删除歌切 */
  async adminClipBatchDelete(ids: string[]) {
    const clips = await this.prisma.liveClip.findMany({
      where: { id: { in: ids } },
      select: { id: true, sessionId: true },
    });
    // 按场次分组统计
    const sessionDecrements = new Map<string, number>();
    for (const c of clips) {
      sessionDecrements.set(c.sessionId, (sessionDecrements.get(c.sessionId) ?? 0) + 1);
    }
    await this.prisma.$transaction([
      this.prisma.liveClip.deleteMany({ where: { id: { in: ids } } }),
      ...Array.from(sessionDecrements.entries()).map(([sid, count]) =>
        this.prisma.liveSession.update({
          where: { id: sid },
          data: { songCount: { decrement: count } },
        }),
      ),
    ]);
    return { deleted: true };
  }

  /** Admin：批量更新歌切状态 */
  async adminClipBatchStatus(ids: string[], status: 'PUBLISHED' | 'DRAFT') {
    await this.prisma.liveClip.updateMany({
      where: { id: { in: ids } },
      data: { status },
    });
    return { updated: true };
  }
}
