import { IsNotEmpty, IsString, MinLength } from 'class-validator';

/** 修改密码请求 DTO */
export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty({ message: '当前密码不能为空' })
  currentPassword: string;

  @IsString()
  @IsNotEmpty({ message: '新密码不能为空' })
  @MinLength(6, { message: '新密码至少 6 位' })
  newPassword: string;

  @IsString()
  @IsNotEmpty({ message: '请再次输入新密码' })
  confirmPassword: string;
}
