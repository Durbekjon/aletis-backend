import { Module } from '@nestjs/common';
import { AuthModule } from '@auth/auth.module';
import { TelegramModule } from '@telegram/telegram.module';
import { ChannelsModule } from '@channels/channels.module';
import { OrganizationsModule } from '@organizations/organizations.module';
import { CategoriesModule } from '@modules/categories/categories.module';
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
import { EmbadingModule } from './embading/embading.module';
import { AiKeysModule } from './ai-keys/ai-keys.module';

@Module({
  imports: [
    AuthModule,
    OrganizationsModule,
    CategoriesModule,
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
    EmbadingModule,
    AiKeysModule,
  ],
})
export class ModulesModule {}
