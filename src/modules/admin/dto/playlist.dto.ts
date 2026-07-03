import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/** 管理后台 - 新增歌单 DTO */
export class CreatePlaylistDto {
  @IsString()
  @IsNotEmpty({ message: '歌单名称不能为空' })
  name: string;

  @IsOptional() @IsString() userId?: string;

  @IsOptional() @IsString() cover?: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsOptional() @IsBoolean() isPublic?: boolean;
  /** 系统歌单标记：官方运营歌单 */
  @IsOptional() @IsBoolean() isSystem?: boolean;
}

/** 管理后台 - 更新歌单 DTO */
export class UpdatePlaylistDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() cover?: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsOptional() @IsBoolean() isPublic?: boolean;
  @IsOptional() @IsBoolean() isSystem?: boolean;
  @IsOptional() @IsBoolean() deletedAt?: boolean;
}

/**
 * 批量更新歌单歌曲 DTO（覆盖式：传入的 songIds 完全替换原列表）
 * - 允许空数组（清空歌单）
 * - 限制最多 200 首，避免 SQLite 参数上限与过大事务
 */
export class UpdatePlaylistSongsDto {
  @IsArray()
  @ArrayMaxSize(200, { message: '单次最多 200 首歌曲' })
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  songIds: string[];
}
