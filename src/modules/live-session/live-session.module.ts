import { Module } from '@nestjs/common';
import { LiveSessionController } from './live-session.controller';
import { LiveSessionService } from './live-session.service';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [LiveSessionController],
  providers: [LiveSessionService],
  exports: [LiveSessionService],
})
export class LiveSessionModule {}
