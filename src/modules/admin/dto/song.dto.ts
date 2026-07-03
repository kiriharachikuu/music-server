import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { SongStatus } from '@prisma/client';

/** 管理后台 - 新增歌曲 DTO */
export class CreateSongDto {
  @IsString()
  @IsNotEmpty({ message: '歌曲标题不能为空' })
  title: string;

  @IsString()
  @IsNotEmpty({ message: '歌手不能为空' })
  artist: string;

  @IsOptional()
  @IsString()
  albumId?: string;

  @IsInt({ message: '时长必须为整数' })
  duration: number;

  @IsString()
  @IsNotEmpty({ message: '文件地址不能为空' })
  fileUrl: string;

  @IsOptional()
  @IsString()
  coverUrl?: string;

  @IsOptional()
  @IsString()
  lyricUrl?: string;

  @IsOptional()
  @IsString()
  lyricContent?: string;

  @IsDateString({}, { message: '发行时间格式不正确' })
  releaseDate: string;

  @IsOptional()
  @IsEnum(SongStatus)
  status?: SongStatus;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50, { message: '标签最多 50 个' })
  @IsString({ each: true })
  tagIds?: string[];
}

/** 管理后台 - 更新歌曲 DTO（全部可选） */
export class UpdateSongDto {
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() artist?: string;
  @IsOptional() @IsString() albumId?: string | null;
  @IsOptional() @IsInt() duration?: number;
  @IsOptional() @IsString() fileUrl?: string;
  @IsOptional() @IsString() coverUrl?: string;
  @IsOptional() @IsString() lyricUrl?: string;
  @IsOptional() @IsString() lyricContent?: string | null;
  @IsOptional() @IsDateString() releaseDate?: string;
  @IsOptional() @IsEnum(SongStatus) status?: SongStatus;
  @IsOptional() @IsArray() @IsString({ each: true }) tagIds?: string[];
}
