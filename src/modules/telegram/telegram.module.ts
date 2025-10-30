import { Module } from '@nestjs/common';
import { TelegramService } from './telegram.service';
import { CoreModule } from '@/core/core.module';
import { CustomersService } from '@/modules/customers/customers.service';

@Module({
  imports: [CoreModule],
  providers: [TelegramService, CustomersService],
  exports: [TelegramService],
})
export class TelegramModule {}
