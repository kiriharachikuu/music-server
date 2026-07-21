import {
  ArrayMaxSize,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

/** 歌单批量添加歌曲/歌切 DTO */
export class AddSongsToPlaylistDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100, { message: '单次最多添加 100 首' })
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  songIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100, { message: '单次最多添加 100 个歌切' })
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  clipIds?: string[];
}
