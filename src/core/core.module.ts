import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { EncryptionService } from './encryption/encryption.service';
import { GeminiService } from './gemini/gemini.service';
import { RetryService } from './retry/retry.service';
import { SecurityModule } from './security/security.module';
import { LoggingModule } from './logging/logging.module';
import { WebhookHelperModule } from './webhook-helper/webhook-helper.module';
import { MessageBufferModule } from './message-buffer/message-buffer.module';
import { RedisModule } from './redis/redis.module';

@Module({
  imports: [
    PrismaModule,
    SecurityModule,
    LoggingModule,
    WebhookHelperModule,
    MessageBufferModule,
    RedisModule,
  ],
  providers: [EncryptionService, GeminiService, RetryService],
  exports: [
    PrismaModule,
    EncryptionService,
    GeminiService,
    RetryService,
    MessageBufferModule,
  ],
})
export class CoreModule {}
