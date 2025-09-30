import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface webhookResponse {
  isOK: boolean,
  message: string
}

@Injectable()
export class WebhookService {
  constructor(
    private readonly configService: ConfigService,
    private readonly logger: Logger,
  ) {}

  async getWebhookUrl(): Promise<string> {
    // Get webhook URL from environment or construct from allowed origins
    const webhookUrl = this.configService.get<string>('WEBHOOK_URL');
    if (webhookUrl) {
      return `${webhookUrl}/api/v1/telegram/webhook`;
    }

    throw new Error(
      'WEBHOOK_URL or specific ALLOWED_ORIGINS must be configured',
    );
  }

  async setWebhook(botToken: string): Promise<webhookResponse> {
    const baseUrl = `https://api.telegram.org/bot${botToken}`;
    const webhookUrl = await this.getWebhookUrl();
    const setWebhookUrl = `${baseUrl}/setWebhook`;

    this.logger.log(`Setting webhook to: ${webhookUrl}`);

    const response = await fetch(setWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: webhookUrl }),
    });

    const result = await response.json();
    console.log({result})
    if (!response.ok || !result.ok) {
      return {
        isOK: false,
        message: `Failed to set webhook: ${result.description || 'Unknown error'}`,
      };
    }

    return {
      isOK: true,
      message: 'Webhook set successfully',
    };
  }

  async deleteWebhook(botToken: string): Promise<webhookResponse> {
    const baseUrl = `https://api.telegram.org/bot${botToken}`;
    const deleteWebhookUrl = `${baseUrl}/deleteWebhook`;

    const response = await fetch(deleteWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    const result = await response.json();

    if (!response.ok || !result.ok) {
      return {
        isOK: false,
        message: `Failed to remove webhook: ${result.description || 'Unknown error'}`,
      };
    } else {
      return {
        isOK: true,
        message: 'Webhook removed successfully',
      };
    }
  }
}
