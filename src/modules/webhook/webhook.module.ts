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
import { EmbadingModule } from '@modules/embading/embading.module';
import { GeminiModule } from '@core/gemini/gemini.module';
import { WebhookSignatureGuard } from './guards/webhook-signature.guard';
import { CustomerSyncService } from './services/customer-sync.service';

@Module({
  imports: [
    CoreModule,
    GeminiModule,
    BotsModule,
    CustomersModule,
    MessagesModule,
    ProductsModule,
    TelegramModule,
    OrdersModule,
    EmbadingModule,
  ],
  controllers: [WebhookController],
  providers: [
    WebhookService,
    AiResponseHandlerService,
    WebhookSignatureGuard,
    CustomerSyncService,
  ],
  exports: [WebhookService, AiResponseHandlerService],
})
export class WebhookModule {}
