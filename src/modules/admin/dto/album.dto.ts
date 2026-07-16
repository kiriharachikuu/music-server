import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/** 管理后台 - 新增专辑 DTO */
export class CreateAlbumDto {
  @IsString()
  @IsNotEmpty({ message: '专辑名称不能为空' })
  name: string;

  @IsOptional()
  @IsString()
  artist?: string;

  @IsOptional()
  @IsString()
  cover?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsDateString({}, { message: '发行时间格式不正确' })
  releaseDate: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10, { message: '歌手最多 10 个' })
  @IsString({ each: true })
  artistIds?: string[];
}

/** 管理后台 - 更新专辑 DTO */
export class UpdateAlbumDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() artist?: string;
  @IsOptional() @IsString() cover?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsDateString() releaseDate?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) artistIds?: string[];
}
