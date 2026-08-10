import {
  IsString,
  IsOptional,
  IsNotEmpty,
  IsInt,
  IsEnum,
  IsArray,
  ArrayMaxSize,
} from 'class-validator';
import { SongStatus } from '@prisma/client';

export class CreateLiveClipDto {
  @IsString()
  @IsNotEmpty({ message: '歌曲标题不能为空' })
  title: string;

  @IsOptional()
  @IsString()
  artist?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10, { message: '关联艺人数量不能超过 10 个' })
  @IsString({ each: true })
  artistIds?: string[];

  @IsString()
  @IsNotEmpty({ message: '所属场次不能为空' })
  sessionId: string;

  @IsInt()
  trackIndex: number;

  @IsInt()
  duration: number;

  @IsString()
  @IsNotEmpty({ message: '音频文件地址不能为空' })
  fileUrl: string;

  @IsOptional()
  @IsString()
  coverUrl?: string;

  @IsOptional()
  @IsString()
  lyricContent?: string;

  @IsOptional()
  @IsEnum(SongStatus)
  status?: SongStatus;
}

export class UpdateLiveClipDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  artist?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10, { message: '关联艺人数量不能超过 10 个' })
  @IsString({ each: true })
  artistIds?: string[];

  @IsOptional()
  @IsString()
  sessionId?: string;

  @IsOptional()
  @IsInt()
  trackIndex?: number;

  @IsOptional()
  @IsInt()
  duration?: number;

  @IsOptional()
  @IsString()
  fileUrl?: string;

  @IsOptional()
  @IsString()
  coverUrl?: string;

  @IsOptional()
  @IsString()
  lyricContent?: string;

  @IsOptional()
  @IsEnum(SongStatus)
  status?: SongStatus;
}
