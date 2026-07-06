import { IsNotEmpty, IsOptional, IsString, ValidateIf } from 'class-validator';

/** 更新用户资料 DTO（昵称 / 头像，均可选） */
export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @ValidateIf((o) => o.username !== undefined && o.username !== '')
  @IsNotEmpty({ message: '昵称不能为空' })
  username?: string;

  @IsOptional()
  @IsString()
  avatar?: string;
}
