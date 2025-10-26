import { Module } from '@nestjs/common';
import { BotsController } from './bots.controller';
import { BotsService } from './bots.service';
import { WebhookHelperModule } from '@core/webhook-helper/webhook-helper.module';
import { ConfigService } from '@nestjs/config';
import { EncryptionService } from '@core/encryption/encryption.service';
import { RedisModule } from '@core/redis/redis.module';
@Module({
  imports: [WebhookHelperModule, RedisModule],
  controllers: [BotsController],
  providers: [BotsService, EncryptionService, ConfigService],
  exports: [BotsService],
})
export class BotsModule {}
