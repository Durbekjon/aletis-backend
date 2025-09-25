import {
  ConflictException,
  Injectable,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { EncryptionService } from '../../core/encryption/encryption.service';
import { ConnectBotDto } from './dto/connect-bot.dto';
import type { Bot } from '@prisma/client';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
    private readonly logger: Logger,
    private readonly configService: ConfigService,
  ) {}

  async connectBot(userId: number, dto: ConnectBotDto): Promise<Bot> {
    // Check if user already has a bot
    const existingBot = await this.prisma.bot.findUnique({
      where: { id: userId }, //todo,
    });

    if (existingBot) {
      throw new ConflictException('User already has a bot connected');
    }

    // Validate token format
    if (!this.isValidBotToken(dto.token)) {
      throw new BadRequestException('Invalid bot token format');
    }

    // Test bot token by calling Telegram API
    await this.validateBotToken(dto.token);

    // Encrypt token before saving
    const encryptedToken = this.encryption.encrypt(dto.token);

    // Create bot record
    const bot: Bot = await this.prisma.bot.create({
      data: {
        token: encryptedToken,
        organizationId: userId,
        isEnabled: true,
      },
    });

    return bot;
  }

  async getBotByUser(userId: number): Promise<Bot | null> {
    return this.prisma.bot.findUnique({
      where: { id: userId }, //todo,
    });
  }

  private isValidBotToken(token: string): boolean {
    // Basic format validation: numbers:alphanumeric_with_dashes_underscores
    const tokenPattern = /^\d+:[A-Za-z0-9_-]{35,}$/;
    return tokenPattern.test(token);
  }

  private async validateBotToken(token: string): Promise<void> {
    try {
      const response = await fetch(
        `https://api.telegram.org/bot${token}/getMe`,
        {
          method: 'GET',
        },
      );

      if (!response.ok) {
        throw new BadRequestException(
          'Invalid bot token: Telegram API rejected the token',
        );
      }

      const data = await response.json();

      if (!data.ok || !data.result?.is_bot) {
        throw new BadRequestException('Invalid bot token: Not a valid bot');
      }
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(
        'Unable to validate bot token with Telegram API',
      );
    }
  }

  async getBot(userId: number): Promise<{ bot: Bot | null }> {
    const bot = await this.prisma.bot.findUnique({
      where: { id: userId }, //todo,
    });

    return { bot };
  }

  async setBotStatus(
    userId: number,
    isEnabled: boolean,
  ): Promise<{ bot: Bot }> {
    // Get current bot to access token
    const currentBot = await this.prisma.bot.findUnique({
      where: { id: userId }, //todo,
    });

    if (!currentBot) {
      throw new Error('Bot not found');
    }

    // Decrypt bot token
    const botToken = this.encryption.decrypt(currentBot.token);

    // Set or remove webhook with Telegram
    await this.manageTelegramWebhook(botToken, isEnabled);

    // Update bot status in database with current timestamp
    const bot = await this.prisma.bot.update({
      where: { id: userId }, //todo,
      data: {
        isEnabled,
        updatedAt: new Date(), // Force update timestamp to track when bot was enabled/disabled
      },
    });

    this.logger.log(
      `Bot status updated for user ${userId}: ${isEnabled ? 'enabled' : 'disabled'}`,
    );
    return { bot };
  }

  private async manageTelegramWebhook(
    botToken: string,
    enable: boolean,
  ): Promise<void> {
    const baseUrl = `https://api.telegram.org/bot${botToken}`;

    if (enable) {
      // Set webhook
      const webhookUrl = this.getWebhookUrl();
      const setWebhookUrl = `${baseUrl}/setWebhook`;

      this.logger.log(`Setting webhook to: ${webhookUrl}`);

      const response = await fetch(setWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: webhookUrl }),
      });

      const result = await response.json();

      if (!response.ok || !result.ok) {
        throw new Error(
          `Failed to set webhook: ${result.description || 'Unknown error'}`,
        );
      }

      this.logger.log('Webhook set successfully');
    } else {
      // Remove webhook
      const deleteWebhookUrl = `${baseUrl}/deleteWebhook`;

      this.logger.log('Removing webhook...');

      const response = await fetch(deleteWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const result = await response.json();

      if (!response.ok || !result.ok) {
        this.logger.warn(
          `Failed to remove webhook: ${result.description || 'Unknown error'}`,
        );
        // Don't throw error for webhook removal failure - still update status
      } else {
        this.logger.log('Webhook removed successfully');
      }
    }
  }

  private getWebhookUrl(): string {
    // Get webhook URL from environment or construct from allowed origins
    const webhookUrl = this.configService.get<string>('WEBHOOK_URL');
    if (webhookUrl) {
      return `${webhookUrl}/telegram/webhook`;
    }

    // Fallback: use first allowed origin (for development with ngrok)
    const allowedOrigins = this.configService.get<string>('ALLOWED_ORIGINS');
    if (allowedOrigins) {
      const origins = allowedOrigins.split(',');
      const firstOrigin = origins[0].trim();
      if (firstOrigin && firstOrigin !== '*') {
        return `${firstOrigin}/telegram/webhook`;
      }
    }

    throw new Error(
      'WEBHOOK_URL or specific ALLOWED_ORIGINS must be configured',
    );
  }

  async toggleBotStatus(userId: number): Promise<{ bot: Bot }> {
    const currentBot = await this.prisma.bot.findUnique({
      where: { id: userId }, // todo fix this
    });

    if (!currentBot) {
      throw new Error('Bot not found');
    }

    return this.setBotStatus(userId, !currentBot.isEnabled);
  }
}
