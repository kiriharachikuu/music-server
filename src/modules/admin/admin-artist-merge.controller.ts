import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { ArtistMergeService } from './artist-merge.service';
import { MergeArtistDto, AddAliasDto } from './dto/artist-merge.dto';

/**
 * 歌手合并管理
 * 路由前缀 /api/admin/artist-merge
 * 与 /api/admin/artists（歌手 CRUD）分开，避免 :id 路由冲突
 */
@Controller('admin/artist-merge')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'EDITOR')
export class AdminArtistMergeController {
  constructor(private readonly service: ArtistMergeService) {}

  /** 自动扫描建议：疑似同一歌手的候选分组 */
  @Get('scan')
  scan() {
    return this.service.scan();
  }

  /** 现有歌手下拉候选（按与 q 的匹配度排序，供规范名输入框） */
  @Get('artists')
  suggestArtists(@Query('q') q?: string, @Query('limit') limit?: string) {
    return this.service.suggestArtists(q, limit ? parseInt(limit, 10) : 20);
  }

  /** 试跑：预览合并将产生的改动，不写库 */
  @Post('preview')
  @HttpCode(HttpStatus.OK)
  preview(@Body() dto: MergeArtistDto) {
    return this.service.preview(dto);
  }

  /** 执行合并 */
  @Post()
  @HttpCode(HttpStatus.OK)
  merge(
    @Body() dto: MergeArtistDto,
    @CurrentUser() user?: { id?: string; username?: string },
  ) {
    return this.service.merge(dto, user);
  }

  /** 合并历史 */
  @Get('logs')
  logs(@Query('page') page?: string, @Query('limit') limit?: string) {
    return this.service.listLogs({ page, limit });
  }

  /** 撤销一次合并 */
  @Post('logs/:id/revert')
  @HttpCode(HttpStatus.OK)
  revert(@Param('id') id: string) {
    return this.service.revert(id);
  }

  /** 别名列表 */
  @Get('aliases')
  aliases(@Query('keyword') keyword?: string) {
    return this.service.listAliases({ keyword });
  }

  /** 手动新增别名 */
  @Post('aliases')
  @HttpCode(HttpStatus.OK)
  addAlias(@Body() dto: AddAliasDto) {
    return this.service.addAlias(dto);
  }

  /** 删除别名 */
  @Delete('aliases/:id')
  @HttpCode(HttpStatus.OK)
  deleteAlias(@Param('id') id: string) {
    return this.service.deleteAlias(id);
  }
}
