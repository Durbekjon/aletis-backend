import { Module } from '@nestjs/common';
import { ChannelsService } from './channels.service';
import { ChannelsController } from './channels.controller';
import { AuthModule } from '@auth/auth.module';
import { CoreModule } from '@core/core.module';
import { ActivityLogModule } from '../activity-log/activity-log.module';

@Module({
  imports: [AuthModule, CoreModule, ActivityLogModule],
  controllers: [ChannelsController],
  providers: [ChannelsService],
  exports: [ChannelsService],
})
export class ChannelsModule {}
