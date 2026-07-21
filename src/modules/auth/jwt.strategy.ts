import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service';

interface JwtPayload {
  sub: string;
  userId: string;
  role: string;
  iat?: number;
  exp?: number;
}

/**
 * JWT 策略
 * 从 Authorization Bearer 解析 token，校验用户存在且未被软删除
 * 返回的 user 会被注入到 request.user 上供 @CurrentUser 使用
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      // 密钥由 configuration.ts 统一提供（dev 回退默认值），此处不再二次回退，
      // 避免配置缺失时静默使用已知默认密钥导致 token 可被伪造。
      // 显式校验非空：生产环境由 main.ts 的 runSecurityChecks 拦截默认密钥，
      // 此处再做空值断言以满足类型约束并作为防御性编程。
      secretOrKey: config.get<string>('jwt.secret') as string,
    });
  }

  async validate(payload: JwtPayload) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.userId },
    });
    if (!user || user.deletedAt) {
      throw new UnauthorizedException('用户不存在或已被禁用');
    }
    if (user.passwordUpdatedAt && payload.iat) {
      const tokenIssuedAt = new Date(payload.iat * 1000);
      if (tokenIssuedAt < user.passwordUpdatedAt) {
        throw new UnauthorizedException('密码已修改，请重新登录');
      }
    }
    return user;
  }
}
