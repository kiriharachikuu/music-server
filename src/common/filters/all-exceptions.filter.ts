import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';

/**
 * 全局异常过滤器
 * 将所有异常统一包装成 { code, data: null, message } 结构
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);
  private readonly isProd = process.env.NODE_ENV === 'production';

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();

    let code = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = '服务器内部错误';

    if (exception instanceof HttpException) {
      code = exception.getStatus();
      const res = exception.getResponse();
      if (typeof res === 'string') {
        message = res;
      } else if (typeof res === 'object' && res !== null) {
        const r = res as Record<string, unknown>;
        const msg = r.message;
        message = Array.isArray(msg)
          ? msg.join('; ')
          : (msg as string) || exception.message || message;
      }
    } else {
      // 处理 Prisma 常见错误（按错误码鸭子类型判断，避免强依赖生成器产物）
      const err = exception as Record<string, unknown>;
      if (err && typeof err.code === 'string' && (err.code as string).startsWith('P')) {
        switch (err.code) {
          case 'P2002':
            code = HttpStatus.CONFLICT;
            message = '唯一约束冲突，数据已存在';
            break;
          case 'P2025':
            code = HttpStatus.NOT_FOUND;
            message = '记录不存在';
            break;
          default:
            // 生产环境不暴露内部 Prisma 错误码，仅记日志
            code = HttpStatus.INTERNAL_SERVER_ERROR;
            message = this.isProd ? '服务器内部错误' : `数据库错误: ${err.code as string}`;
        }
      } else if (exception instanceof Error) {
        // 生产环境不把内部异常 message 直接返回客户端，避免泄露堆栈/文件路径/SQL 等敏感信息
        message = this.isProd ? '服务器内部错误' : exception.message || message;
      }
    }

    this.logger.error(
      `${request.method} ${request.url} -> ${code} ${message}`,
      exception instanceof Error ? exception.stack : undefined,
    );

    response.status(code).json({
      code,
      data: null,
      message,
    });
  }
}
