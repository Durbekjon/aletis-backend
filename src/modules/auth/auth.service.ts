import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { SignOptions } from 'jsonwebtoken';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@/core/prisma/prisma.service';
import { FileDeleteService } from '@/core/file-delete/file-delete.service';
import { TelegramLoggerService } from '@/core/telegram-logger/telegram-logger.service';
import * as bcrypt from 'bcrypt';
import { RegisterDto } from './dto/register.dto';
import crypto from 'node:crypto';
import { JwtPayload } from './strategies/jwt.strategy';
import { AuthResponse } from './dto/auth-response.dto';
import { UpdateProfileDto } from './dto';
import {
  MemberRole,
  MemberStatus,
  OnboardingStatus,
  OnboardingStep,
  Prisma,
} from '@prisma/client';

type Tokens = { accessToken: string; refreshToken: string };
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly fileDeleteService: FileDeleteService,
    private readonly telegramLogger: TelegramLoggerService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResponse> {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException('Email already in use');
    }

    const passwordHash = await this.hashValue(dto.password);
    const orgName = this.defaultOrgName(dto.firstName, dto.orgName);

    const { userId, org } = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          firstName: dto.firstName ?? null,
          lastName: dto.lastName ?? null,
          email: dto.email,
          password: passwordHash,
        },
      });
      const createdOrg = await this.createDefaultOrganization(
        tx,
        user.id,
        orgName,
      );
      return { userId: user.id, org: createdOrg };
    });

    const tokens = await this.issueTokens(userId);
    await this.updateUserRefreshTokenHash(userId, tokens.refreshToken);

    // Send Telegram notification about new user registration
    const totalCount = await this.prisma.user.count();
    const userName =
      `${dto.firstName || ''} ${dto.lastName || ''}`.trim() || dto.email;
    await this.telegramLogger.sendEvent(
      '🧍 New user registered',
      `Name: ${userName}\nEmail: ${dto.email}\nTotal users: ${totalCount}`,
    );

    return this.buildAuthResponse(tokens, org);
  }

  private defaultOrgName(
    firstName: string | null | undefined,
    explicit: string | undefined,
  ): string {
    if (explicit && explicit.trim().length > 0) return explicit.trim();
    if (firstName && firstName.trim().length > 0) {
      return `${firstName.trim()}'s store`;
    }
    return 'My store';
  }

  private async createDefaultOrganization(
    tx: Prisma.TransactionClient,
    userId: number,
    name: string,
  ) {
    const organization = await tx.organization.create({
      data: {
        name,
        onboardingProgress: {
          create: {
            percentage: 0,
            status: OnboardingStatus.INCOMPLETE,
            nextStep: OnboardingStep.ADD_FIRST_PRODUCT,
          },
        },
      },
      include: { onboardingProgress: true },
    });
    await tx.member.create({
      data: {
        userId,
        organizationId: organization.id,
        role: MemberRole.ADMIN,
        status: MemberStatus.ACTIVE,
      },
    });
    return organization;
  }

  private buildAuthResponse(
    tokens: Tokens,
    org: {
      id: number;
      name: string;
      onboardingProgress: {
        id: number;
        percentage: number;
        isFirstProductAdded: boolean;
        isBotConnected: boolean;
        isChannelConnected: boolean;
        nextStep: OnboardingStep;
        status: OnboardingStatus;
      } | null;
    } | null,
  ): AuthResponse {
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
                isFirstProductAdded: org.onboardingProgress.isFirstProductAdded,
                isBotConnected: org.onboardingProgress.isBotConnected,
                isChannelConnected: org.onboardingProgress.isChannelConnected,
                nextStep: org.onboardingProgress.nextStep,
                status: org.onboardingProgress.status,
              }
            : null,
        },
      }),
    };
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
                isFirstProductAdded: org.onboardingProgress.isFirstProductAdded,
                isBotConnected: org.onboardingProgress.isBotConnected,
                isChannelConnected: org.onboardingProgress.isChannelConnected,
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

  async forgotPassword(email: string): Promise<{ ok: true }> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      // Do not reveal whether the email exists.
      return { ok: true };
    }

    const resetToken = crypto.randomUUID();
    const expiry = new Date(Date.now() + 60 * 60 * 1000);
    const resetTokenHash = await this.hashValue(resetToken);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { resetToken: resetTokenHash, resetTokenExpiry: expiry },
    });

    // TODO: dispatch reset email via mailer service.
    // The raw token is only logged in non-production so devs can complete the flow.
    if (this.configService.get<string>('NODE_ENV') !== 'production') {
      this.logger.debug(
        `Password reset link for ${email}: token=${resetToken}`,
      );
    }

    return { ok: true };
  }

  async handleGoogleLogin(payload: {
    email?: string;
    firstName?: string;
    lastName?: string;
  }): Promise<AuthResponse> {
    if (!payload.email) {
      throw new UnauthorizedException('Google account has no email');
    }

    const userId = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.user.findUnique({
        where: { email: payload.email! },
        include: { member: true },
      });
      if (existing) {
        return existing.id;
      }
      const defaultPasswordHash = await this.hashValue(crypto.randomUUID());
      const created = await tx.user.create({
        data: {
          email: payload.email!,
          firstName: payload.firstName ?? null,
          lastName: payload.lastName ?? null,
          password: defaultPasswordHash,
        },
      });
      await this.createDefaultOrganization(
        tx,
        created.id,
        this.defaultOrgName(payload.firstName, undefined),
      );
      return created.id;
    });

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
    return this.buildAuthResponse(
      tokens,
      userWithOrg?.member?.organization ?? null,
    );
  }

  async resetPassword(
    email: string,
    token: string,
    newPassword: string,
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (
      !user ||
      !user.resetToken ||
      !user.resetTokenExpiry ||
      user.resetTokenExpiry.getTime() < Date.now()
    ) {
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
    logo: {
      id: number;
      key: string;
    } | null;
  }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        logo: {
          select: {
            id: true,
            key: true,
          },
        },
      },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async updateProfile(
    userId: number,
    updateData: UpdateProfileDto,
  ): Promise<{
    id: number;
    email: string;
    firstName: string | null;
    lastName: string | null;
  }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { logo: true },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Handle logo update: delete old logo if a new one is provided or if logoId is null
    let oldLogoKey: string | null = null;
    if (updateData.logoId !== undefined) {
      // If there's an old logo, get its key for deletion
      if (user.logoId && user.logo) {
        oldLogoKey = user.logo.key;
      }

      // If a new logoId is provided, validate it exists
      if (updateData.logoId !== null) {
        const newLogo = await this.prisma.file.findUnique({
          where: { id: updateData.logoId },
        });
        if (!newLogo) {
          throw new BadRequestException('Logo file not found');
        }
      }
    }

    // Update user with new data
    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: {
        firstName: updateData.firstName ?? undefined,
        lastName: updateData.lastName ?? undefined,
        logoId: updateData.logoId ?? undefined,
      },
      select: { id: true, email: true, firstName: true, lastName: true },
    });

    // Delete old logo file from filesystem if it was replaced
    if (oldLogoKey && updateData.logoId !== user.logoId) {
      try {
        await this.fileDeleteService.deleteFileByKey(oldLogoKey);
        // Delete the old logo file record from database
        if (user.logoId) {
          await this.prisma.file
            .delete({
              where: { id: user.logoId },
            })
            .catch((error) => {
              this.logger.warn(
                `Failed to delete old logo file record: ${error.message}`,
              );
            });
        }
      } catch (error) {
        this.logger.warn(`Failed to delete old logo file: ${error.message}`);
        // Don't throw error - logo update succeeded even if old file deletion failed
      }
    }

    return updatedUser;
  }

  async updatePassword(
    userId: number,
    oldPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Verify old password
    const isValid = await bcrypt.compare(oldPassword, user.password);
    if (!isValid) {
      throw new UnauthorizedException('Invalid current password');
    }

    // Hash and update new password
    const passwordHash = await this.hashValue(newPassword);
    await this.prisma.user.update({
      where: { id: userId },
      data: { password: passwordHash },
    });
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
    const secret =
      this.configService.get<string>('JWT_ACCESS_SECRET') ??
      this.configService.get<string>('JWT_SECRET');
    if (!secret) {
      throw new Error('JWT_ACCESS_SECRET or JWT_SECRET must be set');
    }
    return secret;
  }

  private getRefreshSecret(): string {
    const secret =
      this.configService.get<string>('JWT_REFRESH_SECRET') ??
      this.configService.get<string>('JWT_SECRET');
    if (!secret) {
      throw new Error('JWT_REFRESH_SECRET or JWT_SECRET must be set');
    }
    return secret;
  }

  private getAccessExpiry(): SignOptions['expiresIn'] {
    return (this.configService.get<string>('JWT_ACCESS_EXPIRES_IN') ??
      '15m') as SignOptions['expiresIn'];
  }

  private getRefreshExpiry(): SignOptions['expiresIn'] {
    return (this.configService.get<string>('JWT_REFRESH_EXPIRES_IN') ??
      '7d') as SignOptions['expiresIn'];
  }

  private getSaltRounds(): number {
    return Number(this.configService.get('BCRYPT_SALT_ROUNDS') ?? 10);
  }

  private async hashValue(value: string): Promise<string> {
    return bcrypt.hash(value, this.getSaltRounds());
  }
}
