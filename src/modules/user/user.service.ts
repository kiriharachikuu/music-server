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

  /** 收藏列表（分页，含歌曲详情） */
  async getFavorites(
    userId: string,
    query: { page?: string; limit?: string; pageSize?: string },
  ): Promise<PaginatedResult<unknown>> {
    const { page, limit, skip, take } = parsePagination(query);
    const where = { userId };
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

  /** 切换收藏状态：已收藏则取消，未收藏则新增 */
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
      await this.prisma.favorite.delete({ where: { id: existing.id } });
      return { favorited: false };
    }
    await this.prisma.favorite.create({ data: { userId, songId } });
    return { favorited: true };
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
    const playlist = await this.assertOwned(userId, id);
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
    const playlist = await this.assertOwned(userId, id);
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
    const playlist = await this.assertOwned(userId, id);
    // 取当前最大 sort
    const last = await this.prisma.playlistSong.findFirst({
      where: { playlistId: playlist.id },
      orderBy: { sort: 'desc' },
    });
    let sort = last?.sort ?? 0;
    const data = songIds.map((songId) => ({
      playlistId: playlist.id,
      songId,
      sort: ++sort,
    }));
    const result = await this.prisma.playlistSong.createMany({
      data,
    });
    return { added: result.count };
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

  /** 上报播放记录，同时 song.plays++ */
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
    await this.prisma.$transaction([
      this.prisma.playHistory.create({
        data: { userId, songId, playTime: new Date() },
      }),
      this.prisma.song.update({
        where: { id: songId },
        data: { plays: { increment: 1 } },
      }),
    ]);
    return { recorded: true };
  }

  /** 下载记录列表 */
  async getDownloads(
    userId: string,
    query: { page?: string; limit?: string; pageSize?: string },
  ): Promise<PaginatedResult<unknown>> {
    const { page, limit, skip, take } = parsePagination(query);
    const where = { userId };
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
  private async assertOwned(userId: string, id: string) {
    const playlist = await this.prisma.playlist.findFirst({
      where: { id, userId, deletedAt: null },
    });
    if (!playlist) {
      throw new ForbiddenException('歌单不存在或无权操作');
    }
    return playlist;
  }
}
