import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { AdminResourceService } from './admin-resource.service';
import { CreateArtistDto, UpdateArtistDto } from './dto/artist.dto';

@Controller('admin/artists')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminArtistController {
  constructor(private readonly resource: AdminResourceService) {}

  @Get()
  list(
    @Query('keyword') keyword?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.resource.listArtists({ keyword, page, limit, pageSize });
  }

  @Post()
  create(@Body() dto: CreateArtistDto) {
    return this.resource.createArtist(dto);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateArtistDto) {
    return this.resource.updateArtist(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.resource.deleteArtist(id);
  }

  @Get(':id')
  detail(@Param('id') id: string) {
    return this.resource.getArtistDetail(id);
  }
}