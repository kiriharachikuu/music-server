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
  CreateLiveClipDto,
  UpdateLiveClipDto,
} from './dto/live-clip.dto';

/**
 * Admin 直播歌切管理
 * 路由前缀 /api/admin/live-clips
 */
@Controller('admin/live-clips')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'EDITOR')
export class AdminLiveClipController {
  constructor(private readonly liveSessionService: LiveSessionService) {}

  @Get()
  adminList(
    @Query('keyword') keyword?: string,
    @Query('sessionId') sessionId?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.liveSessionService.adminClipsList({
      keyword,
      sessionId,
      status,
      page,
      limit,
      pageSize,
    });
  }

  @Get(':id')
  adminGetOne(@Param('id') id: string) {
    return this.liveSessionService.adminClipFindOne(id);
  }

  @Post()
  adminCreate(@Body() dto: CreateLiveClipDto) {
    return this.liveSessionService.adminClipCreate(dto);
  }

  @Put(':id')
  adminUpdate(@Param('id') id: string, @Body() dto: UpdateLiveClipDto) {
    return this.liveSessionService.adminClipUpdate(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  adminDelete(@Param('id') id: string) {
    return this.liveSessionService.adminClipDelete(id);
  }

  @Post('batch/delete')
  @HttpCode(HttpStatus.OK)
  adminBatchDelete(@Body() dto: { ids: string[] }) {
    return this.liveSessionService.adminClipBatchDelete(dto.ids);
  }

  @Post('batch/status')
  @HttpCode(HttpStatus.OK)
  adminBatchStatus(
    @Body() dto: { ids: string[]; status: 'PUBLISHED' | 'DRAFT' },
  ) {
    return this.liveSessionService.adminClipBatchStatus(dto.ids, dto.status);
  }

  /** GET /api/admin/live-clips/:id/lyric 获取歌词正文 */
  @Get(':id/lyric')
  adminGetLyric(@Param('id') id: string) {
    return this.liveSessionService.adminClipGetLyric(id);
  }

  /** POST /api/admin/live-clips/:id/lyric 设置歌词正文 */
  @Post(':id/lyric')
  @HttpCode(HttpStatus.OK)
  adminSetLyric(@Param('id') id: string, @Body() body: { content: string }) {
    return this.liveSessionService.adminClipSetLyric(id, body.content ?? '');
  }

  /** DELETE /api/admin/live-clips/:id/lyric 删除歌词正文 */
  @Delete(':id/lyric')
  @HttpCode(HttpStatus.OK)
  adminDeleteLyric(@Param('id') id: string) {
    return this.liveSessionService.adminClipDeleteLyric(id);
  }
}
