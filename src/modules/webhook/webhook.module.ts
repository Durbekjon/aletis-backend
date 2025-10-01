import { Module } from '@nestjs/common';
import { WebhookController } from './webhook.controller';
import { WebhookService } from './webhook.service';
import { CoreModule } from '@core/core.module';
import { BotsModule } from '@modules/bots/bots.module';
import { CustomersModule } from '@modules/customers/customers.module';
import { MessagesModule } from '@modules/messages/messages.module';
import { ProductsModule } from '@modules/products/products.module';
import { TelegramModule } from '@modules/telegram/telegram.module';

@Module({
  imports:[CoreModule, BotsModule, CustomersModule,MessagesModule, ProductsModule, TelegramModule],
  controllers: [WebhookController],
  providers: [WebhookService],
  exports: [WebhookService]
})
export class WebhookModule {}
