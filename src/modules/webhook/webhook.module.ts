import { Module } from '@nestjs/common';
import { WebhookController } from './webhook.controller';
import { WebhookService } from './webhook.service';
import { AiResponseHandlerService } from './ai-response-handler.service';
import { CoreModule } from '@core/core.module';
import { BotsModule } from '@modules/bots/bots.module';
import { CustomersModule } from '@modules/customers/customers.module';
import { MessagesModule } from '@modules/messages/messages.module';
import { ProductsModule } from '@modules/products/products.module';
import { TelegramModule } from '@modules/telegram/telegram.module';
import { OrdersModule } from '@modules/orders/orders.module';

@Module({
  imports: [
    CoreModule,
    BotsModule,
    CustomersModule,
    MessagesModule,
    ProductsModule,
    TelegramModule,
    OrdersModule,
  ],
  controllers: [WebhookController],
  providers: [WebhookService, AiResponseHandlerService],
  exports: [WebhookService, AiResponseHandlerService],
})
export class WebhookModule {}
