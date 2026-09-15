import { IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';
import { AvatarFrameStatus } from '@prisma/client';

/**
 * 图片 URL 校验：内部路径（以 / 开头且不以 // 开头）或 http/https 外链
 */
const IMAGE_URL_PATTERN = /^\/[^\/].*|^https?:\/\/.+/i;

/** 管理后台 - 新增头像框 DTO */
export class CreateAvatarFrameDto {
  @IsString()
  @IsNotEmpty({ message: '名称不能为空' })
  name: string;

  @IsString()
  @IsNotEmpty({ message: '图片地址不能为空' })
  @Matches(IMAGE_URL_PATTERN, {
    message: '图片地址必须以 / 开头（内部路径）或为 http/https 协议',
  })
  imageUrl: string;

  @IsOptional()
  @IsInt()
  sort?: number;

  @IsOptional()
  @IsEnum(AvatarFrameStatus)
  status?: AvatarFrameStatus;
}

/** 管理后台 - 更新头像框 DTO */
export class UpdateAvatarFrameDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional()
  @IsString()
  @Matches(IMAGE_URL_PATTERN, {
    message: '图片地址必须以 / 开头（内部路径）或为 http/https 协议',
  })
  imageUrl?: string;
  @IsOptional() @IsInt() sort?: number;
  @IsOptional() @IsEnum(AvatarFrameStatus) status?: AvatarFrameStatus;
}
