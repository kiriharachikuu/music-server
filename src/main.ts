import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import helmet from 'helmet';
import * as fs from 'fs';
import * as path from 'path';

import { AppModule } from './app.module';

const DEFAULT_JWT_SECRET = 'xt-music-dev-secret';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });

  // 使用 winston 作为应用日志器
  app.useLogger(app.get(WINSTON_MODULE_NEST_PROVIDER));

  const configService = app.get(ConfigService);
  const port = configService.get<number>('port') ?? 3000;
  const corsOrigins = configService.get<string[]>('cors.origins') ?? [];
  const nodeEnv = (configService.get<string>('nodeEnv') || 'development').toLowerCase();
  const jwtSecret = configService.get<string>('jwt.secret') || '';
  const helmetEnabled = configService.get<boolean>('security.helmetEnabled') ?? true;
  const hstsEnabled = configService.get<boolean>('security.hstsEnabled') ?? true;
  const corsEnabled = configService.get<boolean>('security.corsEnabled') ?? true;
  const trustProxy = configService.get<boolean>('security.trustProxy') ?? false;

  runSecurityChecks(nodeEnv, jwtSecret, corsOrigins);

  // 信任代理：Nginx 反代场景下需要开启，
  // 确保 req.protocol / req.ip / req.secure 等能正确获取到客户端真实信息
  if (trustProxy) {
    app.set('trust proxy', 1);
  }

  // 安全响应头：
  // - 若使用 Nginx 反代且已在 Nginx 层配置安全头，可设置 HELMET_ENABLED=false 关闭后端 Helmet
  // - 若 HSTS 已由 Nginx 输出，可设置 HSTS_ENABLED=false 避免重复
  if (helmetEnabled) {
    const helmetConfig: Parameters<typeof helmet>[0] = {
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
          styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
          imgSrc: ["'self'", 'data:', 'blob:', '*'],
          mediaSrc: ["'self'", 'blob:', '*'],
          connectSrc: ["'self'", '*'],
          frameSrc: ["'self'"],
          objectSrc: ["'none'"],
          upgradeInsecureRequests: [],
        },
      },
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      crossOriginEmbedderPolicy: false,
      crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
      frameguard: { action: 'sameorigin' },
      hsts: hstsEnabled
        ? {
            maxAge: 31536000,
            includeSubDomains: true,
            preload: true,
          }
        : false,
    };

    app.use(helmet(helmetConfig));
  }

  // 跨域配置：
  // - Nginx 反代场景下，建议由 Nginx 统一处理 CORS（性能更好）
  // - 若由 Nginx 处理，设置 CORS_ENABLED=false 关闭后端 CORS，避免重复设置
  // - 若由后端处理，逻辑如下：
  //   - 若配置了具体白名单（不含 *），则按白名单精确匹配
  //   - 若白名单为空或包含 *，则走 origin: true 动态回显请求方 Origin
  //     （credentials: true 时浏览器拒绝 Access-Control-Allow-Origin: *，
  //      必须用动态回显或具体域名）
  if (corsEnabled) {
    const hasWildcard = corsOrigins.includes('*');
    const effectiveOrigin =
      corsOrigins.length && !hasWildcard ? corsOrigins : true;

    app.enableCors({
      origin: effectiveOrigin,
      credentials: true,
      preflightContinue: false,
      optionsSuccessStatus: 204,
    });
  }

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
  logger.log(`运行环境：${nodeEnv}`);
  if (trustProxy) {
    logger.log(`代理模式：已开启 trust proxy（Nginx 反代场景）`);
  }
  if (!helmetEnabled) {
    logger.warn(`安全头：Helmet 已关闭（由 Nginx/网关层统一处理）`);
  }
  if (!corsEnabled) {
    logger.warn(`跨域：CORS 已关闭（由 Nginx/网关层统一处理）`);
  }
}

function runSecurityChecks(
  nodeEnv: string,
  jwtSecret: string,
  corsOrigins: string[],
) {
  const logger = new Logger('SecurityCheck');
  const isProd = nodeEnv === 'production';

  if (isProd && jwtSecret === DEFAULT_JWT_SECRET) {
    logger.error('========================================');
    logger.error('  严重安全警告：JWT 密钥使用了默认值！');
    logger.error('  请立即在环境变量中设置 JWT_SECRET');
    logger.error('  为强随机字符串（至少32位）');
    logger.error('========================================');
  } else if (!isProd && jwtSecret === DEFAULT_JWT_SECRET) {
    logger.warn('当前使用默认 JWT 密钥，仅用于开发环境');
  }

  if (isProd) {
    const hasWildcard = corsOrigins.includes('*');
    if (hasWildcard || corsOrigins.length === 0) {
      logger.warn('生产环境建议配置明确的 CORS 白名单，避免使用 *');
    }
  }

  if (jwtSecret.length < 16) {
    logger.warn('JWT 密钥长度较短，建议使用至少 32 位的随机字符串');
  }
}

bootstrap();
