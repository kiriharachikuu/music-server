import { IsNotEmpty, IsString } from 'class-validator';

/** 收藏切换 DTO */
export class FavoriteDto {
  @IsString()
  @IsNotEmpty({ message: '歌曲 ID 不能为空' })
  songId: string;
}
