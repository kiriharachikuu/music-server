import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { parsePagination } from '../../common/utils/pagination.util';

/** 创建操作日志的入参 */
export interface CreateLogInput {
  userId?: string | null;
  username?: string | null;
  action: string;
  resource?: string | null;
  resourceId?: string | null;
  detail?: string | null;
  ip?: string | null;
}

/** 操作日志列表查询参数 */
export interface ListLogsQuery {
  page?: string;
  pageSize?: string;
  limit?: string;
  action?: string;
  userId?: string;
  startDate?: string;
  endDate?: string;
}

/** 操作日志分页返回结构：与前端 PageResult 对齐 */
export interface LogsPageResult<T> {
  list: T[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * 操作日志服务
 * - listLogs：分页查询操作日志，支持按操作类型 / 用户 / 时间范围过滤
 * - createLog：写入一条操作日志（供全局拦截器调用）
 */
@Injectable()
export class OperationLogService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 分页查询操作日志，按 createdAt 倒序
   * 支持 action / userId / startDate / endDate 过滤
   */
  async listLogs(
    query: ListLogsQuery,
  ): Promise<LogsPageResult<unknown>> {
    const { page, limit, skip, take } = parsePagination(query);

    // 构造查询条件
    const where: {
      action?: string;
      userId?: string;
      createdAt?: { gte?: Date; lte?: Date };
    } = {};
    if (query.action) where.action = query.action;
    if (query.userId) where.userId = query.userId;
    // 时间范围过滤（闭区间）
    if (query.startDate || query.endDate) {
      const createdAt: { gte?: Date; lte?: Date } = {};
      if (query.startDate) createdAt.gte = new Date(query.startDate);
      if (query.endDate) createdAt.lte = new Date(query.endDate);
      where.createdAt = createdAt;
    }

    const [list, total] = await this.prisma.$transaction([
      this.prisma.operationLog.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.operationLog.count({ where }),
    ]);

    return {
      list,
      total,
      page,
      pageSize: limit,
    };
  }

  /** 写入一条操作日志 */
  async createLog(data: CreateLogInput) {
    return this.prisma.operationLog.create({
      data: {
        userId: data.userId ?? null,
        username: data.username ?? null,
        action: data.action,
        resource: data.resource ?? null,
        resourceId: data.resourceId ?? null,
        detail: data.detail ?? null,
        ip: data.ip ?? null,
      },
    });
  }
}
