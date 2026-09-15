import { Controller, Get } from '@nestjs/common';
import { AvatarFrameService } from './avatar-frame.service';

/**
 * 头像框控制器
 * 路由前缀 /api/avatar-frames
 */
@Controller('avatar-frames')
export class AvatarFrameController {
  constructor(private readonly avatarFrameService: AvatarFrameService) {}

  /** GET /api/avatar-frames 可选头像框列表 */
  @Get()
  list() {
    return this.avatarFrameService.getVisibleFrames();
  }
}
