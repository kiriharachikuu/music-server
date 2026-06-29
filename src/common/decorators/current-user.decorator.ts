import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * 当前登录用户装饰器
 * @example
 *   getProfile(@CurrentUser() user) {}
 *   getProfile(@CurrentUser('id') userId: string) {}
 */
export const CurrentUser = createParamDecorator(
  (data: string | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user;
    return data ? user?.[data] : user;
  },
);
