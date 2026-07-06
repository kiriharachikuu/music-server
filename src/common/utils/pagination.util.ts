/** 分页参数解析工具 */

export interface PaginationParams {
  page: number;
  limit: number;
  skip: number;
  take: number;
}

/**
 * 从查询参数中解析分页信息，默认 page=1, limit=20，最大 100
 * 兼容 limit / pageSize 两种查询参数名（limit 优先）
 */
export function parsePagination(query: {
  page?: string;
  pageSize?: string;
  limit?: string;
}): PaginationParams {
  const page = Math.max(1, parseInt(query.page ?? '1', 10) || 1);
  const rawLimit = query.limit ?? query.pageSize ?? '20';
  const limit = Math.min(100, Math.max(1, parseInt(rawLimit, 10) || 20));
  return {
    page,
    limit,
    skip: (page - 1) * limit,
    take: limit,
  };
}

export interface PaginatedResult<T> {
  list: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasMore: boolean;
}

/** 构造分页返回结果 */
export function buildPaginatedResult<T>(
  list: T[],
  total: number,
  page: number,
  limit: number,
): PaginatedResult<T> {
  const totalPages = limit > 0 ? Math.ceil(total / limit) || 0 : 0;
  return {
    list,
    total,
    page,
    limit,
    totalPages,
    hasMore: page < totalPages,
  };
}
