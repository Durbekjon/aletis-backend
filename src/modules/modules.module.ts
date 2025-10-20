import { Module } from '@nestjs/common';
import { AuthModule } from '@auth/auth.module';
// import { UsersModule } from '@users/users.module';
import { TelegramModule } from '@telegram/telegram.module';
// import { OrdersModule } from '@orders/orders.module';
import { ChannelsModule } from '@channels/channels.module';
import { OrganizationsModule } from '@organizations/organizations.module';
import { SchemaModule } from '@schema/schema.module';
import { FileModule } from '@file/file.module';
import { ProductsModule } from '@products/products.module';
import { BotsModule } from '@bots/bots.module';
import { CustomersModule } from '@customers/customers.module';
import { WebhookModule } from '@webhook/webhook.module';
import { MessagesModule } from './messages/messages.module';
import { PostsModule } from './posts/posts.module';
import { OrdersModule } from './orders/orders.module';
import { OnboardingProgressModule } from './onboarding-progress/onboarding-progress.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    AuthModule,
    OrganizationsModule,
    SchemaModule,
    FileModule,
    ProductsModule,
    BotsModule,
    CustomersModule,

    // UsersModule,
    TelegramModule,

    WebhookModule,

    MessagesModule,

    // OrdersModule,
    ChannelsModule,
    PostsModule,
    OrdersModule,
    OnboardingProgressModule,
    HealthModule,
  ],
})
export class ModulesModule {}
