import { IsInt, IsString, IsBoolean, IsOptional, Min } from 'class-validator';

export class UpdateAppVersionDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  versionCode?: number;

  @IsOptional()
  @IsString()
  versionName?: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsString()
  downloadUrl?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  fileSize?: number;

  @IsOptional()
  @IsString()
  md5?: string;

  @IsOptional()
  @IsBoolean()
  forceUpdate?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  minVersionCode?: number;

  @IsOptional()
  @IsString()
  channel?: string;

  @IsOptional()
  @IsString()
  platform?: string;

  @IsOptional()
  @IsString()
  status?: string;
}
