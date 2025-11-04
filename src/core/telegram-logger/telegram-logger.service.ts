import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class TelegramLoggerService {
  private readonly logger = new Logger(TelegramLoggerService.name);
  private readonly botToken: string | null;
  private readonly chatId: string | null;
  private readonly isEnabled: boolean;
  private readonly skipInDevelopment: boolean;

  constructor(private readonly configService: ConfigService) {
    this.botToken = this.configService.get<string>('TELEGRAM_BOT_TOKEN') || null;
    this.chatId = this.configService.get<string>('TELEGRAM_CHAT_ID') || null;
    this.skipInDevelopment =
      this.configService.get<string>('NODE_ENV') === 'development';
    this.isEnabled = !!(this.botToken && this.chatId);

    if (!this.isEnabled) {
      this.logger.warn(
        'TelegramLoggerService is disabled. TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID must be set.',
      );
    } else {
      this.logger.log('TelegramLoggerService initialized successfully');
    }
  }

  /**
   * Sends a formatted code block message to Telegram
   * @param message - The message to send (will be wrapped in code blocks)
   */
  async sendLog(message: string): Promise<void> {
    if (!this.shouldSend()) {
      this.logger.debug(`[Telegram Logger] ${message}`);
      return;
    }

    const formattedMessage = `\`\`\`\n${message}\n\`\`\``;

    try {
      await this.sendTelegramMessage(formattedMessage);
    } catch (error) {
      this.logger.error(
        `Failed to send Telegram log: ${error.message}`,
        error.stack,
      );
      // Fallback to console
      console.error(`[Telegram Logger] ${message}`);
    }
  }

  /**
   * Sends an event notification with emoji and formatted details
   * @param title - Event title with emoji (e.g., "🧍 New user registered")
   * @param details - Optional details to include below the title
   */
  async sendEvent(title: string, details?: string): Promise<void> {
    if (!this.shouldSend()) {
      this.logger.log(`[Telegram Event] ${title}${details ? `\n${details}` : ''}`);
      return;
    }

    let message = `*${title}*`;
    if (details) {
      message += `\n\n${details}`;
    }

    try {
      await this.sendTelegramMessage(message);
    } catch (error) {
      this.logger.error(
        `Failed to send Telegram event: ${error.message}`,
        error.stack,
      );
      // Fallback to console
      console.log(`[Telegram Event] ${title}${details ? `\n${details}` : ''}`);
    }
  }

  /**
   * Sends an error notification with formatted details
   * @param error - Error object or message
   * @param context - Optional context information
   */
  async sendError(
    error: Error | string,
    context?: Record<string, any>,
  ): Promise<void> {
    if (!this.shouldSend()) {
      const errorMessage =
        error instanceof Error ? error.message : error;
      this.logger.error(
        `[Telegram Error] ${errorMessage}`,
        error instanceof Error ? error.stack : undefined,
      );
      return;
    }

    let message = `*❌ Error Occurred*\n\n`;

    if (error instanceof Error) {
      message += `*Message:*\n\`\`\`\n${error.message}\n\`\`\`\n\n`;
      if (error.stack) {
        message += `*Stack Trace:*\n\`\`\`\n${error.stack.substring(0, 2000)}\n\`\`\`\n\n`;
      }
    } else {
      message += `*Message:*\n\`\`\`\n${error}\n\`\`\`\n\n`;
    }

    if (context) {
      message += `*Context:*\n\`\`\`\n${JSON.stringify(context, null, 2)}\n\`\`\`\n`;
    }

    try {
      await this.sendTelegramMessage(message);
    } catch (err) {
      this.logger.error(
        `Failed to send Telegram error: ${err.message}`,
        err.stack,
      );
      // Fallback to console
      console.error(`[Telegram Error]`, error, context);
    }
  }

  /**
   * Checks if Telegram logging should be enabled
   */
  private shouldSend(): boolean {
    if (!this.isEnabled) {
      return false;
    }

    // Skip in development if configured
    if (this.skipInDevelopment) {
      return false;
    }

    return true;
  }

  /**
   * Sends message to Telegram Bot API
   */
  private async sendTelegramMessage(text: string): Promise<void> {
    console.log('this.botToken', this.botToken);
    console.log('this.chatId', this.chatId);
    if (!this.botToken || !this.chatId) {
      throw new Error('Telegram bot token or chat ID not configured');
    }

    const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: this.chatId,
        text,
        parse_mode: 'Markdown',
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        `Telegram API error: ${response.status} - ${JSON.stringify(errorData)}`,
      );
    }

    const data = await response.json();
    if (!data.ok) {
      throw new Error(`Telegram API returned error: ${data.description || 'Unknown error'}`);
    }
  }
}

