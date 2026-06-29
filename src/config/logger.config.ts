import { WinstonModuleOptions, utilities } from 'nest-winston';
import * as winston from 'winston';

/**
 * winston 日志配置
 * - 控制台：彩色 nestLike 输出
 * - logs/error.log：仅错误日志
 * - logs/combined.log：全量日志
 */
export const winstonConfig: WinstonModuleOptions = {
  levels: winston.config.npm.levels,
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json(),
  ),
  transports: [
    new winston.transports.Console({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.errors({ stack: true }),
        winston.format.splat(),
        utilities.format.nestLike('XingTone', {
          prettyPrint: true,
          colors: true,
        }),
      ),
    }),
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
    }),
    new winston.transports.File({
      filename: 'logs/combined.log',
    }),
  ],
};
