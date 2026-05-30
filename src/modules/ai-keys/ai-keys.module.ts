import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { CoreModule } from '@core/core.module';
import { AiKeysController } from './ai-keys.controller';
import { AiKeysService } from './ai-keys.service';
import { AiKeyManagerService } from './ai-key-manager.service';
import { PlatformAdminGuard } from '@auth/guards/platform-admin.guard';

@Module({
  imports: [CoreModule, ScheduleModule.forRoot()],
  controllers: [AiKeysController],
  providers: [AiKeysService, AiKeyManagerService, PlatformAdminGuard],
  exports: [AiKeyManagerService],
})
export class AiKeysModule {}
