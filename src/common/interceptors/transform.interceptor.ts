import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, map } from 'rxjs';

/** 统一响应结构 */
export interface ApiResponse<T> {
  code: number;
  data: T;
  message: string;
}

/**
 * 统一响应拦截器
 * 将控制器返回值包装成 { code, data, message: 'success' }
 */
@Injectable()
export class TransformInterceptor<T>
  implements NestInterceptor<T, ApiResponse<T>>
{
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<ApiResponse<T>> {
    const statusCode = context.switchToHttp().getResponse().statusCode;
    return next.handle().pipe(
      map((data) => ({
        code: statusCode,
        data,
        message: 'success',
      })),
    );
  }
}
