import { Controller, Get, Param } from '@nestjs/common';
import { SongService } from './song.service';

/**
 * 歌曲控制器
 * 路由前缀 /api/songs
 */
@Controller('songs')
export class SongController {
  constructor(private readonly songService: SongService) {}

  /** GET /api/songs/:id 歌曲详情 */
  @Get(':id')
  getDetail(@Param('id') id: string) {
    return this.songService.getDetail(id);
  }

  /** GET /api/songs/:id/lyric 歌词（LRC 文本） */
  @Get(':id/lyric')
  async getLyric(@Param('id') id: string) {
    return { content: await this.songService.getLyric(id) };
  }
}
