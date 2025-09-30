import { Body, Controller, Param, ParseIntPipe, Post } from '@nestjs/common';
import { TelegramService } from './telegram.service';
import { TelegramWebhookDto } from './dto/telegram-webhook.dto';
import { ApiExcludeController } from '@nestjs/swagger';

@ApiExcludeController()
@Controller({path: 'telegram', version: '1'})
export class TelegramController {
  constructor(private readonly telegramService: TelegramService) {}

  @Post('webhook/:botId/:organizationId')
  async handleWebhook(
    @Param('botId', ParseIntPipe) botId: number,
    @Param('organizationId', ParseIntPipe) organizationId: number,
    @Body() webhookData: TelegramWebhookDto,
  ): Promise<{ status: string }> {
    await this.telegramService.processUpdate(webhookData, botId, organizationId);
    return { status: 'ok' };
  }
}
