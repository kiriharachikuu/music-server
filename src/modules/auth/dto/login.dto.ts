import { IsNotEmpty, IsString } from 'class-validator';

/** 登录请求 DTO，account 可为用户名或邮箱 */
export class LoginDto {
  @IsString()
  @IsNotEmpty({ message: '账号不能为空' })
  account: string;

  @IsString()
  @IsNotEmpty({ message: '密码不能为空' })
  password: string;
}
