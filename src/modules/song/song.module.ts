import { Module } from '@nestjs/common';
import { DownloadController } from './download.controller';
import { SongController } from './song.controller';
import { SongService } from './song.service';

/** 歌曲模块 */
@Module({
  controllers: [SongController, DownloadController],
  providers: [SongService],
  exports: [SongService],
})
export class SongModule {}
