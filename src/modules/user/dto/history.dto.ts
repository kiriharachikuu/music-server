import { IsOptional, IsString } from 'class-validator';

/**
 * 上报播放记录 DTO
 * - songId 与 clipId 至少二选一
 * - 同时传入时以 songId 优先（兼容旧调用方）
 */
export class RecordHistoryDto {
  @IsOptional()
  @IsString()
  songId?: string;

  @IsOptional()
  @IsString()
  clipId?: string;
}
