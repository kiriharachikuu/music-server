import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

/** 更新用户资料 DTO（昵称 / 头像，均可选） */
export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: '昵称不能为空' })
  username?: string;

  @IsOptional()
  @IsString()
  avatar?: string;
}
