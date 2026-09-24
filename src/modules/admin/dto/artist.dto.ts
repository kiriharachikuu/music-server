import { IsString, IsOptional, IsArray, IsBoolean } from 'class-validator';

export class CreateArtistDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  avatar?: string;

  @IsOptional()
  @IsString()
  bio?: string;

  @IsOptional()
  @IsString()
  representativeWorks?: string;

  /** 是否拥有公开主页, 默认 true; 建虚拟歌手时传 false */
  @IsOptional()
  @IsBoolean()
  hasHomepage?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  songIds?: string[];
}

export class UpdateArtistDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  avatar?: string;

  @IsOptional()
  @IsString()
  bio?: string;

  @IsOptional()
  @IsString()
  representativeWorks?: string;

  /** 虚拟歌手转正 (false→true) 后即出现在公开列表并拥有主页 */
  @IsOptional()
  @IsBoolean()
  hasHomepage?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  songIds?: string[];
}