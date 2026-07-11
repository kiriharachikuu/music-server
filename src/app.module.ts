import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { WinstonModule } from 'nest-winston';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import configuration from './config/configuration';
import { winstonConfig } from './config/logger.config';
import { OperationLogInterceptor } from './modules/operation-log/operation-log.interceptor';

// 业务模块
import { AuthModule } from './modules/auth/auth.module';
import { UserModule } from './modules/user/user.module';
import { SongModule } from './modules/song/song.module';
import { AlbumModule } from './modules/album/album.module';
import { PlaylistModule } from './modules/playlist/playlist.module';
import { BannerModule } from './modules/banner/banner.module';
import { SearchModule } from './modules/search/search.module';
import { UploadModule } from './modules/upload/upload.module';
import { AdminModule } from './modules/admin/admin.module';
import { StatsModule } from './modules/stats/stats.module';
import { AppVersionModule } from './modules/app-version/app-version.module';
import { ArtistModule } from './modules/artist/artist.module';
import { OperationLogModule } from './modules/operation-log/operation-log.module';

@Module({
  imports: [
    // 全局加载 .env 环境变量
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    // winston 日志
    WinstonModule.forRoot(winstonConfig),
    // 全局速率限制：60 秒内最多 100 次请求
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
    // Prisma 全局数据库模块
    PrismaModule,
    // 业务模块
    AuthModule,
    UserModule,
    SongModule,
    AlbumModule,
    PlaylistModule,
    BannerModule,
    SearchModule,
    UploadModule,
    AdminModule,
    StatsModule,
    AppVersionModule,
    ArtistModule,
    OperationLogModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // 全局异常过滤器，保证异常也返回统一结构
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    // 全局响应拦截器，包装成 { code, data, message }
    { provide: APP_INTERCEPTOR, useClass: TransformInterceptor },
    // 全局操作日志拦截器：记录 admin 写操作（POST/PUT/DELETE），在 TransformInterceptor 之后注册
    { provide: APP_INTERCEPTOR, useClass: OperationLogInterceptor },
    // 全局速率限制守卫
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
