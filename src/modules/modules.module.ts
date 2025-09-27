import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { TelegramModule } from './telegram/telegram.module';
import { OrdersModule } from './orders/orders.module';
import { ChannelsModule } from './channels/channels.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { SchemaModule } from './schema/schema.module';
import { FileModule } from './file/file.module';
import { ProductsModule } from './products/products.module';

@Module({
  imports: [
    AuthModule,
    OrganizationsModule,
    SchemaModule,
    FileModule,
    ProductsModule,

    // UsersModule,
    // TelegramModule,
    // OrdersModule,
    // ChannelsModule,
  ],
})
export class ModulesModule {}
