import {
  Body,
  Controller,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { WebhookDto } from './dto/webhook.dto';
import { WebhookService } from './webhook.service';
import { WebhookSignatureGuard } from './guards/webhook-signature.guard';

@ApiExcludeController()
@Controller({ path: 'webhook', version: '1' })
export class WebhookController {
  constructor(private readonly webhookService: WebhookService) {}

  @Post(':botId/:organizationId')
  @UseGuards(WebhookSignatureGuard)
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
