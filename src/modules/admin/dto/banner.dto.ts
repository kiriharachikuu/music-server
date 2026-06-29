import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { BannerStatus } from '@prisma/client';

/** 管理后台 - 新增 Banner DTO */
export class CreateBannerDto {
  @IsString()
  @IsNotEmpty({ message: '标题不能为空' })
  title: string;

  @IsString()
  @IsNotEmpty({ message: '图片地址不能为空' })
  imageUrl: string;

  @IsOptional()
  @IsString()
  linkUrl?: string;

  @IsOptional()
  @IsInt()
  sort?: number;

  @IsOptional()
  @IsEnum(BannerStatus)
  status?: BannerStatus;
}

/** 管理后台 - 更新 Banner DTO */
export class UpdateBannerDto {
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() imageUrl?: string;
  @IsOptional() @IsString() linkUrl?: string;
  @IsOptional() @IsInt() sort?: number;
  @IsOptional() @IsEnum(BannerStatus) status?: BannerStatus;
}
