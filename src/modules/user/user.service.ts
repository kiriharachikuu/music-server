import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  buildPaginatedResult,
  PaginatedResult,
  parsePagination,
} from '../../common/utils/pagination.util';
import { CreatePlaylistDto } from './dto/create-playlist.dto';
import { UpdatePlaylistDto } from './dto/update-playlist.dto';

@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

  /** 获取当前用户资料（不含密码） */
  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!user || user.deletedAt) {
      throw new NotFoundException('用户不存在');
    }
    const { password: _password, ...rest } = user;
    return rest;
  }

  /** 更新用户资料（昵称 / 头像） */
  async updateProfile(
    userId: string,
    data: { username?: string; avatar?: string },
  ) {
    // 昵称唯一性校验
    if (data.username) {
      const existing = await this.prisma.user.findFirst({
        where: {
          username: data.username,
          id: { not: userId },
        },
      });
      if (existing) {
        throw new ForbiddenException('该昵称已被占用');
      }
    }
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(data.username !== undefined && { username: data.username }),
        ...(data.avatar !== undefined && { avatar: data.avatar }),
      },
    });
    const { password: _password, ...rest } = updated;
    return rest;
  }

  /** 收藏列表（分页，含歌曲详情，过滤已删歌曲避免 ghost song） */
  async getFavorites(
    userId: string,
    query: { page?: string; limit?: string; pageSize?: string },
  ): Promise<PaginatedResult<unknown>> {
    const { page, limit, skip, take } = parsePagination(query);
    const where = { userId, song: { deletedAt: null } };
    const [list, total] = await this.prisma.$transaction([
      this.prisma.favorite.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: { song: { include: { album: true } } },
      }),
      this.prisma.favorite.count({ where }),
    ]);
    return buildPaginatedResult(list, total, page, limit);
  }

  /** 切换收藏状态：已收藏则取消，未收藏则新增，同步维护 favoriteCount */
  async toggleFavorite(
    userId: string,
    songId: string,
  ): Promise<{ favorited: boolean }> {
    // 校验歌曲存在
    const song = await this.prisma.song.findFirst({
      where: { id: songId, deletedAt: null },
    });
    if (!song) {
      throw new NotFoundException('歌曲不存在');
    }
    const existing = await this.prisma.favorite.findUnique({
      where: { userId_songId: { userId, songId } },
    });
    if (existing) {
      // 取消收藏：删除记录 + favoriteCount -1
      await this.prisma.$transaction([
        this.prisma.favorite.delete({ where: { id: existing.id } }),
        this.prisma.song.update({
          where: { id: songId },
          data: { favoriteCount: { decrement: 1 } },
        }),
      ]);
      return { favorited: false };
    }
    // 新增收藏：创建记录 + favoriteCount +1
    await this.prisma.$transaction([
      this.prisma.favorite.create({ data: { userId, songId } }),
      this.prisma.song.update({
        where: { id: songId },
        data: { favoriteCount: { increment: 1 } },
      }),
    ]);
    return { favorited: true };
  }

  /** 检查用户是否已收藏某首歌曲 */
  async isSongFavorited(userId: string, songId: string): Promise<boolean> {
    const fav = await this.prisma.favorite.findUnique({
      where: { userId_songId: { userId, songId } },
    });
    return !!fav;
  }

  /** 我的歌单列表 */
  async getMyPlaylists(userId: string) {
    return this.prisma.playlist.findMany({
      where: { userId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** 创建歌单 */
  async createPlaylist(userId: string, dto: CreatePlaylistDto) {
    return this.prisma.playlist.create({
      data: {
        name: dto.name,
        cover: dto.cover,
        description: dto.description,
        isPublic: dto.isPublic ?? true,
        userId,
      },
    });
  }

  /** 更新歌单（校验归属） */
  async updatePlaylist(userId: string, id: string, dto: UpdatePlaylistDto) {
    const playlist = await this.assertPlaylistOwned(userId, id);
    return this.prisma.playlist.update({
      where: { id: playlist.id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.cover !== undefined && { cover: dto.cover }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.isPublic !== undefined && { isPublic: dto.isPublic }),
      },
    });
  }

  /** 删除歌单（校验归属，软删除） */
  async deletePlaylist(userId: string, id: string): Promise<{ deleted: true }> {
    const playlist = await this.assertPlaylistOwned(userId, id);
    await this.prisma.playlist.update({
      where: { id: playlist.id },
      data: { deletedAt: new Date() },
    });
    return { deleted: true };
  }

  /** 批量添加歌曲到歌单（校验归属，自动续接 sort，跳过已存在） */
  async addSongsToPlaylist(
    userId: string,
    id: string,
    songIds: string[],
  ): Promise<{ added: number }> {
    const playlist = await this.assertPlaylistOwned(userId, id);
    // 取当前最大 sort
    const last = await this.prisma.playlistSong.findFirst({
      where: { playlistId: playlist.id },
      orderBy: { sort: 'desc' },
    });
    let sort = last?.sort ?? 0;

    // SQLite 不支持 createMany 的 skipDuplicates，先查询已存在的歌曲手动去重，
    // 避免 (playlistId, songId) 唯一约束冲突抛 P2003
    const existing = await this.prisma.playlistSong.findMany({
      where: { playlistId: playlist.id, songId: { in: songIds } },
      select: { songId: true },
    });
    const existingSet = new Set(existing.map((e) => e.songId));
    const toAdd = songIds.filter((sid) => !existingSet.has(sid));
    if (toAdd.length === 0) {
      return { added: 0 };
    }

    const data = toAdd.map((songId) => ({
      playlistId: playlist.id,
      songId,
      sort: ++sort,
    }));
    const result = await this.prisma.playlistSong.createMany({
      data,
    });
    return { added: result.count };
  }

  /** 从歌单中删除歌曲（校验归属） */
  async removeSongFromPlaylist(
    userId: string,
    id: string,
    songId: string,
  ): Promise<{ removed: true }> {
    const playlist = await this.assertPlaylistOwned(userId, id);
    await this.prisma.playlistSong.deleteMany({
      where: { playlistId: playlist.id, songId },
    });
    return { removed: true };
  }

  /** 调整歌单内歌曲顺序（校验归属） */
  async reorderPlaylistSongs(
    userId: string,
    id: string,
    songIds: string[],
  ): Promise<{ reordered: true }> {
    const playlist = await this.assertPlaylistOwned(userId, id);
    await this.prisma.$transaction(
      songIds.map((songId, index) =>
        this.prisma.playlistSong.updateMany({
          where: { playlistId: playlist.id, songId },
          data: { sort: index + 1 },
        }),
      ),
    );
    return { reordered: true };
  }

  // ============ 专辑收藏 ============

  /** 切换专辑收藏状态 */
  async toggleAlbumFavorite(
    userId: string,
    albumId: string,
  ): Promise<{ favorited: boolean }> {
    const album = await this.prisma.album.findFirst({
      where: { id: albumId, deletedAt: null },
    });
    if (!album) throw new NotFoundException('专辑不存在');

    const existing = await this.prisma.albumFavorite.findUnique({
      where: { userId_albumId: { userId, albumId } },
    });
    if (existing) {
      await this.prisma.albumFavorite.delete({ where: { id: existing.id } });
      return { favorited: false };
    }
    await this.prisma.albumFavorite.create({ data: { userId, albumId } });
    return { favorited: true };
  }

  /** 检查用户是否已收藏某专辑 */
  async isAlbumFavorited(userId: string, albumId: string): Promise<boolean> {
    const fav = await this.prisma.albumFavorite.findUnique({
      where: { userId_albumId: { userId, albumId } },
    });
    return !!fav;
  }

  // ============ 歌单收藏 ============

  /** 切换歌单收藏状态 */
  async togglePlaylistFavorite(
    userId: string,
    playlistId: string,
  ): Promise<{ favorited: boolean }> {
    const playlist = await this.prisma.playlist.findFirst({
      where: { id: playlistId, deletedAt: null },
    });
    if (!playlist) throw new NotFoundException('歌单不存在');

    const existing = await this.prisma.playlistFavorite.findUnique({
      where: { userId_playlistId: { userId, playlistId } },
    });
    if (existing) {
      await this.prisma.playlistFavorite.delete({ where: { id: existing.id } });
      return { favorited: false };
    }
    await this.prisma.playlistFavorite.create({
      data: { userId, playlistId },
    });
    return { favorited: true };
  }

  /** 检查用户是否已收藏某歌单 */
  async isPlaylistFavorited(
    userId: string,
    playlistId: string,
  ): Promise<boolean> {
    const fav = await this.prisma.playlistFavorite.findUnique({
      where: { userId_playlistId: { userId, playlistId } },
    });
    return !!fav;
  }

  /** 播放历史（分页，按 playTime 降序，含歌曲详情） */
  async getHistory(
    userId: string,
    query: { page?: string; limit?: string; pageSize?: string },
  ): Promise<PaginatedResult<unknown>> {
    const { page, limit, skip, take } = parsePagination(query);
    const where = { userId };
    const [list, total] = await this.prisma.$transaction([
      this.prisma.playHistory.findMany({
        where,
        skip,
        take,
        orderBy: { playTime: 'desc' },
        include: { song: { include: { album: true } } },
      }),
      this.prisma.playHistory.count({ where }),
    ]);
    return buildPaginatedResult(list, total, page, limit);
  }

  /** 删除单条播放历史（按歌曲 ID，删除最近一条） */
  async deleteHistoryItem(
    userId: string,
    songId: string,
  ): Promise<{ deleted: true }> {
    // 删除该歌曲最近一条播放记录
    const record = await this.prisma.playHistory.findFirst({
      where: { userId, songId },
      orderBy: { playTime: 'desc' },
    });
    if (record) {
      await this.prisma.playHistory.delete({ where: { id: record.id } });
    }
    return { deleted: true };
  }

  /** 清空全部播放历史 */
  async clearHistory(userId: string): Promise<{ deleted: true }> {
    await this.prisma.playHistory.deleteMany({ where: { userId } });
    return { deleted: true };
  }

  /**
   * 上报播放记录，24小时内同一用户同一首歌只计一次播放量，同时清理超出限制的历史记录
   *
   * 安全要点：recentPlay 查询置于事务内，避免事务外查询与事务内写入之间的
   * TOCTOU 竞态（旧实现下两个并发请求可能都判定为"未在 24h 内"而重复计数）
   */
  async recordHistory(
    userId: string,
    songId: string,
  ): Promise<{ recorded: true }> {
    const song = await this.prisma.song.findFirst({
      where: { id: songId, deletedAt: null },
    });
    if (!song) {
      throw new NotFoundException('歌曲不存在');
    }

    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    await this.prisma.$transaction(async (tx) => {
      // 在事务内查询最近一次播放，缩小竞态窗口
      const recentPlay = await tx.playHistory.findFirst({
        where: {
          userId,
          songId,
          playTime: { gte: oneDayAgo },
        },
      });

      if (recentPlay) {
        // 24 小时内重复播放：仅刷新最近一次的 playTime 到当前，
        // 不重复新增历史记录、不重复计入播放量（避免历史表无限膨胀）
        await tx.playHistory.update({
          where: { id: recentPlay.id },
          data: { playTime: now },
        });
      } else {
        await tx.playHistory.create({
          data: { userId, songId, playTime: now },
        });
        await tx.song.update({
          where: { id: songId },
          data: { plays: { increment: 1 } },
        });
      }

      await this.cleanupExcessHistory(tx, userId);
    });

    return { recorded: true };
  }

  /**
   * 清理超出限制的播放历史记录（每个用户最多保留 500 条）
   */
  private async cleanupExcessHistory(
    tx: { playHistory: { count: typeof this.prisma.playHistory.count; deleteMany: typeof this.prisma.playHistory.deleteMany; findMany: typeof this.prisma.playHistory.findMany } },
    userId: string,
    maxRecords: number = 500,
  ) {
    const total = await tx.playHistory.count({ where: { userId } });
    if (total <= maxRecords) return;

    const excessCount = total - maxRecords;
    const oldestRecords = await tx.playHistory.findMany({
      where: { userId },
      orderBy: { playTime: 'asc' },
      take: excessCount + 50,
      select: { id: true },
    });

    const idsToDelete = oldestRecords.slice(0, excessCount).map((r: { id: string }) => r.id);
    if (idsToDelete.length > 0) {
      await tx.playHistory.deleteMany({
        where: { id: { in: idsToDelete } },
      });
    }
  }

  /** 下载记录列表（过滤已删歌曲避免 ghost song） */
  async getDownloads(
    userId: string,
    query: { page?: string; limit?: string; pageSize?: string },
  ): Promise<PaginatedResult<unknown>> {
    const { page, limit, skip, take } = parsePagination(query);
    const where = { userId, song: { deletedAt: null } };
    const [list, total] = await this.prisma.$transaction([
      this.prisma.downloadRecord.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: { song: true },
      }),
      this.prisma.downloadRecord.count({ where }),
    ]);
    return buildPaginatedResult(list, total, page, limit);
  }

  /** 校验歌单归属当前用户，返回未软删除的歌单 */
  async assertPlaylistOwned(userId: string, id: string) {
    const playlist = await this.prisma.playlist.findFirst({
      where: { id, userId, deletedAt: null },
    });
    if (!playlist) {
      throw new ForbiddenException('歌单不存在或无权操作');
    }
    return playlist;
  }
}
