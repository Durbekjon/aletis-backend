import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { TelegramModule } from './telegram/telegram.module';
import { OrdersModule } from './orders/orders.module';
import { ProductsModule } from './products/products.module';
import { ChannelsModule } from './channels/channels.module';
import { OrganizationsModule } from './organizations/organizations.module';

@Module({
  imports: [
    AuthModule,
    UsersModule,
    TelegramModule,
    OrdersModule,
    ProductsModule,
    ChannelsModule,
    OrganizationsModule,
  ],
})
export class ModulesModule {}
