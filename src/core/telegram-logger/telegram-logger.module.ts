import { Global, Module } from '@nestjs/common';
import { TelegramLoggerService } from './telegram-logger.service';
import { ConfigModule } from '@nestjs/config';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [TelegramLoggerService],
  exports: [TelegramLoggerService],
})
export class TelegramLoggerModule {}

