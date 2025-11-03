import {
  Body,
  Controller,
  Get,
  Patch,
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
  UpdateProfileDto,
  UpdatePasswordDto,
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
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Logout user (invalidate refresh token)' })
  @ApiOkResponse({ description: 'Logged out' })
  async logout(@CurrentUser() user: JwtPayload): Promise<void> {
    await this.authService.logout(Number(user.userId));
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Get current user from JWT' })
  @ApiOkResponse({
    description: 'Current JWT payload',
    schema: {
      properties: {
        userId: { oneOf: [{ type: 'number' }, { type: 'string' }] },
      },
    },
  })
  me(@CurrentUser() user: JwtPayload) {
    return this.authService.getMe(Number(user.userId));
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

  @Patch('update-profile')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('bearer')
  @ApiOperation({
    summary: 'Update user profile',
    description:
      'Update user profile information. To upload a profile logo: 1) First upload a file using POST /v1/files/upload, 2) Use the returned file ID as logoId in this request. The old logo will be automatically deleted when updating.',
  })
  @ApiBody({ type: UpdateProfileDto })
  @ApiOkResponse({
    description: 'Profile updated successfully',
    schema: {
      properties: {
        id: { type: 'number' },
        email: { type: 'string' },
        firstName: { type: 'string', nullable: true },
        lastName: { type: 'string', nullable: true },
      },
    },
  })
  async updateProfile(
    @CurrentUser() user: JwtPayload,
    @Body() body: UpdateProfileDto,
  ) {
    return this.authService.updateProfile(Number(user.userId), body);
  }

  @Patch('update-password')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Update user password' })
  @ApiBody({ type: UpdatePasswordDto })
  @ApiOkResponse({ description: 'Password updated successfully' })
  async updatePassword(
    @CurrentUser() user: JwtPayload,
    @Body() body: UpdatePasswordDto,
  ): Promise<void> {
    await this.authService.updatePassword(
      Number(user.userId),
      body.oldPassword,
      body.newPassword,
    );
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
    url.searchParams.set('bearer', result.accessToken);
    url.searchParams.set('refresh', result.refreshToken);
    url.searchParams.set('hasOrganization', String(result.hasOrganization));
    if (result.hasOrganization && result.organization) {
      url.searchParams.set('orgId', String(result.organization.id));
      url.searchParams.set('orgName', result.organization.name);

      // Include onboarding progress as separate params (or serialize as JSON if not too big)
      if (result.organization.onboardingProgress) {
        const onboarding = result.organization.onboardingProgress;
        url.searchParams.set('onboardPercent', String(onboarding.percentage));
        url.searchParams.set('onboardStep', onboarding.nextStep || '');
        url.searchParams.set('onboardStatus', onboarding.status || '');
        // Optionally, add other booleans for step feature flags
        url.searchParams.set('onboardBot', String(onboarding.isBotConnected));
        url.searchParams.set(
          'onboardProduct',
          String(onboarding.isFirstProductAdded),
        );
        url.searchParams.set(
          'onboardCategory',
          String(onboarding.isCategorySelected),
        );
        url.searchParams.set(
          'onboardSchema',
          String(onboarding.isSchemaConfigured),
        );
      }
    }

    return res.redirect(url.toString());
  }
}
