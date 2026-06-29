import { SetMetadata } from '@nestjs/common';

/** 角色元数据的 key */
export const ROLES_KEY = 'roles';

/**
 * 角色装饰器，标注接口所需的用户角色
 * @example
 *   @Roles('ADMIN')
 *   @UseGuards(JwtAuthGuard, RolesGuard)
 */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
