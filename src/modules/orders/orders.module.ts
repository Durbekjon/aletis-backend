import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { CoreModule } from '../../core/core.module';
import { CacheModule } from '../../core/cache/cache.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [CoreModule, CacheModule, AuthModule],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
