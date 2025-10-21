import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@/core/prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { RegisterDto } from './dto/register.dto';
import crypto from 'node:crypto';
import { JwtPayload } from './strategies/jwt.strategy';
import { AuthResponse } from './dto/auth-response.dto';

type Tokens = { accessToken: string; refreshToken: string };
@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async register(dto: RegisterDto): Promise<Tokens> {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException('Email already in use');
    }

    const saltRounds = Number(
      this.configService.get('BCRYPT_SALT_ROUNDS') ?? 10,
    );
    const passwordHash = await bcrypt.hash(dto.password, saltRounds);

    const user = await this.prisma.user.create({
      data: {
        firstName: dto.firstName ?? null,
        lastName: dto.lastName ?? null,
        email: dto.email,
        password: passwordHash,
      },
    });
    const tokens = await this.issueTokens(user.id);
    await this.updateUserRefreshTokenHash(user.id, tokens.refreshToken);
    return tokens;
  }

  async login(email: string, password: string): Promise<AuthResponse> {
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: {
        member: {
          include: {
            organization: {
              include: { onboardingProgress: true },
            },
          },
        },
      },
    });
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const tokens = await this.issueTokens(user.id);
    await this.updateUserRefreshTokenHash(user.id, tokens.refreshToken);
    const org = user.member?.organization;
    return {
      ...tokens,
      hasOrganization: !!org,
      ...(org && {
        organization: {
          id: org.id,
          name: org.name,
          onboardingProgress: org.onboardingProgress
            ? {
                id: org.onboardingProgress.id,
                percentage: org.onboardingProgress.percentage,
                isCategorySelected: org.onboardingProgress.isCategorySelected,
                isSchemaConfigured: org.onboardingProgress.isSchemaConfigured,
                isFirstProductAdded: org.onboardingProgress.isFirstProductAdded,
                isBotConnected: org.onboardingProgress.isBotConnected,
                nextStep: org.onboardingProgress.nextStep,
                status: org.onboardingProgress.status,
              }
            : null,
        },
      }),
    };
  }

  async refreshTokens(userId: number, refreshToken: string): Promise<Tokens> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.refreshToken) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const isValid = await bcrypt.compare(refreshToken, user.refreshToken);
    if (!isValid) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const tokens = await this.issueTokens(user.id);
    await this.updateUserRefreshTokenHash(user.id, tokens.refreshToken);
    return tokens;
  }

  async refreshUsingToken(refreshToken: string): Promise<Tokens> {
    const { userId } = await this.jwtService.verifyAsync<{ userId: number }>(
      refreshToken,
      { secret: this.getRefreshSecret(), ignoreExpiration: false },
    );
    return this.refreshTokens(Number(userId), refreshToken);
  }

  async logout(userId: number): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshToken: null },
    });
  }

  async forgotPassword(email: string): Promise<{ resetToken: string }> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      // Do not reveal whether email exists; still return success-like response
      return { resetToken: '' };
    }

    const resetToken = crypto.randomUUID();
    const expiry = new Date(Date.now() + 60 * 60 * 1000);

    // For higher security, store hash instead of raw token
    const resetTokenHash = await this.hashValue(resetToken);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { resetToken: resetTokenHash, resetTokenExpiry: expiry },
    });

    // In production: send email containing resetToken
    return { resetToken };
  }

  async handleGoogleLogin(
    payload: any,
  ): Promise<AuthResponse> {
    if (!payload.email) {
      throw new UnauthorizedException('Google account has no email');
    }
    const existing = await this.prisma.user.findUnique({
      where: { email: payload.email },
    });
    let userId: number;
    if (existing) {
      userId = existing.id;
    } else {
      const defaultPasswordHash = await this.hashValue(crypto.randomUUID());
      const created = await this.prisma.user.create({
        data: {
          email: payload.email,
          firstName: payload.firstName ?? null,
          lastName: payload.lastName ?? null,
          password: defaultPasswordHash,
        },
      });
      userId = created.id;
    }
    const tokens = await this.issueTokens(userId);
    await this.updateUserRefreshTokenHash(userId, tokens.refreshToken);
    const userWithOrg = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        member: {
          include: {
            organization: {
              include: { onboardingProgress: true },
            },
          },
        },
      },
    });
    const org = userWithOrg?.member?.organization;
    return {
      ...tokens,
      hasOrganization: !!org,
      ...(org && {
        organization: {
          id: org.id,
          name: org.name,
          onboardingProgress: org.onboardingProgress
            ? {
                id: org.onboardingProgress.id,
                percentage: org.onboardingProgress.percentage,
                isCategorySelected: org.onboardingProgress.isCategorySelected,
                isSchemaConfigured: org.onboardingProgress.isSchemaConfigured,
                isFirstProductAdded: org.onboardingProgress.isFirstProductAdded,
                isBotConnected: org.onboardingProgress.isBotConnected,
                nextStep: org.onboardingProgress.nextStep,
                status: org.onboardingProgress.status,
              }
            : null,
        },
      }),
    };
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: { resetToken: { not: null } },
    });
    if (!user || !user.resetToken || !user.resetTokenExpiry) {
      throw new UnauthorizedException('Invalid or expired reset token');
    }

    const isExpired = user.resetTokenExpiry.getTime() < Date.now();
    if (isExpired) {
      throw new UnauthorizedException('Invalid or expired reset token');
    }

    const valid = await bcrypt.compare(token, user.resetToken);
    if (!valid) {
      throw new UnauthorizedException('Invalid or expired reset token');
    }

    const passwordHash = await this.hashValue(newPassword);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        password: passwordHash,
        resetToken: null,
        resetTokenExpiry: null,
      },
    });
  }

  async getMe(userId: number): Promise<{
    id: number;
    email: string;
    firstName: string | null;
    lastName: string | null;
  }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, firstName: true, lastName: true, email: true },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  private async updateUserRefreshTokenHash(
    userId: number,
    refreshToken: string,
  ): Promise<void> {
    const hash = await this.hashValue(refreshToken);
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshToken: hash },
    });
  }

  private async issueTokens(userId: number): Promise<Tokens> {
    const payload: JwtPayload = { userId };
    const accessToken = await this.jwtService.signAsync(payload, {
      secret: this.getAccessSecret(),
      expiresIn: this.getAccessExpiry(),
    });
    const refreshToken = await this.jwtService.signAsync(payload, {
      secret: this.getRefreshSecret(),
      expiresIn: this.getRefreshExpiry(),
    });
    return { accessToken, refreshToken };
  }

  private getAccessSecret(): string {
    return (
      this.configService.get<string>('JWT_ACCESS_SECRET') ??
      this.configService.get<string>('JWT_SECRET') ??
      'dev-secret'
    );
  }

  private getRefreshSecret(): string {
    return (
      this.configService.get<string>('JWT_REFRESH_SECRET') ??
      this.configService.get<string>('JWT_SECRET') ??
      'dev-secret'
    );
  }

  private getAccessExpiry(): number {
    const FIFTEEN_MINUTES = 15 * 60 * 1000;
    return Number(
      this.configService.get<string>('JWT_ACCESS_EXPIRES_IN') ??
        FIFTEEN_MINUTES,
    );
  }

  private getRefreshExpiry(): number {
    const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
    return Number(
      this.configService.get<string>('JWT_REFRESH_EXPIRES_IN') ?? SEVEN_DAYS,
    );
  }

  private getSaltRounds(): number {
    return Number(this.configService.get('BCRYPT_SALT_ROUNDS') ?? 10);
  }

  private async hashValue(value: string): Promise<string> {
    return bcrypt.hash(value, this.getSaltRounds());
  }
}
