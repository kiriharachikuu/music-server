import { Module } from '@nestjs/common';
import { PlaylistController } from './playlist.controller';
import { PlaylistService } from './playlist.service';

/** 歌单模块（公开接口） */
@Module({
  controllers: [PlaylistController],
  providers: [PlaylistService],
})
export class PlaylistModule {}
