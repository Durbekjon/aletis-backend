import { Module } from '@nestjs/common';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { PrismaModule } from '@/core/prisma/prisma.module';
import { RedisModule } from '@/core/redis/redis.module';
import { FileDeleteModule } from '@/core/file-delete/file-delete.module';
import { ActivityLogModule } from '../activity-log/activity-log.module';
@Module({
  imports: [PrismaModule, RedisModule, FileDeleteModule, ActivityLogModule],
  controllers: [ProductsController],
  providers: [ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}
