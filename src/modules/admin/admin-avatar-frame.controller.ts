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
import { CreateAvatarFrameDto, UpdateAvatarFrameDto } from './dto/avatar-frame.dto';

/** 后台头像框管理 路由前缀 /api/admin/avatar-frames */
@Controller('admin/avatar-frames')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminAvatarFrameController {
  constructor(private readonly resource: AdminResourceService) {}

  @Get()
  list(@Query() query: { page?: string; limit?: string; pageSize?: string }) {
    return this.resource.listAvatarFrames(query);
  }

  @Post()
  create(@Body() dto: CreateAvatarFrameDto) {
    return this.resource.createAvatarFrame(dto);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateAvatarFrameDto) {
    return this.resource.updateAvatarFrame(id, dto);
  }

  /** PUT /api/admin/avatar-frames/:id/sort 排序（上移/下移） */
  @Put(':id/sort')
  sort(@Param('id') id: string, @Body() dto: { direction: 'up' | 'down' }) {
    return this.resource.sortAvatarFrame(id, dto.direction);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.resource.deleteAvatarFrame(id);
  }
}
