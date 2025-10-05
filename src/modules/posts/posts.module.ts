import { Module } from '@nestjs/common';
import { PostsController } from './posts.controller';
import { PostsService } from './posts.service';
import { PrismaModule } from '../../core/prisma/prisma.module';
import { CoreModule } from '@core/core.module';
import { TelegramModule } from '@telegram/telegram.module';
import { PostsScheduler } from './posts.scheduler';

@Module({
  imports: [PrismaModule, CoreModule, TelegramModule],
  controllers: [PostsController],
  providers: [PostsService, PostsScheduler],
  exports: [PostsService],
})
export class PostsModule {}


