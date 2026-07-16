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
      secretOrKey: config.get<string>('jwt.secret') || 'xt-music-dev-secret',
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
