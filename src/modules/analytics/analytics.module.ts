import { Module } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { AnalyticsController } from './analytics.controller';
import { PrismaModule } from '@core/prisma/prisma.module';
import { RedisModule } from '@core/redis/redis.module';
import { AnalyticsScheduler } from './analytics.scheduler';

@Module({
  imports: [PrismaModule, RedisModule],
  controllers: [AnalyticsController],
  providers: [AnalyticsService, AnalyticsScheduler],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}


