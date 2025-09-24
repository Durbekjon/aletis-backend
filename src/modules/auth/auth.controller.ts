import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import type { JwtPayload } from './strategies/jwt.strategy';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from '@auth/dto/login.dto';
import {
  RefreshTokenDto,
  ForgotPasswordDto,
  ResetPasswordDto,
} from '@auth/dto';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';

@ApiTags('Auth')
@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {}
  @Post('register')
  @UseGuards(ThrottlerGuard)
  @ApiOperation({ summary: 'Register a new user' })
  @ApiBody({ type: RegisterDto })
  @ApiOkResponse({
    description: 'Tokens issued',
    schema: {
      properties: {
        accessToken: { type: 'string' },
        refreshToken: { type: 'string' },
      },
    },
  })
  async register(@Body() body: RegisterDto) {
    return this.authService.register(body);
  }

  @Post('login')
  @UseGuards(ThrottlerGuard)
  @ApiOperation({ summary: 'Login and get JWT access token' })
  @ApiBody({ type: LoginDto })
  @ApiOkResponse({
    description: 'JWT access token',
    schema: {
      properties: {
        accessToken: { type: 'string' },
        refreshToken: { type: 'string' },
      },
    },
  })
  async login(
    @Body() body: LoginDto,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    return this.authService.login(body.email, body.password);
  }

  @Post('refresh')
  @UseGuards(ThrottlerGuard)
  @ApiOperation({ summary: 'Refresh access and refresh tokens' })
  @ApiBody({ type: RefreshTokenDto })
  @ApiOkResponse({
    description: 'New tokens',
    schema: {
      properties: {
        accessToken: { type: 'string' },
        refreshToken: { type: 'string' },
      },
    },
  })
  async refresh(
    @Body() body: RefreshTokenDto,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    return this.authService.refreshUsingToken(body.refreshToken);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access')
  @ApiOperation({ summary: 'Logout user (invalidate refresh token)' })
  @ApiOkResponse({ description: 'Logged out' })
  async logout(@CurrentUser() user: JwtPayload): Promise<void> {
    await this.authService.logout(Number(user.userId));
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  @ApiBearerAuth('access')
  @ApiOperation({ summary: 'Get current user from JWT' })
  @ApiOkResponse({
    description: 'Current JWT payload',
    schema: {
      properties: {
        userId: { oneOf: [{ type: 'number' }, { type: 'string' }] },
      },
    },
  })
  me(@CurrentUser() user: JwtPayload): JwtPayload {
    return user;
  }

  @Post('forgot-password')
  @UseGuards(ThrottlerGuard)
  @ApiOperation({ summary: 'Request password reset token' })
  @ApiBody({ type: ForgotPasswordDto })
  @ApiOkResponse({
    description: 'Reset token (for demo/testing)',
    schema: { properties: { resetToken: { type: 'string' } } },
  })
  async forgotPassword(
    @Body() body: ForgotPasswordDto,
  ): Promise<{ resetToken: string }> {
    return this.authService.forgotPassword(body.email);
  }

  @Post('reset-password')
  @UseGuards(ThrottlerGuard)
  @ApiOperation({ summary: 'Reset password using token' })
  @ApiBody({ type: ResetPasswordDto })
  @ApiOkResponse({ description: 'Password reset successful' })
  async resetPassword(@Body() body: ResetPasswordDto): Promise<void> {
    await this.authService.resetPassword(body.token, body.newPassword);
  }

  @Get('google')
  @UseGuards(AuthGuard('google'))
  @ApiOperation({ summary: 'Initiate Google OAuth 2.0 login' })
  @ApiOkResponse({ description: 'Redirects to Google consent screen' })
  async googleAuth() {
    return;
  }

  @Get('google/redirect')
  @UseGuards(AuthGuard('google'))
  @ApiOperation({ summary: 'Google OAuth 2.0 callback' })
  @ApiOkResponse({
    description: 'Google login success with tokens and user info',
    schema: {
      properties: {
        accessToken: { type: 'string' },
        refreshToken: { type: 'string' },
        isNew: { type: 'boolean' },
        user: {
          properties: {
            id: { type: 'number' },
            firstName: { type: 'string', nullable: true },
            lastName: { type: 'string', nullable: true },
            email: { type: 'string' },
          },
        },
      },
    },
  })
  async googleAuthRedirect(@Req() req: any, @Res() res: Response) {
    const payload = req?.user ?? {};
    const result = await this.authService.handleGoogleLogin({
      email: payload?.email,
      firstName: payload?.firstName,
      lastName: payload?.lastName,
    });
    const nodeEnv = await this.config.get('NODE_ENV');
    const frontendRedirectBase =
      nodeEnv === 'production'
        ? this.config.get<string>('FRONTEND_PRODUCTION_URL')
        : this.config.get<string>('FRONTEND_DEVELOPMENT_URL');

    if (!frontendRedirectBase) {
      throw new Error('Frontend redirect URL is not defined');
    }

    const url = new URL(frontendRedirectBase);
    url.searchParams.set('access', result.accessToken);
    url.searchParams.set('refresh', result.refreshToken);
    url.searchParams.set('isNew', String(result.isNew));

    return res.redirect(url.toString());
  }
}
