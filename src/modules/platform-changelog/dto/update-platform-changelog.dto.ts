import { IsString, IsInt, IsOptional, IsIn, Min, IsISO8601 } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdatePlatformChangelogDto {
  @IsOptional()
  @IsString()
  version?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  versionCode?: number;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsIn(['draft', 'published'])
  status?: string;

  @IsOptional()
  @IsISO8601()
  releaseDate?: string;
}
