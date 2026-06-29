import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import helmet from 'helmet';
import * as fs from 'fs';
import * as path from 'path';

import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });

  // 使用 winston 作为应用日志器
  app.useLogger(app.get(WINSTON_MODULE_NEST_PROVIDER));

  const configService = app.get(ConfigService);
  const port = configService.get<number>('port') ?? 3000;
  const corsOrigins = configService.get<string[]>('cors.origins') ?? [];

  // 安全响应头
  app.use(helmet());

  // 跨域配置：
  // - 若配置了具体白名单（不含 *），则按白名单精确匹配
  // - 若白名单为空或包含 *，则走 origin: true 动态回显请求方 Origin
  //   （credentials: true 时浏览器拒绝 Access-Control-Allow-Origin: *，
  //    必须用动态回显或具体域名）
  const hasWildcard = corsOrigins.includes('*');
  const effectiveOrigin =
    corsOrigins.length && !hasWildcard ? corsOrigins : true;

  app.enableCors({
    origin: effectiveOrigin,
    credentials: true,
  });

  // 全局路由前缀
  app.setGlobalPrefix('api');

  // 本地存储模式：挂载 express.static 提供上传文件静态访问
  const storageDriver =
    (configService.get<string>('storage.driver') || 'local').toLowerCase();
  if (storageDriver === 'local') {
    const localStoragePath =
      configService.get<string>('storage.localStoragePath') || './uploads';
    const absRoot = path.resolve(process.cwd(), localStoragePath);
    fs.mkdirSync(absRoot, { recursive: true });
    app.useStaticAssets(absRoot, { prefix: '/uploads/' });
  }

  // 全局参数校验管道：白名单过滤 + 类型自动转换
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );

  await app.listen(port);

  const logger = new Logger('Bootstrap');
  logger.log(`XingTone后端服务已启动，监听端口 ${port}`);
  logger.log(`接口前缀：/api`);
}

bootstrap();
