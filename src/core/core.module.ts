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
import { FileDeleteModule } from './file-delete/file-delete.module';
import { TelegramLoggerModule } from './telegram-logger/telegram-logger.module';
import { ImageToBase64Module } from './image-to-base64/image-to-base64.module';

@Module({
  imports: [
    PrismaModule,
    SecurityModule,
    LoggingModule,
    WebhookHelperModule,
    MessageBufferModule,
    RedisModule,
    FileDeleteModule,
    TelegramLoggerModule,
    ImageToBase64Module,
  ],
  providers: [EncryptionService, GeminiService, RetryService],
  exports: [
    PrismaModule,
    EncryptionService,
    GeminiService,
    RetryService,
    MessageBufferModule,
    ImageToBase64Module,
  ],
})
export class CoreModule {}
