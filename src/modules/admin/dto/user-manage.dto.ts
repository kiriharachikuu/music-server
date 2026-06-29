import { IsBoolean, IsEnum } from 'class-validator';
import { Role } from '@prisma/client';

/** 管理后台 - 设置用户角色 DTO */
export class UpdateUserRoleDto {
  @IsEnum(Role)
  role: Role;
}

/** 管理后台 - 启用/禁用用户 DTO */
export class UpdateUserStatusDto {
  @IsBoolean()
  disabled: boolean;
}
