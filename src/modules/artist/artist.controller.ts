import { Controller, Get, Param } from '@nestjs/common';
import { ArtistService } from './artist.service';

@Controller('artists')
export class ArtistController {
  constructor(private readonly artistService: ArtistService) {}

  @Get(':id')
  getDetail(@Param('id') id: string) {
    return this.artistService.getDetail(id);
  }
}