import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/** 创建歌单 DTO */
export class CreatePlaylistDto {
  @IsString()
  @IsNotEmpty({ message: '歌单名称不能为空' })
  @MaxLength(50)
  name: string;

  @IsOptional()
  @IsString()
  cover?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;
}
