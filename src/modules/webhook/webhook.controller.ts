import { Body, Controller, Param, ParseIntPipe, Post } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { WebhookDto } from './dto/webhook.dto';
import { WebhookService } from './webhook.service';

@ApiExcludeController()
@Controller({ path: 'webhook', version: '1' })
export class WebhookController {
  constructor(private readonly webhookService: WebhookService) {}

  @Post(':botId/:organizationId')
  async handleWebhook(
    @Param('botId', ParseIntPipe) botId: number,
    @Param('organizationId', ParseIntPipe) organizationId: number,
    @Body() webhookData: WebhookDto,
  ) {
    return this.webhookService.handleWebhook(
      webhookData,
      botId,
      organizationId,
    );
  }
}
