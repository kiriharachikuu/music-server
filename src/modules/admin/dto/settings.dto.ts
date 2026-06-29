import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsNotEmpty,
  IsString,
  ValidateNested,
} from 'class-validator';

/** 单条系统设置项 */
export class SettingItemDto {
  @IsString()
  @IsNotEmpty({ message: '设置 key 不能为空' })
  key: string;

  @IsString()
  value: string;
}

/** 管理后台 - 批量更新系统设置 DTO */
export class UpdateSettingsDto {
  @IsArray()
  @ArrayMinSize(1, { message: '至少提交一项设置' })
  @ValidateNested({ each: true })
  @Type(() => SettingItemDto)
  settings: SettingItemDto[];
}
