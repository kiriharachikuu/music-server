import {
  IsString,
  IsOptional,
  IsNotEmpty,
  IsInt,
  IsEnum,
  IsDateString,
} from 'class-validator';
import { SongStatus } from '@prisma/client';

export class CreateLiveSessionDto {
  @IsString()
  @IsNotEmpty({ message: '场次标题不能为空' })
  title: string;

  @IsString()
  @IsNotEmpty({ message: '歌手/主播名称不能为空' })
  artist: string;

  @IsOptional()
  @IsString()
  cover?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsDateString()
  liveTime: string;

  @IsOptional()
  @IsInt()
  sessionNumber?: number;

  @IsOptional()
  @IsEnum(SongStatus)
  status?: SongStatus;
}

export class UpdateLiveSessionDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  artist?: string;

  @IsOptional()
  @IsString()
  cover?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsDateString()
  liveTime?: string;

  @IsOptional()
  @IsInt()
  sessionNumber?: number;

  @IsOptional()
  @IsEnum(SongStatus)
  status?: SongStatus;
}
