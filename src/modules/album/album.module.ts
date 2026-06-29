import { Module } from '@nestjs/common';
import { AlbumController } from './album.controller';
import { AlbumService } from './album.service';

/** 专辑模块 */
@Module({
  controllers: [AlbumController],
  providers: [AlbumService],
})
export class AlbumModule {}
