import {
  IsString,
  IsInt,
  IsOptional,
  IsIn,
  Min,
  IsISO8601,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreatePlatformChangelogDto {
  @IsString()
  version!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  versionCode!: number;

  @IsOptional()
  @IsString()
  title?: string;

  /** JSON 字符串数组 */
  @IsString()
  content!: string;

  @IsOptional()
  @IsIn(['draft', 'published'])
  status?: string;

  @IsOptional()
  @IsISO8601()
  releaseDate?: string;
}
