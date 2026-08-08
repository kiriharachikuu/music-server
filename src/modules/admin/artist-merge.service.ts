import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  ARTIST_JOIN,
  artistSimilarity,
  normalizeArtistName,
  rewriteArtistToken,
  splitArtists,
} from '../../common/utils/artist-normalize.util';
import { MergeArtistDto, AddAliasDto } from './dto/artist-merge.dto';

/** 一个变体成员在各处的出现统计 */
export interface MemberStat {
  name: string;
  key: string;
  clips: number;
  songs: number;
  sessions: number;
  albums: number;
  artistId?: string; // 若该变体已有 Artist 行
}

/** 扫描建议返回的一个候选分组 */
export interface Cluster {
  canonical: string;
  canonicalArtistId?: string;
  members: MemberStat[];
  totalClips: number;
  totalSongs: number;
  why: string;
}

/** preview / merge 内部计算出的改动计划 */
interface MergePlan {
  canonicalName: string;
  aliasNames: string[]; // 实际参与合并的变体（已剔除规范名）
  aliasNormSet: Set<string>;
  clips: { id: string; old: string; next: string }[];
  sessions: { id: string; old: string; next: string }[];
  albums: { id: string; old: string; next: string }[];
  aliasArtistIds: string[]; // 要软删并入的别名歌手行
}

const SIM_THRESHOLD = 0.72;

@Injectable()
export class ArtistMergeService {
  constructor(private readonly prisma: PrismaService) {}

  // ========================================================================
  // 现有歌手建议（供输入框下拉）
  // ========================================================================

  /**
   * 返回现有 Artist（未删）列表，按与 q 的相似度排序，最适配在前。
   * q 为空时按歌曲数降序 + 名称。用于合并页规范名输入框的下拉候选。
   */
  async suggestArtists(q?: string, limit = 20) {
    const artists = await this.prisma.artist.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        name: true,
        avatar: true,
        _count: { select: { songArtists: true } },
      },
    });
    const query = (q ?? '').trim();
    const scored = artists.map((a) => ({
      id: a.id,
      name: a.name,
      avatar: a.avatar,
      songCount: a._count.songArtists,
      score: query ? artistSimilarity(query, a.name) : 0,
    }));
    scored.sort((x, y) =>
      query
        ? y.score - x.score || y.songCount - x.songCount || x.name.localeCompare(y.name)
        : y.songCount - x.songCount || x.name.localeCompare(y.name),
    );
    return { list: scored.slice(0, Math.min(50, Math.max(1, limit))) };
  }

  // ========================================================================
  // 扫描建议
  // ========================================================================

  /**
   * 扫描全库歌手字符串 + Artist 行，按归一化 + 相似度聚类，产出「疑似同一人」候选分组。
   * 只给建议，不落库。
   */
  async scan(): Promise<{ clusters: Cluster[] }> {
    const [clips, sessions, songs, albums, artists] = await Promise.all([
      this.prisma.liveClip.findMany({ select: { artist: true } }),
      this.prisma.liveSession.findMany({
        where: { deletedAt: null },
        select: { artist: true },
      }),
      this.prisma.song.findMany({
        where: { deletedAt: null },
        select: { artist: true },
      }),
      this.prisma.album.findMany({
        where: { deletedAt: null },
        select: { artist: true },
      }),
      this.prisma.artist.findMany({
        where: { deletedAt: null },
        select: { id: true, name: true },
      }),
    ]);

    // 统计每个「显示名 token」的出现次数
    const stats = new Map<string, MemberStat>();
    const bump = (
      raw: string,
      field: 'clips' | 'songs' | 'sessions' | 'albums',
    ) => {
      for (const token of splitArtists(raw)) {
        const key = normalizeArtistName(token);
        if (!key) continue;
        let s = stats.get(token);
        if (!s) {
          s = { name: token, key, clips: 0, songs: 0, sessions: 0, albums: 0 };
          stats.set(token, s);
        }
        s[field] += 1;
      }
    };
    clips.forEach((r) => bump(r.artist, 'clips'));
    sessions.forEach((r) => bump(r.artist, 'sessions'));
    songs.forEach((r) => bump(r.artist, 'songs'));
    albums.forEach((r) => bump(r.artist, 'albums'));
    // Artist 行也作为成员（即使暂无内容），并标注 artistId
    for (const a of artists) {
      let s = stats.get(a.name);
      if (!s) {
        s = {
          name: a.name,
          key: normalizeArtistName(a.name),
          clips: 0,
          songs: 0,
          sessions: 0,
          albums: 0,
        };
        stats.set(a.name, s);
      }
      s.artistId = a.id;
    }

    const members = [...stats.values()];

    // 并查集：先按归一化 key 合并（大小写/全半角等价），再按相似度（子串/编辑距离）合并
    const idx = new Map<string, number>();
    members.forEach((m, i) => idx.set(m.name, i));
    const parent = members.map((_, i) => i);
    const find = (x: number): number =>
      parent[x] === x ? x : (parent[x] = find(parent[x]));
    const union = (a: number, b: number) => {
      const ra = find(a);
      const rb = find(b);
      if (ra !== rb) parent[ra] = rb;
    };

    // 同 key 直接 union
    const byKey = new Map<string, number[]>();
    members.forEach((m, i) => {
      const arr = byKey.get(m.key) ?? [];
      arr.push(i);
      byKey.set(m.key, arr);
    });
    for (const arr of byKey.values()) {
      for (let i = 1; i < arr.length; i++) union(arr[0], arr[i]);
    }
    // 不同 key 之间按相似度 union（O(k^2)，k=去重 key 数）
    const keys = [...byKey.keys()];
    for (let i = 0; i < keys.length; i++) {
      for (let j = i + 1; j < keys.length; j++) {
        if (artistSimilarity(keys[i], keys[j]) >= SIM_THRESHOLD) {
          union(byKey.get(keys[i])![0], byKey.get(keys[j])![0]);
        }
      }
    }

    // 归组
    const groups = new Map<number, MemberStat[]>();
    members.forEach((m, i) => {
      const r = find(i);
      const arr = groups.get(r) ?? [];
      arr.push(m);
      groups.set(r, arr);
    });

    const clusters: Cluster[] = [];
    for (const arr of groups.values()) {
      // 去重显示名后仍 >= 2 个变体才算需要合并
      const uniqNames = new Map<string, MemberStat>();
      for (const m of arr) if (!uniqNames.has(m.name)) uniqNames.set(m.name, m);
      const list = [...uniqNames.values()];
      if (list.length < 2) continue;

      // 规范名建议：优先「有 Artist 行且内容最多」，否则「最长的名字」
      const scoreContent = (m: MemberStat) =>
        m.clips + m.songs + m.sessions + m.albums;
      const withRow = list.filter((m) => m.artistId);
      let canonicalMember: MemberStat;
      if (withRow.length) {
        canonicalMember = withRow.sort(
          (a, b) => scoreContent(b) - scoreContent(a),
        )[0];
      } else {
        canonicalMember = list.sort((a, b) => b.name.length - a.name.length)[0];
      }

      clusters.push({
        canonical: canonicalMember.name,
        canonicalArtistId: canonicalMember.artistId,
        members: list.sort((a, b) => scoreContent(b) - scoreContent(a)),
        totalClips: list.reduce((s, m) => s + m.clips, 0),
        totalSongs: list.reduce((s, m) => s + m.songs, 0),
        why: this.buildWhy(list),
      });
    }

    // 影响面大的排前面
    clusters.sort(
      (a, b) => b.totalClips + b.totalSongs - (a.totalClips + a.totalSongs),
    );
    return { clusters };
  }

  private buildWhy(list: MemberStat[]): string {
    const names = list.map((m) => m.name);
    const reasons: string[] = [];
    const keys = new Set(list.map((m) => m.key));
    if (keys.size < names.length) {
      reasons.push('大小写/全半角归一后一致');
    }
    // 子串关系
    for (let i = 0; i < list.length; i++) {
      for (let j = 0; j < list.length; j++) {
        if (i === j) continue;
        const a = list[i].key;
        const b = list[j].key;
        if (a.length >= 2 && b.length > a.length && b.includes(a)) {
          reasons.push(`「${list[i].name}」是「${list[j].name}」的子串`);
        }
      }
    }
    if (!reasons.length) reasons.push('名称相似度高');
    return [...new Set(reasons)].slice(0, 3).join('；') + ' → 疑似同一歌手';
  }

  // ========================================================================
  // 计算改动计划（preview / merge 共用）
  // ========================================================================

  private async computePlan(dto: MergeArtistDto): Promise<MergePlan> {
    const canonicalName = dto.canonicalName?.trim();
    if (!canonicalName) throw new BadRequestException('缺少规范歌手名');
    const canonNorm = normalizeArtistName(canonicalName);

    // 剔除与规范名归一化相同的别名
    const aliasNames = [...new Set(dto.aliases.map((a) => a.trim()))].filter(
      (a) => a && normalizeArtistName(a) !== canonNorm,
    );
    if (!aliasNames.length)
      throw new BadRequestException('没有需要并入的变体（都与规范名相同）');
    const aliasNormSet = new Set(aliasNames.map(normalizeArtistName));

    // 各处字符串命中改写的行
    const [clipRows, sessionRows, albumRows] = await Promise.all([
      this.prisma.liveClip.findMany({ select: { id: true, artist: true } }),
      this.prisma.liveSession.findMany({
        where: { deletedAt: null },
        select: { id: true, artist: true },
      }),
      this.prisma.album.findMany({
        where: { deletedAt: null },
        select: { id: true, artist: true },
      }),
    ]);
    const pick = (rows: { id: string; artist: string }[]) =>
      rows
        .map((r) => {
          const next = rewriteArtistToken(r.artist, aliasNormSet, canonicalName);
          return next && next !== r.artist
            ? { id: r.id, old: r.artist, next }
            : null;
        })
        .filter((x): x is { id: string; old: string; next: string } => !!x);

    // 别名歌手行（要软删并入规范）
    const aliasArtists = await this.prisma.artist.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true },
    });
    const aliasArtistIds = aliasArtists
      .filter(
        (a) =>
          aliasNormSet.has(normalizeArtistName(a.name)) &&
          a.id !== dto.canonicalArtistId,
      )
      .map((a) => a.id);

    return {
      canonicalName,
      aliasNames,
      aliasNormSet,
      clips: pick(clipRows),
      sessions: pick(sessionRows),
      albums: pick(albumRows),
      aliasArtistIds,
    };
  }

  /** 试跑：返回将产生的改动，不写库 */
  async preview(dto: MergeArtistDto) {
    const plan = await this.computePlan(dto);
    // 受影响歌曲（关联在别名歌手行下的，或字符串命中的）
    const songAffected = await this.collectAffectedSongs(plan);
    return {
      canonicalName: plan.canonicalName,
      aliases: plan.aliasNames,
      summary: {
        clips: plan.clips.length,
        sessions: plan.sessions.length,
        albums: plan.albums.length,
        songs: songAffected.length,
        aliasesToRegister: plan.aliasNames.length,
        artistRowsMerged: plan.aliasArtistIds.length,
      },
      // 明细样例（前 50 条，避免过大）
      detail: [
        ...plan.clips.map((c) => ({ type: 'clip', old: c.old, next: c.next })),
        ...plan.sessions.map((c) => ({
          type: 'session',
          old: c.old,
          next: c.next,
        })),
        ...plan.albums.map((c) => ({ type: 'album', old: c.old, next: c.next })),
      ].slice(0, 50),
    };
  }

  /** 找出受影响歌曲 id（关联别名歌手行 + 字符串命中，去重） */
  private async collectAffectedSongs(plan: MergePlan): Promise<string[]> {
    const set = new Set<string>();
    if (plan.aliasArtistIds.length) {
      const rels = await this.prisma.songArtist.findMany({
        where: { artistId: { in: plan.aliasArtistIds } },
        select: { songId: true },
      });
      rels.forEach((r) => set.add(r.songId));
    }
    const songs = await this.prisma.song.findMany({
      where: { deletedAt: null },
      select: { id: true, artist: true },
    });
    for (const s of songs) {
      const next = rewriteArtistToken(
        s.artist,
        plan.aliasNormSet,
        plan.canonicalName,
      );
      if (next && next !== s.artist) set.add(s.id);
    }
    return [...set];
  }

  // ========================================================================
  // 执行合并（事务 + 快照，可撤销）
  // ========================================================================

  async merge(dto: MergeArtistDto, operator?: { id?: string; username?: string }) {
    const plan = await this.computePlan(dto);

    return this.prisma.$transaction(async (tx) => {
      // 1) 确保规范 Artist 行存在（供别名表引用 + 让合并后的歌手成为正式实体）
      let canonicalArtist = dto.canonicalArtistId
        ? await tx.artist.findUnique({ where: { id: dto.canonicalArtistId } })
        : await tx.artist.findUnique({ where: { name: plan.canonicalName } });
      let createdArtistId: string | null = null;
      if (!canonicalArtist) {
        canonicalArtist = await tx.artist.create({
          data: { name: plan.canonicalName },
        });
        createdArtistId = canonicalArtist.id;
      } else if (canonicalArtist.deletedAt) {
        await tx.artist.update({
          where: { id: canonicalArtist.id },
          data: { deletedAt: null },
        });
      }
      const canonicalId = canonicalArtist.id;

      // 2) 改写字符串：clips / sessions / albums
      for (const c of plan.clips)
        await tx.liveClip.update({
          where: { id: c.id },
          data: { artist: c.next },
        });
      for (const s of plan.sessions)
        await tx.liveSession.update({
          where: { id: s.id },
          data: { artist: s.next },
        });
      for (const a of plan.albums)
        await tx.album.update({
          where: { id: a.id },
          data: { artist: a.next },
        });

      // 3) 歌曲：重指 SongArtist 关联（别名歌手行 → 规范行），并记录快照
      const songArtistMoves: {
        songId: string;
        fromArtistId: string;
        action: 'moved' | 'removed';
        sort: number;
      }[] = [];
      const affectedSongIds = new Set<string>();
      if (plan.aliasArtistIds.length) {
        const rels = await tx.songArtist.findMany({
          where: { artistId: { in: plan.aliasArtistIds } },
        });
        for (const rel of rels) {
          affectedSongIds.add(rel.songId);
          const existCanon = await tx.songArtist.findUnique({
            where: {
              songId_artistId: { songId: rel.songId, artistId: canonicalId },
            },
          });
          if (existCanon) {
            // 规范关联已存在 → 删除别名关联
            await tx.songArtist.delete({ where: { id: rel.id } });
            songArtistMoves.push({
              songId: rel.songId,
              fromArtistId: rel.artistId,
              action: 'removed',
              sort: rel.sort,
            });
          } else {
            await tx.songArtist.update({
              where: { id: rel.id },
              data: { artistId: canonicalId },
            });
            songArtistMoves.push({
              songId: rel.songId,
              fromArtistId: rel.artistId,
              action: 'moved',
              sort: rel.sort,
            });
          }
        }
      }
      // 字符串命中但无关联的歌曲
      const strSongs = await tx.song.findMany({
        where: { deletedAt: null },
        select: { id: true, artist: true },
      });
      const songStringHits = strSongs.filter((s) => {
        const next = rewriteArtistToken(
          s.artist,
          plan.aliasNormSet,
          plan.canonicalName,
        );
        return next && next !== s.artist;
      });
      songStringHits.forEach((s) => affectedSongIds.add(s.id));

      // 4) 快照旧的 Song.artist 字符串（用于 revert），再刷新新值
      const songSnapshots: { id: string; old: string }[] = [];
      for (const songId of affectedSongIds) {
        const song = await tx.song.findUnique({
          where: { id: songId },
          select: { artist: true },
        });
        if (!song) continue;
        songSnapshots.push({ id: songId, old: song.artist });
        // 新值：有关联的按关联派生，无关联的按字符串改写
        const rels = await tx.songArtist.findMany({
          where: { songId },
          include: { artist: { select: { name: true } } },
          orderBy: { sort: 'asc' },
        });
        let next: string;
        if (rels.length) {
          const seen = new Set<string>();
          const names = rels
            .map((r) => r.artist.name)
            .filter((n) => {
              const k = normalizeArtistName(n);
              if (seen.has(k)) return false;
              seen.add(k);
              return true;
            });
          next = names.join(ARTIST_JOIN);
        } else {
          next =
            rewriteArtistToken(
              song.artist,
              plan.aliasNormSet,
              plan.canonicalName,
            ) ?? song.artist;
        }
        await tx.song.update({ where: { id: songId }, data: { artist: next } });
      }

      // 5) 软删别名歌手行
      if (plan.aliasArtistIds.length) {
        await tx.artist.updateMany({
          where: { id: { in: plan.aliasArtistIds } },
          data: { deletedAt: new Date() },
        });
      }

      // 6) 登记别名（新建的记录 id 用于 revert 删除）
      const createdAliasIds: string[] = [];
      for (const name of plan.aliasNames) {
        const exist = await tx.artistAlias.findUnique({
          where: { alias: name },
        });
        if (exist) {
          if (exist.artistId !== canonicalId) {
            await tx.artistAlias.update({
              where: { id: exist.id },
              data: {
                artistId: canonicalId,
                canonical: plan.canonicalName,
                source: 'merge',
              },
            });
          }
          continue;
        }
        const created = await tx.artistAlias.create({
          data: {
            alias: name,
            normalized: normalizeArtistName(name),
            artistId: canonicalId,
            canonical: plan.canonicalName,
            source: 'merge',
          },
        });
        createdAliasIds.push(created.id);
      }

      // 7) 写合并日志（含回滚快照）
      const changes = {
        clips: plan.clips.map((c) => ({ id: c.id, old: c.old })),
        sessions: plan.sessions.map((c) => ({ id: c.id, old: c.old })),
        albums: plan.albums.map((c) => ({ id: c.id, old: c.old })),
        songs: songSnapshots,
        songArtistMoves,
        softDeletedArtistIds: plan.aliasArtistIds,
        createdArtistId,
        createdAliasIds,
        canonicalId,
      };
      const log = await tx.artistMergeLog.create({
        data: {
          canonicalName: plan.canonicalName,
          canonicalArtistId: canonicalId,
          aliases: JSON.stringify(plan.aliasNames),
          changes: JSON.stringify(changes),
          operatorId: operator?.id,
          operatorName: operator?.username,
          clipCount: plan.clips.length,
          songCount: songSnapshots.length,
        },
      });

      return {
        id: log.id,
        canonicalName: plan.canonicalName,
        merged: plan.aliasNames,
        summary: {
          clips: plan.clips.length,
          sessions: plan.sessions.length,
          albums: plan.albums.length,
          songs: songSnapshots.length,
          aliasesRegistered: plan.aliasNames.length,
          artistRowsMerged: plan.aliasArtistIds.length,
        },
      };
    });
  }

  // ========================================================================
  // 合并历史 + 撤销
  // ========================================================================

  async listLogs(query: { page?: string; limit?: string }) {
    const page = Math.max(1, parseInt(query.page ?? '1', 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(query.limit ?? '20', 10) || 20));
    const [list, total] = await this.prisma.$transaction([
      this.prisma.artistMergeLog.findMany({
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.artistMergeLog.count(),
    ]);
    return {
      total,
      page,
      limit,
      list: list.map((l) => ({
        id: l.id,
        canonicalName: l.canonicalName,
        aliases: safeParse<string[]>(l.aliases, []),
        clipCount: l.clipCount,
        songCount: l.songCount,
        operatorName: l.operatorName,
        createdAt: l.createdAt,
        reverted: !!l.revertedAt,
        revertedAt: l.revertedAt,
      })),
    };
  }

  /** 撤销一次合并：按快照回滚 */
  async revert(id: string) {
    const log = await this.prisma.artistMergeLog.findUnique({ where: { id } });
    if (!log) throw new NotFoundException('合并记录不存在');
    if (log.revertedAt) throw new BadRequestException('该合并已撤销');
    const c = safeParse<any>(log.changes, null);
    if (!c) throw new BadRequestException('快照损坏，无法自动撤销');

    await this.prisma.$transaction(async (tx) => {
      // 还原字符串
      for (const r of c.clips ?? [])
        await tx.liveClip.update({
          where: { id: r.id },
          data: { artist: r.old },
        });
      for (const r of c.sessions ?? [])
        await tx.liveSession.update({
          where: { id: r.id },
          data: { artist: r.old },
        });
      for (const r of c.albums ?? [])
        await tx.album.update({ where: { id: r.id }, data: { artist: r.old } });
      for (const r of c.songs ?? [])
        await tx.song.update({ where: { id: r.id }, data: { artist: r.old } });

      // 还原 SongArtist 关联
      for (const m of c.songArtistMoves ?? []) {
        if (m.action === 'moved') {
          // 当时把 fromArtistId → canonicalId，现在改回
          const rel = await tx.songArtist.findUnique({
            where: {
              songId_artistId: { songId: m.songId, artistId: c.canonicalId },
            },
          });
          if (rel)
            await tx.songArtist.update({
              where: { id: rel.id },
              data: { artistId: m.fromArtistId },
            });
        } else if (m.action === 'removed') {
          // 当时删除了别名关联，重建
          const dup = await tx.songArtist.findUnique({
            where: {
              songId_artistId: { songId: m.songId, artistId: m.fromArtistId },
            },
          });
          if (!dup)
            await tx.songArtist.create({
              data: {
                songId: m.songId,
                artistId: m.fromArtistId,
                sort: m.sort ?? 0,
              },
            });
        }
      }

      // 恢复软删的别名歌手行
      if ((c.softDeletedArtistIds ?? []).length)
        await tx.artist.updateMany({
          where: { id: { in: c.softDeletedArtistIds } },
          data: { deletedAt: null },
        });

      // 删除本次登记的别名
      if ((c.createdAliasIds ?? []).length)
        await tx.artistAlias.deleteMany({
          where: { id: { in: c.createdAliasIds } },
        });

      // 删除本次新建的规范歌手行（仅当是本次创建的）
      if (c.createdArtistId) {
        const stillUsed = await tx.songArtist.count({
          where: { artistId: c.createdArtistId },
        });
        if (!stillUsed)
          await tx.artist
            .delete({ where: { id: c.createdArtistId } })
            .catch(() => undefined);
      }

      await tx.artistMergeLog.update({
        where: { id },
        data: { revertedAt: new Date() },
      });
    });

    return { reverted: true };
  }

  // ========================================================================
  // 别名 CRUD
  // ========================================================================

  async listAliases(query: { keyword?: string }) {
    const where = query.keyword
      ? {
          OR: [
            { alias: { contains: query.keyword } },
            { canonical: { contains: query.keyword } },
          ],
        }
      : {};
    const list = await this.prisma.artistAlias.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
    return {
      list: list.map((a) => ({
        id: a.id,
        alias: a.alias,
        canonical: a.canonical,
        artistId: a.artistId,
        source: a.source,
        createdAt: a.createdAt,
      })),
    };
  }

  async addAlias(dto: AddAliasDto) {
    const alias = dto.alias?.trim();
    const canonicalName = dto.canonicalName?.trim();
    if (!alias || !canonicalName)
      throw new BadRequestException('变体与规范歌手名不能为空');
    if (normalizeArtistName(alias) === normalizeArtistName(canonicalName))
      throw new BadRequestException('变体与规范名归一化后相同，无需别名');

    return this.prisma.$transaction(async (tx) => {
      let artist = dto.canonicalArtistId
        ? await tx.artist.findUnique({ where: { id: dto.canonicalArtistId } })
        : await tx.artist.findUnique({ where: { name: canonicalName } });
      if (!artist)
        artist = await tx.artist.create({ data: { name: canonicalName } });
      else if (artist.deletedAt)
        await tx.artist.update({
          where: { id: artist.id },
          data: { deletedAt: null },
        });

      return tx.artistAlias.upsert({
        where: { alias },
        create: {
          alias,
          normalized: normalizeArtistName(alias),
          artistId: artist.id,
          canonical: canonicalName,
          source: 'manual',
        },
        update: {
          artistId: artist.id,
          canonical: canonicalName,
          normalized: normalizeArtistName(alias),
        },
      });
    });
  }

  async deleteAlias(id: string) {
    const exist = await this.prisma.artistAlias.findUnique({ where: { id } });
    if (!exist) throw new NotFoundException('别名不存在');
    await this.prisma.artistAlias.delete({ where: { id } });
    return { deleted: true };
  }
}

function safeParse<T>(s: string, fallback: T): T {
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}
