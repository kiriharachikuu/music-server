import { Injectable, Logger } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AudioProcessService } from '../upload/audio-process.service';
import { STORAGE_SERVICE } from '../upload/storage.interface';
import type { StorageService } from '../upload/storage.interface';

@Injectable()
export class TranscodingService {
  private readonly logger = new Logger(TranscodingService.name);
  private readonly CONCURRENCY_LIMIT = 2;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audioProcess: AudioProcessService,
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
  ) {}

  async createJob(): Promise<{ jobId: string }> {
    // 查询已发布但尚未完成全部三种音质转码的歌曲
    const songsWithoutQuality = await this.prisma.song.findMany({
      where: {
        deletedAt: null,
        status: 'PUBLISHED',
      },
      select: {
        id: true,
        title: true,
        artist: true,
        fileUrl: true,
        songQualities: {
          select: { quality: true },
        },
      },
    });

    // 只对还没有完整三种音质的歌曲创建任务
    const songsToTranscode = songsWithoutQuality.filter(
      (song) => {
        const doneLevels = new Set(song.songQualities.map((q) => q.quality));
        return doneLevels.size < 3;
      },
    );

    const existingJobs = await this.prisma.transcodingJob.findMany({
      where: {
        status: { in: ['PENDING', 'PROCESSING'] },
      },
    });

    if (existingJobs.length > 0) {
      return { jobId: existingJobs[0].id };
    }

    if (songsToTranscode.length === 0) {
      return { jobId: 'no_songs' };
    }

    const job = await this.prisma.transcodingJob.create({
      data: {
        totalSongs: songsToTranscode.length,
        completedSongs: 0,
        failedSongs: 0,
        status: 'PENDING',
      },
    });

    await this.prisma.transcodingJobItem.createMany({
      data: songsToTranscode.map((song) => ({
        jobId: job.id,
        songId: song.id,
        songTitle: song.title,
        songArtist: song.artist,
        status: 'PENDING',
      })),
    });

    return { jobId: job.id };
  }

  async getJobs() {
    return this.prisma.transcodingJob.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        status: true,
        totalSongs: true,
        completedSongs: true,
        failedSongs: true,
        errorMessage: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async getJob(jobId: string) {
    const job = await this.prisma.transcodingJob.findUnique({
      where: { id: jobId },
      select: {
        id: true,
        status: true,
        totalSongs: true,
        completedSongs: true,
        failedSongs: true,
        errorMessage: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!job) {
      return null;
    }

    const items = await this.prisma.transcodingJobItem.findMany({
      where: { jobId },
      orderBy: { createdAt: 'asc' },
    });

    return { ...job, items };
  }

  async startJob(jobId: string) {
    const job = await this.prisma.transcodingJob.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      throw new Error('转码任务不存在');
    }

    if (job.status === 'PROCESSING') {
      return { started: false, message: '任务正在处理中' };
    }

    await this.prisma.transcodingJob.update({
      where: { id: jobId },
      data: { status: 'PROCESSING' },
    });

    // 修复：异步执行转码任务，避免 HTTP 请求超时
    // processJob 会在后台运行，完成后自动更新任务状态
    this.processJob(jobId).catch((err) => {
      this.logger.error(`转码任务异常：${jobId} - ${err.message}`);
      this.prisma.transcodingJob.update({
        where: { id: jobId },
        data: { status: 'FAILED', errorMessage: err.message },
      }).catch(() => {});
    });

    return { started: true, message: '转码任务已在后台启动' };
  }

  async retryJob(jobId: string) {
    const job = await this.prisma.transcodingJob.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      throw new Error('转码任务不存在');
    }

    // 修复A2：只重置failedSongs，保持completedSongs不变，避免负值
    await this.prisma.transcodingJob.update({
      where: { id: jobId },
      data: {
        status: 'PROCESSING',
        failedSongs: 0, // 只重置失败计数
      },
    });

    await this.prisma.transcodingJobItem.updateMany({
      where: { jobId, status: 'FAILED' },
      data: { status: 'PENDING', errorMessage: null },
    });

    // 修复：异步执行转码任务，避免 HTTP 请求超时
    this.processJob(jobId).catch((err) => {
      this.logger.error(`重试任务异常：${jobId} - ${err.message}`);
      this.prisma.transcodingJob.update({
        where: { id: jobId },
        data: { status: 'FAILED', errorMessage: err.message },
      }).catch(() => {});
    });

    return { retried: true, message: '重试任务已在后台启动' };
  }

  private async processJob(jobId: string) {
    try {
      const pendingItems = await this.prisma.transcodingJobItem.findMany({
        where: { jobId, status: 'PENDING' },
        select: {
          id: true,
          songId: true,
          songTitle: true,
          songArtist: true,
        },
      });

      const chunks = this.chunkArray(pendingItems, this.CONCURRENCY_LIMIT);

      for (const chunk of chunks) {
        const promises = chunk.map((item) => this.processSong(item, jobId));
        await Promise.all(promises);

        const progress = await this.prisma.transcodingJob.findUnique({
          where: { id: jobId },
        });

        // 修复A1：完成判定逻辑应计入failedSongs，否则有失败项时任务永久卡在PROCESSING
        if (progress && progress.completedSongs + progress.failedSongs >= progress.totalSongs) {
          await this.prisma.transcodingJob.update({
            where: { id: jobId },
            data: { status: 'COMPLETED' },
          });
          this.logger.log(`转码任务完成：${jobId}`);
          break;
        }
      }
    } catch (err) {
      this.logger.error(`转码任务异常：${jobId} - ${(err as Error).message}`);
      try {
        // 标记任务为失败
        await this.prisma.transcodingJob.update({
          where: { id: jobId },
          data: {
            status: 'FAILED',
            errorMessage: (err as Error).message,
          },
        });
      } catch {
        // 忽略状态更新错误
      }
    }
  }

  private async processSong(
    item: { id: string; songId: string; songTitle: string; songArtist: string },
    jobId: string,
  ) {
    try {
      await this.prisma.transcodingJobItem.update({
        where: { id: item.id },
        data: { status: 'PROCESSING' },
      });

      const song = await this.prisma.song.findUnique({
        where: { id: item.songId },
        select: { fileUrl: true },
      });

      if (!song) {
        throw new Error('歌曲不存在');
      }

      const path = this.storage.extractPath(song.fileUrl);
      const buffer = await this.downloadFile(path);

      const results = await this.audioProcess.transcodeToMultipleQualities(
        buffer,
        `${item.songTitle}.mp3`,
      );

      if (results.length === 0) {
        throw new Error('所有音质转码均失败');
      }

      const qualityRecords = await Promise.all(
        results.map(async (r) => {
          const uploadResult = await this.storage.upload(
            {
              buffer: r.buffer,
              originalname: r.filename,
              mimetype: 'audio/mpeg',
              size: r.buffer.length,
              fieldname: 'file',
              encoding: '7bit',
              destination: '',
              filename: r.filename,
              path: '',
            } as Express.Multer.File,
            'audio',
          );

          return {
            songId: item.songId,
            quality: r.level.toUpperCase() as 'HIGH' | 'MEDIUM' | 'LOW',
            bitrate: r.bitrate,
            fileUrl: uploadResult.url,
            fileSize: r.buffer.length,
          };
        }),
      );

      for (const record of qualityRecords) {
        await this.prisma.songQuality.upsert({
          where: { songId_quality: { songId: record.songId, quality: record.quality } },
          update: { fileUrl: record.fileUrl, fileSize: record.fileSize, bitrate: record.bitrate },
          create: record,
        });
      }

      await this.prisma.transcodingJobItem.update({
        where: { id: item.id },
        data: { status: 'COMPLETED' },
      });

      await this.prisma.transcodingJob.update({
        where: { id: jobId },
        data: { completedSongs: { increment: 1 } },
      });

      this.logger.log(`转码完成：${item.songTitle} - ${qualityRecords.length} 个音质版本`);
    } catch (err) {
      const errorMessage = (err as Error).message;
      this.logger.error(`转码失败：${item.songTitle} - ${errorMessage}`);

      await this.prisma.transcodingJobItem.update({
        where: { id: item.id },
        data: { status: 'FAILED', errorMessage },
      });

      await this.prisma.transcodingJob.update({
        where: { id: jobId },
        data: { failedSongs: { increment: 1 } },
      });
    }
  }

  private async downloadFile(path: string): Promise<Buffer> {
    return this.storage.download(path);
  }

  /** 为单首歌曲创建转码任务（异步执行，立即返回 jobId） */
  async transcodeSingleSong(songId: string): Promise<{
    jobId: string;
    message: string;
  }> {
    const song = await this.prisma.song.findUnique({
      where: { id: songId, deletedAt: null },
      select: { id: true, title: true, artist: true, fileUrl: true },
    });
    if (!song) {
      throw new Error('歌曲不存在');
    }

    // 检查是否有未完成的转码任务项（去重）
    const existingItem = await this.prisma.transcodingJobItem.findFirst({
      where: { songId, status: { in: ['PENDING', 'PROCESSING'] } },
    });
    if (existingItem) {
      throw new Error('该歌曲已有正在进行的转码任务');
    }

    // 创建 job
    const job = await this.prisma.transcodingJob.create({
      data: {
        totalSongs: 1,
        completedSongs: 0,
        failedSongs: 0,
        status: 'PROCESSING',
      },
    });

    const item = await this.prisma.transcodingJobItem.create({
      data: {
        jobId: job.id,
        songId: song.id,
        songTitle: song.title,
        songArtist: song.artist,
        status: 'PENDING',
      },
    });

    // 异步执行转码（不 await，后台处理）
    this.processSong(
      { id: item.id, songId: song.id, songTitle: song.title, songArtist: song.artist },
      job.id,
    )
      .then(() => {
        // processSong 内部已处理 completed/failed 计数
        // 检查是否全部完成
        return this.prisma.transcodingJob.findUnique({ where: { id: job.id } });
      })
      .then((progress) => {
        if (progress && progress.completedSongs + progress.failedSongs >= progress.totalSongs) {
          return this.prisma.transcodingJob.update({
            where: { id: job.id },
            data: { status: 'COMPLETED' },
          });
        }
      })
      .catch((err) => {
        this.logger.error(`单曲转码异常：${song.title} - ${(err as Error).message}`);
      });

    return { jobId: job.id, message: '转码任务已启动' };
  }

  /** 获取歌曲的转码/音质状态 */
  async getSongQualityStatus(songId: string) {
    const qualities = await this.prisma.songQuality.findMany({
      where: { songId },
      select: { quality: true, bitrate: true, fileUrl: true, fileSize: true },
    });

    const latestJob = await this.prisma.transcodingJobItem.findFirst({
      where: { songId },
      orderBy: { createdAt: 'desc' },
    });

    return {
      hasQualities: qualities.length > 0,
      qualities,
      transcodingStatus: latestJob?.status ?? null,
    };
  }

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
}