import { Injectable, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import {
  buildPaginatedResult,
  PaginatedResult,
  parsePagination,
} from '../../common/utils/pagination.util';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateAlbumDto, UpdateAlbumDto } from './dto/album.dto';
import { CreateArtistDto, UpdateArtistDto } from './dto/artist.dto';
import { CreateBannerDto, UpdateBannerDto } from './dto/banner.dto';
import { CreatePlaylistDto, UpdatePlaylistDto } from './dto/playlist.dto';
import { CreateSongDto, UpdateSongDto } from './dto/song.dto';
import {
  buildAlbumUpdateData,
  buildBannerUpdateData,
  buildKeywordWhere,
  buildPlaylistUpdateData,
  readLyricFile,
} from './admin-resource.helpers';

/**
 * 后台资源 CRUD 服务
 * 覆盖歌曲 / 专辑 / 歌单 / Banner / 用户管理
 */
@Injectable()
export class AdminResourceService {
  constructor(private readonly prisma: PrismaService) {}

  // ============ 歌曲 ============

  async listSongs(query: {
    keyword?: string;
    page?: string;
    limit?: string;
    pageSize?: string;
  }): Promise<PaginatedResult<unknown>> {
    const { page, limit, skip, take } = parsePagination(query);
    const where = {
      deletedAt: null,
      ...buildKeywordWhere(query.keyword, ['title', 'artist']),
    };
    const [list, total] = await this.prisma.$transaction([
      this.prisma.song.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          album: true,
          songTags: { include: { tag: true } },
          songArtists: { include: { artist: true } },
        },
      }),
      this.prisma.song.count({ where }),
    ]);
    return buildPaginatedResult(list, total, page, limit);
  }

  async createSong(dto: CreateSongDto) {
    const { tagIds, albumId, releaseDate, artistIds, ...rest } = dto;
    return this.prisma.$transaction(async (tx) => {
      const song = await tx.song.create({
        data: {
          ...rest,
          albumId: albumId || null,
          releaseDate: new Date(releaseDate),
          ...(tagIds?.length
            ? { songTags: { create: tagIds.map((tagId) => ({ tagId })) } }
            : {}),
          ...(artistIds?.length
            ? { songArtists: { create: artistIds.map((artistId, index) => ({ artistId, sort: index })) } }
            : {}),
        },
        include: { album: true, songTags: { include: { tag: true } }, songArtists: { include: { artist: true } } },
      });
      // 维护专辑歌曲数
      if (albumId) {
        await tx.album.update({
          where: { id: albumId },
          data: { songCount: { increment: 1 } },
        });
      }
      return song;
    });
  }

  async updateSong(id: string, dto: UpdateSongDto) {
    const { tagIds, albumId, releaseDate, artistIds, ...rest } = dto;
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.song.findFirst({ where: { id } });
      if (!existing) throw new NotFoundException('歌曲不存在');

      // 标签全量替换
      if (tagIds !== undefined) {
        await tx.songTag.deleteMany({ where: { songId: id } });
        if (tagIds.length) {
          await tx.songTag.createMany({
            data: tagIds.map((tagId) => ({ songId: id, tagId })),
          });
        }
      }

      // 歌手全量替换
      if (artistIds !== undefined) {
        await tx.songArtist.deleteMany({ where: { songId: id } });
        if (artistIds.length) {
          await tx.songArtist.createMany({
            data: artistIds.map((artistId, index) => ({ songId: id, artistId, sort: index })),
          });
        }
      }

      // 专辑变更时维护 songCount
      if (albumId !== undefined) {
        const newAlbumId = albumId || null;
        if (existing.albumId && existing.albumId !== newAlbumId) {
          await tx.album.update({
            where: { id: existing.albumId },
            data: { songCount: { decrement: 1 } },
          });
        }
        if (newAlbumId && existing.albumId !== newAlbumId) {
          await tx.album.update({
            where: { id: newAlbumId },
            data: { songCount: { increment: 1 } },
          });
        }
      }

      return tx.song.update({
        where: { id },
        data: {
          ...rest,
          ...(albumId !== undefined && { albumId: albumId || null }),
          ...(releaseDate !== undefined && { releaseDate: new Date(releaseDate) }),
        },
        include: { album: true, songTags: { include: { tag: true } }, songArtists: { include: { artist: true } } },
      });
    });
  }

  async deleteSong(id: string): Promise<{ deleted: true }> {
    const song = await this.prisma.song.findFirst({ where: { id } });
    if (!song) throw new NotFoundException('歌曲不存在');
    await this.prisma.$transaction(async (tx) => {
      await tx.song.update({
        where: { id },
        data: { deletedAt: new Date() },
      });
      if (song.albumId) {
        await tx.album.update({
          where: { id: song.albumId },
          data: { songCount: { decrement: 1 } },
        });
      }
      // 软删除不触发 Prisma 的 onDelete 级联，手动清理关联数据：
      // - PlaylistSong / Favorite / DownloadRecord 物理删除（列表不再显示已删歌曲）
      // - Banner.songId 置空（Banner 保留但不再关联已删歌曲）
      // - PlayHistory 保留（历史记录），查询时通过 song.deletedAt 过滤
      await tx.playlistSong.deleteMany({ where: { songId: id } });
      await tx.favorite.deleteMany({ where: { songId: id } });
      await tx.downloadRecord.deleteMany({ where: { songId: id } });
      await tx.banner.updateMany({
        where: { songId: id },
        data: { songId: null },
      });
    });
    return { deleted: true };
  }

  /** 获取歌词正文（管理端，不限发布状态，用于编辑器回显） */
  async getLyricContent(id: string): Promise<{ content: string }> {
    const song = await this.prisma.song.findFirst({
      where: { id },
      select: { lyricContent: true, lyricUrl: true },
    });
    if (!song) throw new NotFoundException('歌曲不存在');
    // 优先返回 lyricContent；若为空则尝试读取 lyricUrl 文件
    if (song.lyricContent) return { content: song.lyricContent };
    return { content: await readLyricFile(song.lyricUrl) };
  }

  /** 设置歌词正文（在线编辑器保存） */
  async setLyricContent(id: string, content: string): Promise<{ saved: true }> {
    const song = await this.prisma.song.findFirst({ where: { id } });
    if (!song) throw new NotFoundException('歌曲不存在');
    await this.prisma.song.update({
      where: { id },
      data: { lyricContent: content || null },
    });
    return { saved: true };
  }

  /** 删除歌词正文（清空 lyricContent） */
  async deleteLyricContent(id: string): Promise<{ deleted: true }> {
    const song = await this.prisma.song.findFirst({ where: { id } });
    if (!song) throw new NotFoundException('歌曲不存在');
    await this.prisma.song.update({
      where: { id },
      data: { lyricContent: null },
    });
    return { deleted: true };
  }

  // ============ 标签 ============

  async listTags() {
    return this.prisma.tag.findMany({
      orderBy: { createdAt: 'asc' },
      select: { id: true, name: true },
    });
  }

  // ============ 专辑 ============

  async listAlbums(query: {
    keyword?: string;
    page?: string;
    limit?: string;
    pageSize?: string;
  }): Promise<PaginatedResult<unknown>> {
    const { page, limit, skip, take } = parsePagination(query);
    const where = {
      deletedAt: null,
      ...buildKeywordWhere(query.keyword, ['name', 'artist']),
    };
    const [list, total] = await this.prisma.$transaction([
      this.prisma.album.findMany({
        where,
        skip,
        take,
        orderBy: { releaseDate: 'desc' },
        include: {
          albumArtists: { include: { artist: true } },
        },
      }),
      this.prisma.album.count({ where }),
    ]);
    return buildPaginatedResult(list, total, page, limit);
  }

  async createAlbum(dto: CreateAlbumDto) {
    const { artistIds, ...rest } = dto;
    return this.prisma.album.create({
      data: {
        ...rest,
        releaseDate: new Date(dto.releaseDate),
        ...(artistIds?.length
          ? { albumArtists: { create: artistIds.map((artistId, index) => ({ artistId, sort: index })) } }
          : {}),
      },
      include: { albumArtists: { include: { artist: true } } },
    });
  }

  async updateAlbum(id: string, dto: UpdateAlbumDto) {
    await this.assertAlbumExists(id);
    const { artistIds, ...rest } = dto;
    return this.prisma.$transaction(async (tx) => {
      // 歌手全量替换
      if (artistIds !== undefined) {
        await tx.albumArtist.deleteMany({ where: { albumId: id } });
        if (artistIds.length) {
          await tx.albumArtist.createMany({
            data: artistIds.map((artistId, index) => ({ albumId: id, artistId, sort: index })),
          });
        }
      }
      return tx.album.update({
        where: { id },
        data: buildAlbumUpdateData(rest),
        include: { albumArtists: { include: { artist: true } } },
      });
    });
  }

  async deleteAlbum(id: string): Promise<{ deleted: true }> {
    await this.assertAlbumExists(id);
    await this.prisma.$transaction(async (tx) => {
      await tx.album.update({
        where: { id },
        data: { deletedAt: new Date() },
      });
      // 软删除不触发 Prisma 的 onDelete: SetNull，手动将关联歌曲的 albumId 置空
      // （避免 include album 返回已删专辑，造成 ghost album 脏数据）
      await tx.song.updateMany({
        where: { albumId: id },
        data: { albumId: null },
      });
    });
    return { deleted: true };
  }

  // ============ 歌单 ============

  async listPlaylists(query: {
    keyword?: string;
    page?: string;
    limit?: string;
    pageSize?: string;
  }): Promise<PaginatedResult<unknown>> {
    const { page, limit, skip, take } = parsePagination(query);
    const where = {
      deletedAt: null,
      ...buildKeywordWhere(query.keyword, ['name']),
    };
    const [list, total] = await this.prisma.$transaction([
      this.prisma.playlist.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, username: true, avatar: true } },
          _count: { select: { playlistSongs: true } },
        },
      }),
      this.prisma.playlist.count({ where }),
    ]);
    return buildPaginatedResult(list, total, page, limit);
  }

  async createPlaylist(dto: CreatePlaylistDto, userId: string) {
    return this.prisma.playlist.create({
      data: {
        name: dto.name,
        userId,
        cover: dto.cover,
        description: dto.description,
        isPublic: dto.isPublic ?? true,
        isSystem: dto.isSystem ?? false,
      },
    });
  }

  async updatePlaylist(id: string, dto: UpdatePlaylistDto) {
    await this.assertPlaylistExists(id);
    return this.prisma.playlist.update({
      where: { id },
      data: buildPlaylistUpdateData(dto),
    });
  }

  async deletePlaylist(id: string): Promise<{ deleted: true }> {
    await this.assertPlaylistExists(id);
    await this.prisma.playlist.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return { deleted: true };
  }

  /** 获取歌单详情（含歌曲列表，过滤已删歌曲避免 ghost song） */
  async getPlaylistDetail(id: string) {
    const playlist = await this.prisma.playlist.findFirst({
      where: { id, deletedAt: null },
      include: {
        playlistSongs: {
          orderBy: { sort: 'asc' },
          where: { song: { deletedAt: null } },
          include: {
            song: { include: { album: true } },
          },
        },
      },
    });
    if (!playlist) throw new NotFoundException('歌单不存在');
    return playlist;
  }

  /** 批量更新歌单歌曲（覆盖式：先删除旧的，再按顺序插入） */
  async updatePlaylistSongs(id: string, songIds: string[]): Promise<{ updated: true }> {
    await this.assertPlaylistExists(id);
    await this.prisma.$transaction([
      this.prisma.playlistSong.deleteMany({ where: { playlistId: id } }),
      ...songIds.map((songId, index) =>
        this.prisma.playlistSong.create({
          data: { playlistId: id, songId, sort: index + 1 },
        }),
      ),
    ]);
    return { updated: true };
  }

  // ============ Banner ============

  async listBanners(query: {
    page?: string;
    limit?: string;
    pageSize?: string;
  }): Promise<PaginatedResult<unknown>> {
    const { page, limit, skip, take } = parsePagination(query);
    const [list, total] = await this.prisma.$transaction([
      this.prisma.banner.findMany({
        orderBy: { sort: 'asc' },
        skip,
        take,
        // 仅 include 未删除的关联歌曲，避免 ghost song
        include: {
          song: {
            where: { deletedAt: null },
            include: { album: true },
          },
        },
      }),
      this.prisma.banner.count(),
    ]);
    return buildPaginatedResult(list, total, page, limit);
  }

  async createBanner(dto: CreateBannerDto) {
    return this.prisma.banner.create({
      data: {
        title: dto.title,
        imageUrl: dto.imageUrl,
        linkUrl: dto.linkUrl,
        songId: dto.songId || null,
        adUrl: dto.adUrl,
        sort: dto.sort ?? 0,
        status: dto.status ?? 'VISIBLE',
      },
      include: { song: { include: { album: true } } },
    });
  }

  async updateBanner(id: string, dto: UpdateBannerDto) {
    await this.assertBannerExists(id);
    return this.prisma.banner.update({
      where: { id },
      data: buildBannerUpdateData(dto),
      include: { song: { include: { album: true } } },
    });
  }

  async deleteBanner(id: string): Promise<{ deleted: true }> {
    await this.assertBannerExists(id);
    await this.prisma.banner.delete({ where: { id } });
    return { deleted: true };
  }

  /** 排序：与相邻 Banner 交换 sort 值 */
  async sortBanner(id: string, direction: 'up' | 'down'): Promise<{ sorted: true }> {
    const allBanners = await this.prisma.banner.findMany({
      orderBy: { sort: 'asc' },
    });
    const index = allBanners.findIndex((b) => b.id === id);
    if (index < 0) throw new NotFoundException('Banner 不存在');
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= allBanners.length) {
      return { sorted: true };
    }

    const current = allBanners[index];
    const target = allBanners[targetIndex];
    await this.prisma.$transaction([
      this.prisma.banner.update({
        where: { id: current.id },
        data: { sort: target.sort },
      }),
      this.prisma.banner.update({
        where: { id: target.id },
        data: { sort: current.sort },
      }),
    ]);
    return { sorted: true };
  }

  // ============ 用户管理 ============

  async listUsers(query: {
    keyword?: string;
    page?: string;
    limit?: string;
    pageSize?: string;
  }): Promise<PaginatedResult<unknown>> {
    const { page, limit, skip, take } = parsePagination(query);
    const where = {
      deletedAt: null,
      ...buildKeywordWhere(query.keyword, ['username', 'email']),
    };
    const [list, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          username: true,
          email: true,
          avatar: true,
          role: true,
          createdAt: true,
          updatedAt: true,
          deletedAt: true,
          // 用户统计：最近登录时间、累计登录次数
          lastLoginAt: true,
          loginCount: true,
          // 关联统计：收藏数、歌单数、播放历史数（total count 不受影响）
          _count: {
            select: { favorites: true, playlists: true, playHistories: true },
          },
        },
      }),
      this.prisma.user.count({ where }),
    ]);
    return buildPaginatedResult(list, total, page, limit);
  }

  async updateUserRole(id: string, role: Role) {
    await this.assertUserExists(id);
    return this.prisma.user.update({
      where: { id },
      data: { role },
      select: {
        id: true,
        username: true,
        email: true,
        avatar: true,
        role: true,
      },
    });
  }

  async updateUserStatus(id: string, disabled: boolean) {
    await this.assertUserExists(id);
    return this.prisma.user.update({
      where: { id },
      data: { deletedAt: disabled ? new Date() : null },
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        deletedAt: true,
      },
    });
  }

  // ============ 歌手 ============

  async listArtists(query: {
    keyword?: string;
    page?: string;
    limit?: string;
    pageSize?: string;
  }): Promise<PaginatedResult<unknown>> {
    const { page, limit, skip, take } = parsePagination(query);
    const where = {
      deletedAt: null,
      ...buildKeywordWhere(query.keyword, ['name']),
    };
    const [list, total] = await this.prisma.$transaction([
      this.prisma.artist.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.artist.count({ where }),
    ]);
    return buildPaginatedResult(list, total, page, limit);
  }

  async createArtist(dto: CreateArtistDto) {
    return this.prisma.artist.create({
      data: {
        name: dto.name,
        avatar: dto.avatar,
        bio: dto.bio,
        representativeWorks: dto.representativeWorks,
      },
    });
  }

  async updateArtist(id: string, dto: UpdateArtistDto) {
    await this.assertArtistExists(id);
    return this.prisma.artist.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.avatar !== undefined && { avatar: dto.avatar }),
        ...(dto.bio !== undefined && { bio: dto.bio }),
        ...(dto.representativeWorks !== undefined && { representativeWorks: dto.representativeWorks }),
      },
    });
  }

  async deleteArtist(id: string): Promise<{ deleted: true }> {
    await this.assertArtistExists(id);
    await this.prisma.$transaction(async (tx) => {
      await tx.artist.update({
        where: { id },
        data: { deletedAt: new Date() },
      });
    });
    return { deleted: true };
  }

  async getArtistDetail(id: string) {
    const artist = await this.prisma.artist.findFirst({
      where: { id, deletedAt: null },
    });
    if (!artist) throw new NotFoundException('歌手不存在');
    return artist;
  }

  // ============ 存在性校验 ============

  private async assertAlbumExists(id: string) {
    const album = await this.prisma.album.findFirst({ where: { id } });
    if (!album) throw new NotFoundException('专辑不存在');
  }

  private async assertArtistExists(id: string) {
    const artist = await this.prisma.artist.findFirst({ where: { id } });
    if (!artist) throw new NotFoundException('歌手不存在');
  }

  private async assertPlaylistExists(id: string) {
    const playlist = await this.prisma.playlist.findFirst({ where: { id } });
    if (!playlist) throw new NotFoundException('歌单不存在');
  }

  private async assertBannerExists(id: string) {
    const banner = await this.prisma.banner.findUnique({ where: { id } });
    if (!banner) throw new NotFoundException('Banner 不存在');
  }

  private async assertUserExists(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('用户不存在');
  }
}
