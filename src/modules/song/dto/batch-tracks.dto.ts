import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsString,
} from 'class-validator';

/** 批量查询曲目详情 DTO */
export class BatchTracksDto {
  /** 曲目 ID 列表（单曲/歌切混合，上限 100） */
  @IsArray()
  @ArrayNotEmpty({ message: 'ids 不能为空' })
  @ArrayMaxSize(100, { message: '单次最多查询 100 首' })
  @IsString({ each: true })
  ids!: string[];
}
