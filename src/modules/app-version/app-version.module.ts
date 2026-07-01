import { Module } from '@nestjs/common';
import { AppVersionController } from './app-version.controller';
import { AdminAppVersionController } from './admin-app-version.controller';
import { AppVersionService } from './app-version.service';

/** App版本更新模块 */
@Module({
  controllers: [AppVersionController, AdminAppVersionController],
  providers: [AppVersionService],
})
export class AppVersionModule {}
