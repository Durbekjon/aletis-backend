import { Logger, Module } from '@nestjs/common';
import { WebhookService } from './webhook.service';

@Module({
  providers: [WebhookService, Logger],
  exports:[WebhookService]
})
export class WebhookModule {}
