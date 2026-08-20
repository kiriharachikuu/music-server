import {
  IsInt,
  IsString,
  IsBoolean,
  IsOptional,
  IsIn,
  Min,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';

export class CreateAppVersionDto {
  @Type(() => Number)
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

  @IsOptional()
  @IsString()
  downloadUrl?: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  fileSize: number;

  @IsOptional()
  @IsString()
  md5?: string;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  forceUpdate?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minVersionCode?: number;

  @IsOptional()
  @IsString()
  channel?: string;

  @IsOptional()
  @IsString()
  platform?: string;

  /** 发布形态：full(APK完整包) / setup(Win安装版) / portable(Win便携版) */
  @IsOptional()
  @IsIn(['full', 'setup', 'portable'])
  variant?: string;

  @IsOptional()
  @IsString()
  status?: string;
}
