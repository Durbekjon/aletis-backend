import { Module } from '@nestjs/common';
import { PostsController } from './posts.controller';
import { PostsService } from './posts.service';
import { PrismaModule } from '@/core/prisma/prisma.module';
import { CoreModule } from '@core/core.module';
import { TelegramModule } from '@telegram/telegram.module';
import { PostsScheduler } from './posts.scheduler';
import { ActivityLogModule } from '../activity-log/activity-log.module';

@Module({
  imports: [PrismaModule, CoreModule, TelegramModule, ActivityLogModule],
  controllers: [PostsController],
  providers: [PostsService, PostsScheduler],
  exports: [PostsService],
})
export class PostsModule {}
