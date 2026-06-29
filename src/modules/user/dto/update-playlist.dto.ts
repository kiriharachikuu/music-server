import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

/** 更新歌单 DTO */
export class UpdatePlaylistDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  name?: string;

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
