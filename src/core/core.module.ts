import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { HealthController } from './health/health.controller';
import { EncryptionService } from './encryption/encryption.service';
import { GeminiService } from './gemini/gemini.service';
import { RetryService } from './retry/retry.service';
import { SecurityModule } from './security/security.module';
import { LoggingModule } from './logging/logging.module';
import { WebhookHelperModule } from './webhook-helper/webhook-helper.module';

@Module({
  imports: [PrismaModule, SecurityModule, LoggingModule, WebhookHelperModule],
  controllers: [HealthController],
  providers: [EncryptionService, GeminiService, RetryService],
  exports: [PrismaModule, EncryptionService, GeminiService, RetryService],
})
export class CoreModule {}
