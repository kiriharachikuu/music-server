import { IsInt, IsString, IsBoolean, IsOptional, Min } from 'class-validator';

export class CreateAppVersionDto {
  @IsInt()
  @Min(1)
  versionCode: number;

  @IsString()
  versionName: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  content?: string;

  @IsString()
  downloadUrl: string;

  @IsInt()
  @Min(0)
  fileSize: number;

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
