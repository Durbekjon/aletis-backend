import { Body, Controller, Post } from '@nestjs/common';
import { TelegramService } from './telegram.service';
import { TelegramWebhookDto } from './dto/telegram-webhook.dto';

@Controller('telegram')
export class TelegramController {
  constructor(private readonly telegramService: TelegramService) {}

  @Post('webhook')
  async handleWebhook(@Body() webhookData: TelegramWebhookDto): Promise<{ status: string }> {
    await this.telegramService.processUpdate(webhookData);
    return { status: 'ok' };
  }
}
