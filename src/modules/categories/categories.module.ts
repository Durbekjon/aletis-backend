import { Module } from '@nestjs/common';
import { CoreModule } from '@core/core.module';
import { RedisModule } from '@core/redis/redis.module';
import { CategoriesController } from './categories.controller';
import { AdminCategoriesController } from './admin-categories.controller';
import { CategoriesService } from './categories.service';
import { PlatformAdminGuard } from '@auth/guards/platform-admin.guard';

@Module({
  imports: [CoreModule, RedisModule],
  controllers: [CategoriesController, AdminCategoriesController],
  providers: [CategoriesService, PlatformAdminGuard],
  exports: [CategoriesService],
})
export class CategoriesModule {}
