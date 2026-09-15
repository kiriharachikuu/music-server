import { Module } from '@nestjs/common';
import { AvatarFrameController } from './avatar-frame.controller';
import { AvatarFrameService } from './avatar-frame.service';

/** 头像框模块 */
@Module({
  controllers: [AvatarFrameController],
  providers: [AvatarFrameService],
})
export class AvatarFrameModule {}
