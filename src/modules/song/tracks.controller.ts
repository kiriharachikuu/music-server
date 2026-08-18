import { Body, Controller, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { BatchTracksDto } from './dto/batch-tracks.dto';
import { SongService } from './song.service';

/**
 * 曲目控制器（单曲 + 歌切统一入口）
 * 路由前缀 /api/tracks
 */
@Controller('tracks')
export class TracksController {
  constructor(private readonly songService: SongService) {}

  /**
   * POST /api/tracks/batch 批量查询曲目详情
   * Body: { ids: string[] }（上限 100，单曲/歌切 ID 可混传）
   * 返回: { tracks: [...] }（按传入顺序，统一基础字段）
   * 限制：60 秒最多 30 次
   */
  @Post('batch')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  batch(@Body() dto: BatchTracksDto) {
    return this.songService.batchGetTracks(dto.ids).then((tracks) => ({
      tracks,
    }));
  }
}
