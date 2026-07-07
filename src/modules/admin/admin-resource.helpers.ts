import * as fs from 'fs/promises';
import * as path from 'path';
import { UpdateAlbumDto } from './dto/album.dto';
import { UpdateBannerDto } from './dto/banner.dto';
import { UpdatePlaylistDto } from './dto/playlist.dto';

/**
 * 构建关键词模糊查询 where 条件（多字段 OR）
 * 无关键词时返回空对象，便于 spread 合并
 * 返回类型放宽为 any 以兼容 Prisma 各资源 WhereInput 的强类型约束
 * 注意：不使用 mode: 'insensitive' 以兼容 SQLite（PostgreSQL/MySQL 支持）
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildKeywordWhere(keyword: string | undefined, fields: string[]): any {
  const kw = (keyword ?? '').trim();
  if (!kw) return {};
  return {
    OR: fields.map((f) => ({
      [f]: { contains: kw },
    })),
  };
}

/**
 * 构建专辑更新 data（仅包含 dto 中明确传入的字段）
 * releaseDate 会被转换为 Date
 */
export function buildAlbumUpdateData(dto: UpdateAlbumDto) {
  return {
    ...(dto.name !== undefined && { name: dto.name }),
    ...(dto.artist !== undefined && { artist: dto.artist }),
    ...(dto.cover !== undefined && { cover: dto.cover }),
    ...(dto.description !== undefined && { description: dto.description }),
    ...(dto.releaseDate !== undefined && {
      releaseDate: new Date(dto.releaseDate),
    }),
  };
}

/**
 * 构建歌单更新 data
 * deletedAt 传 truthy 表示软删除时间戳，否则置 null
 */
export function buildPlaylistUpdateData(dto: UpdatePlaylistDto) {
  const data: Record<string, unknown> = {
    ...(dto.name !== undefined && { name: dto.name }),
    ...(dto.cover !== undefined && { cover: dto.cover }),
    ...(dto.description !== undefined && { description: dto.description }),
    ...(dto.isPublic !== undefined && { isPublic: dto.isPublic }),
    ...(dto.deletedAt !== undefined && {
      deletedAt: dto.deletedAt ? new Date() : null,
    }),
  };
  if ('isSystem' in dto && dto.isSystem !== undefined) {
    data.isSystem = dto.isSystem;
  }
  return data;
}

/**
 * 构建 Banner 更新 data
 * songId 传空字符串表示清空关联歌曲
 */
export function buildBannerUpdateData(dto: UpdateBannerDto) {
  const data: Record<string, unknown> = {
    ...(dto.title !== undefined && { title: dto.title }),
    ...(dto.imageUrl !== undefined && { imageUrl: dto.imageUrl }),
    ...(dto.linkUrl !== undefined && { linkUrl: dto.linkUrl }),
    ...(dto.sort !== undefined && { sort: dto.sort }),
    ...(dto.status !== undefined && { status: dto.status }),
  };
  if ('songId' in dto && dto.songId !== undefined) {
    data.songId = dto.songId || null;
  }
  if ('adUrl' in dto && dto.adUrl !== undefined) {
    data.adUrl = dto.adUrl;
  }
  return data;
}

/**
 * 读取歌词文件内容（本地/远程），失败返回空字符串
 *
 * 安全要点：
 * - 远程地址（http/https）通过 fetch 抓取
 * - 本地地址必须位于 uploads 目录内，禁止 .. 路径穿越
 *   （lyricUrl 由前端/管理员构造，若放任任意路径，攻击者可读取
 *    如 /api/songs/:id/lyric 这种公开接口读取服务器任意文件）
 */
export async function readLyricFile(
  lyricUrl?: string | null,
): Promise<string> {
  if (!lyricUrl) return '';
  try {
    if (/^https?:\/\//i.test(lyricUrl)) {
      const res = await fetch(lyricUrl);
      if (!res.ok) return '';
      return await res.text();
    }
    // 本地地址：仅允许 uploads/ 前缀，禁止 .. 穿越
    const rel = lyricUrl.replace(/^\/+/, '');
    if (!rel.startsWith('uploads/') || rel.includes('..')) {
      return '';
    }
    const uploadsRoot = path.resolve(process.cwd(), 'uploads');
    const abs = path.resolve(process.cwd(), rel);
    // 二次校验：解析后绝对路径必须位于 uploads 根目录内
    if (abs !== uploadsRoot && !abs.startsWith(uploadsRoot + path.sep)) {
      return '';
    }
    return await fs.readFile(abs, 'utf-8');
  } catch {
    return '';
  }
}
