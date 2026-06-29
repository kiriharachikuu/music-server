/**
 * 环境变量结构化配置工厂
 * 供 ConfigModule.load 使用，可通过 configService.get('xxx') 读取
 */
export default () => ({
  port: parseInt(process.env.PORT || '3000', 10),
  jwt: {
    secret: process.env.JWT_SECRET || 'xt-music-dev-secret',
    expiresIn: process.env.JWT_EXPIRES || '7d',
  },
  storage: {
    driver: process.env.STORAGE_DRIVER || 'local',
    localStoragePath: process.env.LOCAL_STORAGE_PATH || './uploads',
    s3: {
      endpoint: process.env.S3_ENDPOINT || '',
      bucket: process.env.S3_BUCKET || '',
      accessKey: process.env.S3_ACCESS_KEY || '',
      secretKey: process.env.S3_SECRET_KEY || '',
      region: process.env.S3_REGION || '',
      publicDomain: process.env.S3_PUBLIC_DOMAIN || '',
    },
  },
  cors: {
    origins: (process.env.CORS_ORIGINS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  },
});
