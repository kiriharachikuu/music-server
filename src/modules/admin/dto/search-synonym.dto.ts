import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/** 管理后台 - 新增搜索同义词 DTO */
export class CreateSearchSynonymDto {
  @IsString()
  @IsNotEmpty({ message: '关键词不能为空' })
  @MaxLength(50, { message: '关键词最长 50 字符' })
  keyword: string;

  @IsString()
  @IsNotEmpty({ message: '同义词不能为空' })
  @MaxLength(50, { message: '同义词最长 50 字符' })
  synonym: string;

  @IsOptional()
  @IsNumber(
    { allowNaN: false, allowInfinity: false, maxDecimalPlaces: 4 },
    { message: '权重必须为有效数字' },
  )
  @Min(0, { message: '权重不能小于 0' })
  @Max(5, { message: '权重不能大于 5' })
  weight?: number;
}

/** 管理后台 - 更新搜索同义词 DTO */
export class UpdateSearchSynonymDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: '关键词不能为空' })
  @MaxLength(50, { message: '关键词最长 50 字符' })
  keyword?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: '同义词不能为空' })
  @MaxLength(50, { message: '同义词最长 50 字符' })
  synonym?: string;

  @IsOptional()
  @IsNumber(
    { allowNaN: false, allowInfinity: false, maxDecimalPlaces: 4 },
    { message: '权重必须为有效数字' },
  )
  @Min(0, { message: '权重不能小于 0' })
  @Max(5, { message: '权重不能大于 5' })
  weight?: number;
}
