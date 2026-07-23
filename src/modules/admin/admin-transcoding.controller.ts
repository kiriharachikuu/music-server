import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { TranscodingService } from './transcoding.service';

@Controller('admin/transcoding')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminTranscodingController {
  constructor(private readonly transcodingService: TranscodingService) {}

  @Post('start')
  async startTranscoding() {
    const { jobId } = await this.transcodingService.createJob();
    await this.transcodingService.startJob(jobId);
    return { jobId, message: '批量转码任务已启动' };
  }

  @Get('jobs')
  getJobs() {
    return this.transcodingService.getJobs();
  }

  @Get('jobs/:id')
  async getJob(@Param('id') id: string) {
    const job = await this.transcodingService.getJob(id);
    if (!job) {
      return { error: '转码任务不存在' };
    }
    return job;
  }

  @Post('jobs/:id/retry')
  async retryJob(@Param('id') id: string) {
    return this.transcodingService.retryJob(id);
  }
}