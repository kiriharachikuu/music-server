import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';
import { BannerStatus } from '@prisma/client';

/**
 * 链接 URL 安全校验正则
 * - 允许空字符串（清空场景）
 * - 内部路由：以 / 开头且不以 // 开头（避免协议相对 URL //evil.com）
 * - 外链：仅允许 http/https 协议，禁止 javascript:/data:/vbscript: 等危险 scheme
 */
const LINK_URL_PATTERN =
  /^$|^\/[^\/].*|^https?:\/\/.+/i;

/** 广告外链必须为 http/https，禁止其他 scheme */
const AD_URL_PATTERN = /^$|^https?:\/\/.+/i;

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
  @Matches(LINK_URL_PATTERN, {
    message: '链接必须以 / 开头（内部路由）或为 http/https 协议',
  })
  linkUrl?: string;

  /** 关联歌曲 ID：点击优先播放（清空传空字符串） */
  @IsOptional()
  @IsString()
  songId?: string;

  /** 广告外链：点击打开新窗口 */
  @IsOptional()
  @IsString()
  @Matches(AD_URL_PATTERN, {
    message: '广告外链必须为 http/https 协议',
  })
  adUrl?: string;

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
  @IsOptional()
  @IsString()
  @Matches(LINK_URL_PATTERN, {
    message: '链接必须以 / 开头（内部路由）或为 http/https 协议',
  })
  linkUrl?: string;
  @IsOptional() @IsString() songId?: string;
  @IsOptional()
  @IsString()
  @Matches(AD_URL_PATTERN, {
    message: '广告外链必须为 http/https 协议',
  })
  adUrl?: string;
  @IsOptional() @IsInt() sort?: number;
  @IsOptional() @IsEnum(BannerStatus) status?: BannerStatus;
}
