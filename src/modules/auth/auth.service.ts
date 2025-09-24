import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { PrismaService } from '../../core/prisma/prisma.service';
import type { User } from '@prisma/client';
import { TelegramLoginDto } from './dto/telegram-login.dto';

export interface TelegramAuthPayload {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
  auth_date: number;
  hash: string;
  photo_url?: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async validateTelegramLogin(payload: TelegramLoginDto): Promise<string> {
    const { hash, ...rest } = payload;
    const botToken = this.configService.get<string>('TELEGRAM_BOT_TOKEN');
    if (!botToken) {
      throw new UnauthorizedException('Telegram bot token not configured');
    }

    const secret = crypto.createHash('sha256').update(botToken).digest();
    const canonicalData: Record<string, string | number> = {};
    for (const [key, value] of Object.entries(rest)) {
      if (key === 'hash') continue;
      if (value === undefined || value === null) continue;
      if (typeof value === 'string' || typeof value === 'number') {
        canonicalData[key] = value;
      }
    }
    const dataCheckString: string = Object.keys(canonicalData)
      .sort()
      .map((key) => `${key}=${canonicalData[key]}`)
      .join('\n');
    const hmac = crypto
      .createHmac('sha256', secret)
      .update(dataCheckString)
      .digest('hex');

    if (hmac !== hash) {
      throw new UnauthorizedException('Invalid Telegram signature');
    }

    // findOrCreate user via Prisma using Telegram id
    const telegramId = BigInt(payload.id);
    const user: User = await this.prisma.user.upsert({
      where: { telegramId },
      update: {
        telegramUsername: payload.username ?? null,
        firstName: payload.first_name ?? null,
        lastName: payload.last_name ?? null,
      },
      create: {
        telegramId,
        telegramUsername: payload.username ?? null,
        firstName: payload.first_name ?? null,
        lastName: payload.last_name ?? null,
      },
    });

    const userId = user.id;

    const token: string = await this.jwtService.signAsync({ userId });
    return token;
  }
}
