import { ArrayMinSize, IsArray, IsNotEmpty, IsString } from 'class-validator';

/** 歌单批量添加歌曲 DTO */
export class AddSongsToPlaylistDto {
  @IsArray()
  @ArrayMinSize(1, { message: '至少选择一首歌曲' })
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  songIds: string[];
}
