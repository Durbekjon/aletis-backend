import { Logger, Module } from '@nestjs/common';
import { WebhookHelperService } from './webhook-helper.service';

@Module({
  providers: [WebhookHelperService, Logger],
  exports:[WebhookHelperService]
})
export class WebhookHelperModule {}
