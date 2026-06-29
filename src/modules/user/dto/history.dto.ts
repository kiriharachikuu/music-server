import { IsNotEmpty, IsString } from 'class-validator';

/** 上报播放记录 DTO */
export class RecordHistoryDto {
  @IsString()
  @IsNotEmpty({ message: '歌曲 ID 不能为空' })
  songId: string;
}
