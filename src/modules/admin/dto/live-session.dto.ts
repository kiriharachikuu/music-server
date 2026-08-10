import {
  IsString,
  IsOptional,
  IsNotEmpty,
  IsInt,
  IsEnum,
  IsDateString,
  IsArray,
  ArrayMaxSize,
} from 'class-validator';
import { SongStatus } from '@prisma/client';

export class CreateLiveSessionDto {
  @IsString()
  @IsNotEmpty({ message: '场次标题不能为空' })
  title: string;

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
  @IsArray()
  @ArrayMaxSize(10, { message: '关联艺人数量不能超过 10 个' })
  @IsString({ each: true })
  artistIds?: string[];

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
