import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  // 返回服务健康状态信息，会被响应拦截器包装成统一结构
  getHealth() {
    return {
      status: 'ok',
      service: 'XingTone后端服务',
      version: '1.0.0',
      time: new Date().toISOString(),
    };
  }
}
