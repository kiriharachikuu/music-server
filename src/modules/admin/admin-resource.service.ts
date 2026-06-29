import { Injectable, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import {
  buildPaginatedResult,
  PaginatedResult,
  parsePagination,
} from '../../common/utils/pagination.util';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateAlbumDto, UpdateAlbumDto } from './dto/album.dto';
import { CreateBannerDto, UpdateBannerDto } from './dto/banner.dto';
import { CreatePlaylistDto, UpdatePlaylistDto } from './dto/playlist.dto';
import { CreateSongDto, UpdateSongDto } from './dto/song.dto';

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
    const keyword = (query.keyword ?? '').trim();
    const where = {
      deletedAt: null,
      ...(keyword
        ? {
            OR: [
              { title: { contains: keyword, mode: 'insensitive' as const } },
              { artist: { contains: keyword, mode: 'insensitive' as const } },
            ],
          }
        : {}),
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
        },
      }),
      this.prisma.song.count({ where }),
    ]);
    return buildPaginatedResult(list, total, page, limit);
  }

  async createSong(dto: CreateSongDto) {
    const { tagIds, albumId, releaseDate, ...rest } = dto;
    return this.prisma.$transaction(async (tx) => {
      const song = await tx.song.create({
        data: {
          ...rest,
          albumId: albumId || null,
          releaseDate: new Date(releaseDate),
          ...(tagIds?.length
            ? { songTags: { create: tagIds.map((tagId) => ({ tagId })) } }
            : {}),
        },
        include: { album: true, songTags: { include: { tag: true } } },
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
    const { tagIds, albumId, releaseDate, ...rest } = dto;
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
        include: { album: true, songTags: { include: { tag: true } } },
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
    });
    return { deleted: true };
  }

  // ============ 专辑 ============

  async listAlbums(query: {
    keyword?: string;
    page?: string;
    limit?: string;
    pageSize?: string;
  }): Promise<PaginatedResult<unknown>> {
    const { page, limit, skip, take } = parsePagination(query);
    const keyword = (query.keyword ?? '').trim();
    const where = {
      deletedAt: null,
      ...(keyword
        ? {
            OR: [
              { name: { contains: keyword, mode: 'insensitive' as const } },
              { artist: { contains: keyword, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
    const [list, total] = await this.prisma.$transaction([
      this.prisma.album.findMany({
        where,
        skip,
        take,
        orderBy: { releaseDate: 'desc' },
      }),
      this.prisma.album.count({ where }),
    ]);
    return buildPaginatedResult(list, total, page, limit);
  }

  async createAlbum(dto: CreateAlbumDto) {
    return this.prisma.album.create({
      data: {
        name: dto.name,
        artist: dto.artist,
        cover: dto.cover,
        description: dto.description,
        releaseDate: new Date(dto.releaseDate),
      },
    });
  }

  async updateAlbum(id: string, dto: UpdateAlbumDto) {
    await this.assertAlbumExists(id);
    return this.prisma.album.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.artist !== undefined && { artist: dto.artist }),
        ...(dto.cover !== undefined && { cover: dto.cover }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.releaseDate !== undefined && {
          releaseDate: new Date(dto.releaseDate),
        }),
      },
    });
  }

  async deleteAlbum(id: string): Promise<{ deleted: true }> {
    await this.assertAlbumExists(id);
    await this.prisma.album.update({
      where: { id },
      data: { deletedAt: new Date() },
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
    const keyword = (query.keyword ?? '').trim();
    const where = {
      deletedAt: null,
      ...(keyword
        ? { name: { contains: keyword, mode: 'insensitive' as const } }
        : {}),
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

  async createPlaylist(dto: CreatePlaylistDto) {
    return this.prisma.playlist.create({
      data: {
        name: dto.name,
        userId: dto.userId,
        cover: dto.cover,
        description: dto.description,
        isPublic: dto.isPublic ?? true,
      },
    });
  }

  async updatePlaylist(id: string, dto: UpdatePlaylistDto) {
    await this.assertPlaylistExists(id);
    return this.prisma.playlist.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.cover !== undefined && { cover: dto.cover }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.isPublic !== undefined && { isPublic: dto.isPublic }),
        ...(dto.deletedAt !== undefined && {
          deletedAt: dto.deletedAt ? new Date() : null,
        }),
      },
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

  // ============ Banner ============

  async listBanners() {
    return this.prisma.banner.findMany({
      orderBy: { sort: 'asc' },
    });
  }

  async createBanner(dto: CreateBannerDto) {
    return this.prisma.banner.create({
      data: {
        title: dto.title,
        imageUrl: dto.imageUrl,
        linkUrl: dto.linkUrl,
        sort: dto.sort ?? 0,
        status: dto.status ?? 'VISIBLE',
      },
    });
  }

  async updateBanner(id: string, dto: UpdateBannerDto) {
    await this.assertBannerExists(id);
    return this.prisma.banner.update({
      where: { id },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.imageUrl !== undefined && { imageUrl: dto.imageUrl }),
        ...(dto.linkUrl !== undefined && { linkUrl: dto.linkUrl }),
        ...(dto.sort !== undefined && { sort: dto.sort }),
        ...(dto.status !== undefined && { status: dto.status }),
      },
    });
  }

  async deleteBanner(id: string): Promise<{ deleted: true }> {
    await this.assertBannerExists(id);
    await this.prisma.banner.delete({ where: { id } });
    return { deleted: true };
  }

  // ============ 用户管理 ============

  async listUsers(query: {
    keyword?: string;
    page?: string;
    limit?: string;
    pageSize?: string;
  }): Promise<PaginatedResult<unknown>> {
    const { page, limit, skip, take } = parsePagination(query);
    const keyword = (query.keyword ?? '').trim();
    const where = keyword
      ? {
          OR: [
            { username: { contains: keyword, mode: 'insensitive' as const } },
            { email: { contains: keyword, mode: 'insensitive' as const } },
          ],
        }
      : {};
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

  // ============ 存在性校验 ============

  private async assertAlbumExists(id: string) {
    const album = await this.prisma.album.findFirst({ where: { id } });
    if (!album) throw new NotFoundException('专辑不存在');
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
