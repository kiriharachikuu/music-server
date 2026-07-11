import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Request } from 'express';
import { Observable, tap } from 'rxjs';
import { OperationLogService } from './operation-log.service';

/** 请求中挂载的用户信息（由 JwtStrategy 注入到 req.user） */
interface RequestUser {
  id: string;
  username: string;
  role: string;
}

/** HTTP 方法 → 操作类型 映射，仅记录写操作 */
const ACTION_MAP: Record<string, string> = {
  POST: 'CREATE',
  PUT: 'UPDATE',
  DELETE: 'DELETE',
};

/** 路径段 → 资源类型 映射（统一为单数形式，便于检索聚合） */
const RESOURCE_MAP: Record<string, string> = {
  songs: 'song',
  albums: 'album',
  artists: 'artist',
  playlists: 'playlist',
  banners: 'banner',
  users: 'user',
  'app-versions': 'app-version',
  settings: 'settings',
  tags: 'tag',
  upload: 'upload',
};

/**
 * 操作日志拦截器
 * 拦截所有 /api/admin/ 开头且方法为 POST/PUT/DELETE 的请求，
 * 在响应成功（状态码 2xx）后异步记录一条操作日志，不阻塞主流程。
 *
 * 说明：
 * - 仅在响应成功时记录；若控制器抛异常，tap 的成功回调不会触发
 * - 日志写入采用 fire-and-forget，失败仅打印错误日志，不影响业务响应
 */
@Injectable()
export class OperationLogInterceptor implements NestInterceptor {
  private readonly logger = new Logger(OperationLogInterceptor.name);

  constructor(private readonly operationLogService: OperationLogService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const method = request.method;
    const path = request.path || request.url || '';

    // 仅拦截 admin 写操作（POST/PUT/DELETE）
    const action = ACTION_MAP[method];
    if (!action || !path.includes('/admin/')) {
      return next.handle();
    }

    const response = context.switchToHttp().getResponse();

    return next.handle().pipe(
      tap(() => {
        // 仅在响应成功（2xx）时记录
        const statusCode = response.statusCode;
        if (statusCode < 200 || statusCode >= 300) return;
        // 异步记录，不阻塞响应返回
        void this.recordLog(request, action).catch((err: unknown) => {
          this.logger.error(
            `记录操作日志失败：${err instanceof Error ? err.message : String(err)}`,
          );
        });
      }),
    );
  }

  /** 解析请求信息并写入一条操作日志 */
  private async recordLog(request: Request, action: string) {
    const user = (request.user ?? {}) as Partial<RequestUser>;
    const path = request.path || request.url || '';
    // 拆分路径段：形如 /api/admin/songs/:id 或 /admin/songs/:id
    const segments = path.split('/').filter(Boolean);
    const adminIndex = segments.findIndex((s) => s === 'admin');
    // 资源段：admin 之后的第一个段
    const resourceSegment =
      adminIndex >= 0 ? segments[adminIndex + 1] : undefined;
    const resource = resourceSegment
      ? RESOURCE_MAP[resourceSegment] ?? resourceSegment
      : null;
    // 资源 ID：资源段之后的第一个段（如 /admin/songs/:id 中的 :id）
    const idSegment = adminIndex >= 0 ? segments[adminIndex + 2] : undefined;
    const resourceId = idSegment || null;

    await this.operationLogService.createLog({
      userId: user.id ?? null,
      username: user.username ?? null,
      action,
      resource: resource ?? null,
      resourceId: resourceId ?? null,
      detail: `${request.method} ${path}`,
      ip: request.ip ?? null,
    });
  }
}
