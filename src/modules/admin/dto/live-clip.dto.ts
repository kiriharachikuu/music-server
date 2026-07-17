import {
  IsString,
  IsOptional,
  IsNotEmpty,
  IsInt,
  IsEnum,
} from 'class-validator';
import { SongStatus } from '@prisma/client';

export class CreateLiveClipDto {
  @IsString()
  @IsNotEmpty({ message: '歌曲标题不能为空' })
  title: string;

  @IsString()
  @IsNotEmpty({ message: '歌手名称不能为空' })
  artist: string;

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
