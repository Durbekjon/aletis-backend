import { Module } from '@nestjs/common';
import { TelegramService } from './telegram.service';
import { CoreModule } from '@/core/core.module';
import { CustomersService } from '@/modules/customers/customers.service';
import { FileModule } from '@/modules/file/file.module';

@Module({
  imports: [CoreModule, FileModule],
  providers: [TelegramService, CustomersService],
  exports: [TelegramService],
})
export class TelegramModule {}
