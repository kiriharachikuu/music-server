import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateSearchSynonymDto,
  UpdateSearchSynonymDto,
} from './dto/search-synonym.dto';

/**
 * 后台搜索同义词管理
 * 路由前缀 /api/admin/search-synonyms
 *
 * - 列表查询允许 EDITOR（运营人员可读，便于排查）
 * - 写操作仅允许 ADMIN
 */
@Controller('admin/search-synonyms')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SearchSynonymController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 查询同义词列表
   * - 支持按 keyword 模糊匹配（contains）
   * - 列表规模较小，直接返回数组，不做分页
   */
  @Get()
  @Roles('ADMIN', 'EDITOR')
  list(@Query('keyword') keyword?: string) {
    const where: Prisma.SearchSynonymWhereInput | undefined = keyword
      ? { keyword: { contains: keyword } }
      : undefined;
    return this.prisma.searchSynonym.findMany({
      where,
      orderBy: [{ keyword: 'asc' }, { synonym: 'asc' }],
    });
  }

  /** 新增同义词 */
  @Post()
  @Roles('ADMIN')
  create(@Body() dto: CreateSearchSynonymDto) {
    return this.prisma.searchSynonym.create({
      data: {
        keyword: dto.keyword.trim(),
        synonym: dto.synonym.trim(),
        weight: dto.weight ?? 1.0,
      },
    });
  }

  /** 更新同义词 */
  @Put(':id')
  @Roles('ADMIN')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateSearchSynonymDto,
  ) {
    const data: Prisma.SearchSynonymUpdateInput = {};
    if (dto.keyword !== undefined) data.keyword = dto.keyword.trim();
    if (dto.synonym !== undefined) data.synonym = dto.synonym.trim();
    if (dto.weight !== undefined) data.weight = dto.weight;
    return this.prisma.searchSynonym.update({
      where: { id },
      data,
    });
  }

  /** 删除同义词 */
  @Delete(':id')
  @Roles('ADMIN')
  async remove(@Param('id') id: string) {
    await this.prisma.searchSynonym.delete({ where: { id } });
    return { ok: true };
  }
}
