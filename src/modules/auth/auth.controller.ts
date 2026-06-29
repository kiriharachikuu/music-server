import { Body, Controller, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

/**
 * 认证控制器
 * 路由前缀 /api/auth（全局前缀 api + 控制器前缀 auth）
 */
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /** 注册：POST /api/auth/register */
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  /** 登录：POST /api/auth/login */
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }
}
