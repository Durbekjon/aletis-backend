import { Module } from '@nestjs/common';
import { AuthModule } from '@auth/auth.module';
import { TelegramModule } from '@telegram/telegram.module';
import { ChannelsModule } from '@channels/channels.module';
import { OrganizationsModule } from '@organizations/organizations.module';
import { SchemaModule } from '@modules/product-schema/schema.module';
import { FileModule } from '@file/file.module';
import { ProductsModule } from '@products/products.module';
import { BotsModule } from '@bots/bots.module';
import { CustomersModule } from '@customers/customers.module';
import { WebhookModule } from '@webhook/webhook.module';
import { MessagesModule } from './messages/messages.module';
import { PostsModule } from './posts/posts.module';
import { OrdersModule } from './orders/orders.module';
import { OnboardingProgressModule } from './onboarding-progress/onboarding-progress.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { ActivityLogModule } from './activity-log/activity-log.module';

@Module({
  imports: [
    AuthModule,
    OrganizationsModule,
    SchemaModule,
    FileModule,
    ProductsModule,
    BotsModule,
    CustomersModule,
    TelegramModule,
    WebhookModule,
    MessagesModule,
    ChannelsModule,
    PostsModule,
    OrdersModule,
    OnboardingProgressModule,
    DashboardModule,
    AnalyticsModule,
    ActivityLogModule,
  ],
})
export class ModulesModule {}
