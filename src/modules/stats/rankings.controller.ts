import { Controller, Get, Query } from '@nestjs/common';
import { StatsService } from './stats.service';
import type { RankingKind, RankingType } from './ranking.types';

/**
 * 排行榜控制器
 * 路由：
 * - GET /api/rankings?type=combined|single|clip&ranking=soar|hot|new
 *   type 默认 combined；ranking 默认 soar
 *   返回单档榜单的完整结构（含 tracks/title/cover/description/updatedAt）
 * - GET /api/rankings/all?type=single
 *   返回该 type 下 soar/hot/new 三档一并（旧版兼容）
 */
@Controller('rankings')
export class RankingsController {
  constructor(private readonly statsService: StatsService) {}

  /**
   * 9 档排行榜单档查询
   * - type=combined 综合（含 song + clip）
   * - type=single 仅单曲
   * - type=clip 仅歌切
   * - ranking=soar 飙升 / hot 热歌 / new 新歌
   */
  @Get()
  rankings(
    @Query('type') type?: string,
    @Query('ranking') ranking?: string,
  ) {
    const t = this.normalizeType(type);
    const r = this.normalizeRanking(ranking);
    return this.statsService.getRankingsByType(t, r);
  }

  /**
   * 旧版三档合一接口：返回 { soar, new, hot }
   * 保留路径 /rankings/all 以便旧调用方平滑迁移
   */
  @Get('all')
  all(@Query('by') by?: string) {
    return this.statsService.getRankings(
      by === 'favorite' ? 'favorite' : 'play',
    );
  }

  private normalizeType(type?: string): RankingType {
    if (type === 'single' || type === 'clip' || type === 'combined') {
      return type;
    }
    return 'combined';
  }

  private normalizeRanking(ranking?: string): RankingKind {
    if (ranking === 'soar' || ranking === 'hot' || ranking === 'new') {
      return ranking;
    }
    return 'soar';
  }
}
