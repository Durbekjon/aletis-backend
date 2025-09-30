import { Module } from '@nestjs/common';
import { TelegramController } from './telegram.controller';
import { TelegramService } from './telegram.service';
import { EncryptionService } from '@core/encryption/encryption.service';
import { RetryService } from '@core/retry/retry.service';
import { OrdersService } from '@modules/orders/orders.service';
import { ChannelsService } from '@modules/channels/channels.service';
import { CoreModule } from '../../core/core.module';
import { OrdersModule } from '../orders/orders.module';
import { ProductsModule } from '../products/products.module';
import { ChannelsModule } from '../channels/channels.module';
import { CacheService } from '@core/cache/cache.service';

@Module({
  imports: [CoreModule, OrdersModule, ProductsModule, ChannelsModule],
  controllers: [TelegramController],
  providers: [TelegramService, EncryptionService,RetryService,OrdersService,ChannelsService, CacheService],
  exports: [TelegramService],
})
export class TelegramModule {}
