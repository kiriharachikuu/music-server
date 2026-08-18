import { Controller, Get, Query } from '@nestjs/common';
import { StatsService } from './stats.service';
import type { RankingKind } from './ranking.types';

/**
 * 排行榜控制器
 * 路由：
 * - GET /api/rankings?ranking=soar|hot|new
 *   ranking 默认 soar
 *   返回单档综合榜单的完整结构（含 tracks/title/cover/description/updatedAt）
 *
 * 旧版 type 参数已废弃（保留 type 查询参数仅为向后兼容，取值被忽略）。
 * 旧版 GET /api/rankings/all 端点已删除。
 */
@Controller('rankings')
export class RankingsController {
  constructor(private readonly statsService: StatsService) {}

  /**
   * 3 档综合榜单单档查询
   * - ranking=soar 综合-飙升榜
   * - ranking=hot 综合-热歌榜
   * - ranking=new 综合-新歌榜
   * - limit/offset 可选分页（不传则返回全量，向后兼容）
   *
   * 注：旧版 type=combined|single|clip 参数被忽略，仅保留 3 档综合榜单。
   */
  @Get()
  rankings(
    @Query('type') _type?: string,
    @Query('ranking') ranking?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    if (!ranking) {
      return this.statsService.getLegacyRankings();
    }
    const r = this.normalizeRanking(ranking);
    const parsedLimit = limit ? parseInt(limit, 10) : undefined;
    const parsedOffset = offset ? parseInt(offset, 10) : undefined;
    return this.statsService.getRanking(r, {
      limit: Number.isFinite(parsedLimit) ? parsedLimit : undefined,
      offset: Number.isFinite(parsedOffset) ? parsedOffset : undefined,
    });
  }

  private normalizeRanking(ranking?: string): RankingKind {
    if (ranking === 'soar' || ranking === 'hot' || ranking === 'new') {
      return ranking;
    }
    return 'soar';
  }
}
