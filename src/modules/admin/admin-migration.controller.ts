import {
  Body,
  Controller,
  Get,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { MigrationService } from './migration.service';

@Controller('admin/migration')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminMigrationController {
  constructor(private readonly migrationService: MigrationService) {}

  @Get('status')
  status() {
    return this.migrationService.getProgress();
  }

  @Post('start')
  start() {
    return this.migrationService.start();
  }

  @Post('cancel')
  cancel() {
    this.migrationService.cancel();
    return { message: '取消请求已发送' };
  }
}
