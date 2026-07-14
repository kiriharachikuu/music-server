import { IsString, IsOptional, IsArray, IsNumber } from 'class-validator';

export class CreateArtistDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  avatar?: string;

  @IsOptional()
  @IsString()
  bio?: string;

  @IsOptional()
  @IsString()
  representativeWorks?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  songIds?: string[];
}

export class UpdateArtistDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  avatar?: string;

  @IsOptional()
  @IsString()
  bio?: string;

  @IsOptional()
  @IsString()
  representativeWorks?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  songIds?: string[];
}