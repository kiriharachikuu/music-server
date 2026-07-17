import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LiveSessionService } from '../live-session/live-session.service';
import {
  CreateLiveSessionDto,
  UpdateLiveSessionDto,
} from './dto/live-session.dto';

/**
 * Admin 直播场次管理
 * 路由前缀 /api/admin/live-sessions
 * 全部需要 ADMIN 角色
 */
@Controller('admin/live-sessions')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminLiveSessionController {
  constructor(private readonly liveSessionService: LiveSessionService) {}

  @Get()
  adminList(
    @Query('keyword') keyword?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.liveSessionService.adminList({
      keyword,
      status,
      page,
      limit,
      pageSize,
    });
  }

  @Get(':id')
  adminGetOne(@Param('id') id: string) {
    return this.liveSessionService.adminFindOne(id);
  }

  @Post()
  adminCreate(@Body() dto: CreateLiveSessionDto) {
    return this.liveSessionService.adminCreate(dto);
  }

  @Put(':id')
  adminUpdate(@Param('id') id: string, @Body() dto: UpdateLiveSessionDto) {
    return this.liveSessionService.adminUpdate(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  adminDelete(@Param('id') id: string) {
    return this.liveSessionService.adminDelete(id);
  }

  @Post('batch/delete')
  @HttpCode(HttpStatus.OK)
  adminBatchDelete(@Body() dto: { ids: string[] }) {
    return this.liveSessionService.adminBatchDelete(dto.ids);
  }

  @Post('batch/status')
  @HttpCode(HttpStatus.OK)
  adminBatchStatus(@Body() dto: { ids: string[]; status: 'PUBLISHED' | 'DRAFT' }) {
    return this.liveSessionService.adminBatchStatus(dto.ids, dto.status);
  }
}
