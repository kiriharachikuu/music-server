import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';

/** 注册请求 DTO */
export class RegisterDto {
  @IsString()
  @IsNotEmpty({ message: '用户名不能为空' })
  username: string;

  @IsEmail({}, { message: '邮箱格式不正确' })
  email: string;

  @IsString()
  @MinLength(6, { message: '密码至少 6 位' })
  password: string;
}
