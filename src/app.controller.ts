import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  // 健康检查接口：GET /api/health
  @Get('health')
  getHealth() {
    return this.appService.getHealth();
  }
}
