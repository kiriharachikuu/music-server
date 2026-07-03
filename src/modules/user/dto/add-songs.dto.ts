import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsNotEmpty,
  IsString,
} from 'class-validator';

/** 歌单批量添加歌曲 DTO */
export class AddSongsToPlaylistDto {
  @IsArray()
  @ArrayMinSize(1, { message: '至少选择一首歌曲' })
  // 限制单次最多 100 首，避免 SQLite 参数上限与过大事务
  @ArrayMaxSize(100, { message: '单次最多添加 100 首歌曲' })
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  songIds: string[];
}
