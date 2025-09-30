import { Module } from '@nestjs/common';
import { BotsController } from './bots.controller';
import { BotsService } from './bots.service';
import { WebhookModule } from '@core/webhook/webhook.module';
import { ConfigService } from '@nestjs/config';
import { EncryptionService } from '@core/encryption/encryption.service';

@Module({
  imports:[WebhookModule],
  controllers: [BotsController],
  providers: [BotsService,EncryptionService, ConfigService],
  exports:[BotsService]
})
export class BotsModule {}
