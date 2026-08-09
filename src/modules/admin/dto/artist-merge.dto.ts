import {
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  ArrayNotEmpty,
} from 'class-validator';

/** 合并 / 预览 入参 */
export class MergeArtistDto {
  /** 规范歌手名（合并后统一显示，如「雫るる」） */
  @IsString()
  canonicalName: string;

  /** 若规范名已有 Artist 行，可传其 id（不传则按名 find-or-create） */
  @IsOptional()
  @IsString()
  canonicalArtistId?: string;

  /** 要并入的变体名列表（原始写法，可含规范名本身，服务端会剔除） */
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  aliases: string[];

  /** 空壳歌手行处理：hide=隐藏(可恢复，默认) | delete=彻底删除干净空壳 */
  @IsOptional()
  @IsIn(['hide', 'delete'])
  deleteMode?: 'hide' | 'delete';
}

/** 空壳自动清理 执行入参 */
export class AutoCleanDto {
  @IsOptional()
  @IsIn(['hide', 'delete'])
  mode?: 'hide' | 'delete';
}

/** 批量撤销入参 */
export class RevertManyDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  ids: string[];
}

/** 手动新增别名 */
export class AddAliasDto {
  /** 变体写法 */
  @IsString()
  alias: string;

  /** 规范歌手名 */
  @IsString()
  canonicalName: string;

  /** 规范歌手 id（可选，不传按名 find-or-create） */
  @IsOptional()
  @IsString()
  canonicalArtistId?: string;
}
