import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AvatarFrameService {
  constructor(private readonly prisma: PrismaService) {}

  /** 获取可选头像框：仅可见项，按 sort 升序 */
  async getVisibleFrames() {
    return this.prisma.avatarFrame.findMany({
      where: { status: 'VISIBLE' },
      orderBy: { sort: 'asc' },
    });
  }
}
