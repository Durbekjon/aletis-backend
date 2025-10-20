import { Module } from '@nestjs/common';
import { TelegramService } from './telegram.service';
import { CoreModule } from '@/core/core.module';

@Module({
  imports: [CoreModule],
  providers: [TelegramService],
  exports: [TelegramService],
})
export class TelegramModule {}
