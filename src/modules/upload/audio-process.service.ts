import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import ffprobePath from 'ffprobe-static';

/** 音频元数据探测结果 */
export interface AudioMetadata {
  /** 时长（秒，整数） */
  duration: number;
  /** 比特率（bps） */
  bitrate?: number;
  /** 标题 */
  title?: string;
  /** 演唱者 / 艺术家 */
  artist?: string;
  /** 专辑 */
  album?: string;
}

/** 文件名解析结果 */
export interface ParsedFilename {
  /** 歌名 */
  title?: string;
  /** 演唱者 */
  artist?: string;
  /** 原唱 */
  originalArtist?: string;
  /** 日期 */
  date?: string;
}

/** 完整日期：2024-01-02 / 2024/01/02 / 20240102（同一段内不含字段分隔符 "-"） */
const DATE_FULL_RE = /^\d{4}[-/]?\d{2}[-/]?\d{2}$/;
/** 仅年份：2024 */
const DATE_YEAR_RE = /^\d{4}$/;

/**
 * 音频处理服务
 * - probeMetadata：基于 ffprobe 解析音频 buffer 的元数据
 * - transcodeToMp3：基于 ffmpeg 将音频 buffer 转码为 128kbps MP3
 * - parseFilename：按约定的命名规则解析文件名信息
 * 解析失败不抛异常，仅记录警告，确保不阻断上传流程；
 * 转码失败则记录警告并抛出异常，交由上层处理
 */
@Injectable()
export class AudioProcessService {
  private readonly logger = new Logger(AudioProcessService.name);

  constructor() {
    // 指定 ffprobe 二进制路径，避免依赖系统 PATH
    ffmpeg.setFfprobePath(ffprobePath.path);
  }

  /**
   * 探测音频 buffer 的元数据
   * ffprobe 需要文件路径或流，这里将 buffer 写入临时文件后解析，最终清理临时文件
   * 失败时静默返回 { duration: 0 }，不抛异常
   */
  async probeMetadata(
    buffer: Buffer,
    filename: string,
  ): Promise<AudioMetadata> {
    // 保留原扩展名，便于 ffprobe 识别封装格式
    const ext = path.extname(filename) || '';
    const tmpFile = path.join(os.tmpdir(), `${randomUUID()}${ext}`);

    try {
      await fs.writeFile(tmpFile, buffer);
      const data = await this.ffprobeFile(tmpFile);

      const durationSec = this.parseDuration(
        data?.format?.duration as number | string | undefined,
      );
      const bitrate = this.parseBitrate(
        (data?.format?.bit_rate ??
          this.pickAudioStream(data)?.bit_rate) as number | string | undefined,
      );

      const tags = data?.format?.tags ?? {};
      const title = this.cleanTag(tags.title);
      const artist = this.cleanTag(tags.artist);
      const album = this.cleanTag(tags.album);

      const result: AudioMetadata = { duration: durationSec };
      if (bitrate != null) result.bitrate = bitrate;
      if (title) result.title = title;
      if (artist) result.artist = artist;
      if (album) result.album = album;
      return result;
    } catch (err) {
      this.logger.warn(
        `解析音频元数据失败：${filename} - ${(err as Error).message}`,
      );
      return { duration: 0 };
    } finally {
      // 务必清理临时文件
      try {
        await fs.unlink(tmpFile);
      } catch {
        // 临时文件可能已不存在，忽略
      }
    }
  }

  /**
   * 将音频 buffer 转码为 128kbps MP3
   * 实现：写临时输入文件（保留原扩展名）→ fluent-ffmpeg 转码到临时输出文件
   *      → 读回输出 buffer → 清理两个临时文件
   * 转码失败时记录警告并抛出异常（与 probeMetadata 不同，让上层处理）
   * @returns buffer 转码后的 MP3 buffer；filename 新的文件名
   *          （原文件名去扩展名 + .mp3；若原已是 mp3 则加 .transcoded.mp3）
   */
  async transcodeToMp3(
    buffer: Buffer,
    filename: string,
  ): Promise<{ buffer: Buffer; filename: string }> {
    // 保留原扩展名，便于 ffmpeg 识别封装格式
    const ext = path.extname(filename) || '';
    const tmpInput = path.join(os.tmpdir(), `${randomUUID()}${ext}`);
    const tmpOutput = path.join(os.tmpdir(), `${randomUUID()}.mp3`);

    try {
      await fs.writeFile(tmpInput, buffer);
      await this.runTranscode(tmpInput, tmpOutput);
      const outputBuffer = await fs.readFile(tmpOutput);

      // 计算新文件名：去扩展名 + .mp3；若原已是 mp3 则加 .transcoded.mp3
      const baseName = path.basename(filename, ext);
      const newFilename =
        ext.toLowerCase() === '.mp3'
          ? `${baseName}.transcoded.mp3`
          : `${baseName}.mp3`;

      return { buffer: outputBuffer, filename: newFilename };
    } catch (err) {
      this.logger.warn(
        `转码音频为 MP3 失败：${filename} - ${(err as Error).message}`,
      );
      throw err;
    } finally {
      // 务必清理两个临时文件
      for (const tmp of [tmpInput, tmpOutput]) {
        try {
          await fs.unlink(tmp);
        } catch {
          // 临时文件可能已不存在，忽略
        }
      }
    }
  }

  /**
   * 按约定解析文件名
   * 约定格式：
   *   - "歌名-演唱者-原唱-日期"
   *   - "歌名-演唱者-日期"
   *   - "歌名-演唱者"
   * 去掉扩展名后按 "-" 分割；末段若命中日期则单独识别；空段跳过
   * 注意：日期段需为单段（即用 "20240102" / "2024/01/02" / "2024" 形式，
   *      因 "-" 已作为字段分隔符使用）
   */
  parseFilename(filename: string): ParsedFilename {
    // 去掉最后一个扩展名
    const base = filename.replace(/\.[^.]+$/, '');
    const rawSegments = base.split('-').map((s) => s.trim());

    // 只有一段（原始文件名不含 "-"）→ 直接作为歌名
    if (rawSegments.length === 1) {
      const seg = rawSegments[0];
      return seg ? { title: seg } : {};
    }

    // 过滤掉空段
    const segments = rawSegments.filter((s) => s.length > 0);

    // 末段若为日期，则剥离出来
    let date: string | undefined;
    const tail = segments[segments.length - 1];
    if (tail && (DATE_FULL_RE.test(tail) || DATE_YEAR_RE.test(tail))) {
      date = tail;
      segments.pop();
    }

    if (segments.length === 0) {
      return date ? { date } : {};
    }
    if (segments.length === 1) {
      return { title: segments[0], ...(date ? { date } : {}) };
    }
    if (segments.length === 2) {
      return {
        title: segments[0],
        artist: segments[1],
        ...(date ? { date } : {}),
      };
    }

    // segments.length >= 3：歌名-演唱者-原唱(-日期)
    const [title, artist, originalArtist] = segments;
    const result: ParsedFilename = { title, artist, originalArtist };
    if (date) result.date = date;
    return result;
  }

  /** 调用 ffprobe 解析指定文件路径 */
  private ffprobeFile(
    file: string,
  ): Promise<ffmpeg.FfprobeData | undefined> {
    return new Promise((resolve, reject) => {
      ffmpeg(file).ffprobe((err, data) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(data);
      });
    });
  }

  /**
   * 调用 ffmpeg 将输入文件转码为 128kbps MP3 输出
   * 链式调用：libmp3lame 编码 + 128k 比特率 + mp3 封装 + 丢弃视频流
   * .output() 指定输出文件后用 .run() 启动转码
   */
  private runTranscode(inputFile: string, outputFile: string): Promise<void> {
    return new Promise((resolve, reject) => {
      ffmpeg(inputFile)
        .output(outputFile)
        .audioCodec('libmp3lame')
        .audioBitrate('128k')
        .format('mp3')
        .noVideo()
        .on('error', (err: Error) => reject(err))
        .on('end', () => resolve())
        .run();
    });
  }

  /** 从 ffprobe 数据中取音频流（优先 codec_type=audio，否则取第一条） */
  private pickAudioStream(
    data?: ffmpeg.FfprobeData,
  ): ffmpeg.FfprobeStream | undefined {
    if (!data?.streams || data.streams.length === 0) return undefined;
    return (
      data.streams.find((s) => s.codec_type === 'audio') ?? data.streams[0]
    );
  }

  /** 解析时长（秒），无法解析或非法时返回 0 */
  private parseDuration(raw: number | string | undefined): number {
    if (raw === undefined || raw === null) return 0;
    const sec = Number(raw);
    if (!Number.isFinite(sec) || sec <= 0) return 0;
    return Math.floor(sec);
  }

  /** 解析比特率（bps），无法解析或非法时返回 undefined */
  private parseBitrate(
    raw: number | string | undefined,
  ): number | undefined {
    if (raw === undefined || raw === null) return undefined;
    const bps = Number(raw);
    if (!Number.isFinite(bps) || bps <= 0) return undefined;
    return Math.floor(bps);
  }

  /** 清理标签字符串：trim 后为空则视为无值 */
  private cleanTag(
    value: string | number | undefined,
  ): string | undefined {
    if (value === undefined || value === null) return undefined;
    const v = String(value).trim();
    return v.length > 0 ? v : undefined;
  }
}
