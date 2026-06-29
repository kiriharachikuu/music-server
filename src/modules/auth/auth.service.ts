import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

/** 鉴权成功后返回的用户对象（不含密码） */
export type SafeUser = Omit<
  Awaited<ReturnType<PrismaService['user']['findFirst']>>,
  'password'
>;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  /** 注册：校验用户名/邮箱唯一，bcrypt 哈希后落库并签发 JWT */
  async register(dto: RegisterDto): Promise<{ token: string; user: SafeUser }> {
    const exists = await this.prisma.user.findFirst({
      where: {
        OR: [{ username: dto.username }, { email: dto.email }],
        deletedAt: null,
      },
    });
    if (exists) {
      throw new ConflictException('用户名或邮箱已被注册');
    }
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: {
        username: dto.username,
        email: dto.email,
        password: passwordHash,
      },
    });
    return { token: this.signToken(user.id, user.role), user: this.sanitize(user) };
  }

  /** 登录：按用户名或邮箱查找用户，校验密码后签发 JWT */
  async login(dto: LoginDto): Promise<{ token: string; user: SafeUser }> {
    const user = await this.prisma.user.findFirst({
      where: {
        OR: [{ username: dto.account }, { email: dto.account }],
        deletedAt: null,
      },
    });
    if (!user) {
      throw new UnauthorizedException('账号或密码错误');
    }
    const ok = await bcrypt.compare(dto.password, user.password);
    if (!ok) {
      throw new UnauthorizedException('账号或密码错误');
    }
    return { token: this.signToken(user.id, user.role), user: this.sanitize(user) };
  }

  private signToken(userId: string, role: string): string {
    return this.jwtService.sign({ sub: userId, userId, role });
  }

  private sanitize<T extends { password?: string }>(user: T): Omit<T, 'password'> {
    if (!user) return user;
    const { password: _password, ...rest } = user;
    return rest;
  }
}
