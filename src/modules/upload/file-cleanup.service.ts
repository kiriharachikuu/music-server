import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { STORAGE_SERVICE } from './storage.interface';
import { Inject } from '@nestjs/common';
import type { StorageService } from './storage.interface';

/**
 * 孤立文件清理服务
 *
 * 定期检查 UploadRecord 表中超过阈值未被使用的上传记录，
 * 比对数据库中所有被引用的文件路径，删除未被引用的孤立文件。
 */
@Injectable()
export class FileCleanupService {
  private readonly logger = new Logger(FileCleanupService.name);

  /** 超过此时间未被关联到任何记录的上传文件视为孤立文件（默认 24 小时） */
  private readonly ORPHAN_THRESHOLD_HOURS = 24;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
  ) {}

  /**
   * 每天凌晨 3 点执行清理
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async cleanOrphanedFiles() {
    this.logger.log('开始清理孤立文件...');
    try {
      const threshold = new Date(
        Date.now() - this.ORPHAN_THRESHOLD_HOURS * 60 * 60 * 1000,
      );

      // 1. 查询所有超过阈值的上传记录
      const oldRecords = await this.prisma.uploadRecord.findMany({
        where: { createdAt: { lt: threshold } },
        select: { id: true, path: true, category: true },
      });

      if (oldRecords.length === 0) {
        this.logger.log('没有需要清理的孤立文件');
        return;
      }

      // 2. 收集数据库中所有被引用的文件路径
      const referencedPaths = await this.collectReferencedPaths();

      // 3. 筛选出未被引用的孤立文件
      const orphans = oldRecords.filter(
        (r) => !referencedPaths.has(r.path),
      );

      if (orphans.length === 0) {
        this.logger.log(`检查了 ${oldRecords.length} 条上传记录，未发现孤立文件`);
        return;
      }

      // 4. 逐个删除孤立文件并清理记录
      let deletedCount = 0;
      let failedCount = 0;
      const deletedIds: string[] = [];

      for (const orphan of orphans) {
        try {
          await this.storage.delete(orphan.path);
          deletedIds.push(orphan.id);
          deletedCount++;
        } catch {
          // 删除失败也清理记录，避免反复尝试
          deletedIds.push(orphan.id);
          failedCount++;
        }
      }

      // 批量删除已处理的 UploadRecord
      if (deletedIds.length > 0) {
        await this.prisma.uploadRecord.deleteMany({
          where: { id: { in: deletedIds } },
        });
      }

      this.logger.log(
        `清理完成：共处理 ${orphans.length} 个孤立文件，成功删除 ${deletedCount} 个，失败 ${failedCount} 个`,
      );
    } catch (err) {
      this.logger.error(`清理孤立文件时发生错误: ${err}`);
    }
  }

  /**
   * 收集数据库中所有被引用的文件存储路径
   * 包括歌曲、歌切、专辑、歌单、歌手、用户的文件 URL
   */
  private async collectReferencedPaths(): Promise<Set<string>> {
    const paths = new Set<string>();

    // Song: fileUrl, coverUrl, lyricUrl
    const songs = await this.prisma.song.findMany({
      where: { deletedAt: null },
      select: { fileUrl: true, coverUrl: true, lyricUrl: true },
    });
    for (const s of songs) {
      if (s.fileUrl) paths.add(this.storage.extractPath(s.fileUrl));
      if (s.coverUrl) paths.add(this.storage.extractPath(s.coverUrl));
      if (s.lyricUrl) paths.add(this.storage.extractPath(s.lyricUrl));
    }

    // LiveClip: fileUrl, coverUrl
    const clips = await this.prisma.liveClip.findMany({
      select: { fileUrl: true, coverUrl: true },
    });
    for (const c of clips) {
      if (c.fileUrl) paths.add(this.storage.extractPath(c.fileUrl));
      if (c.coverUrl) paths.add(this.storage.extractPath(c.coverUrl));
    }

    // Album: cover
    const albums = await this.prisma.album.findMany({
      select: { cover: true },
    });
    for (const a of albums) {
      if (a.cover) paths.add(this.storage.extractPath(a.cover));
    }

    // Playlist: cover
    const playlists = await this.prisma.playlist.findMany({
      where: { deletedAt: null },
      select: { cover: true },
    });
    for (const p of playlists) {
      if (p.cover) paths.add(this.storage.extractPath(p.cover));
    }

    // Artist: avatar
    const artists = await this.prisma.artist.findMany({
      select: { avatar: true },
    });
    for (const a of artists) {
      if (a.avatar) paths.add(this.storage.extractPath(a.avatar));
    }

    // User: avatar
    const users = await this.prisma.user.findMany({
      select: { avatar: true },
    });
    for (const u of users) {
      if (u.avatar) paths.add(this.storage.extractPath(u.avatar));
    }

    // LiveSession: cover
    const sessions = await this.prisma.liveSession.findMany({
      select: { cover: true },
    });
    for (const s of sessions) {
      if (s.cover) paths.add(this.storage.extractPath(s.cover));
    }

    return paths;
  }
}
