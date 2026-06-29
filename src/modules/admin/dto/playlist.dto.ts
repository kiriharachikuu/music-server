import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/** 管理后台 - 新增歌单 DTO（需指定归属用户） */
export class CreatePlaylistDto {
  @IsString()
  @IsNotEmpty({ message: '歌单名称不能为空' })
  name: string;

  @IsString()
  @IsNotEmpty({ message: '归属用户 ID 不能为空' })
  userId: string;

  @IsOptional() @IsString() cover?: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsOptional() @IsBoolean() isPublic?: boolean;
}

/** 管理后台 - 更新歌单 DTO */
export class UpdatePlaylistDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() cover?: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsOptional() @IsBoolean() isPublic?: boolean;
  @IsOptional() @IsBoolean() deletedAt?: boolean;
}
