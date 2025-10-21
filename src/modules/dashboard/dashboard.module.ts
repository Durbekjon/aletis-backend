import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { CoreModule } from '@core/core.module';
import { AuthModule } from '@auth/auth.module';

@Module({
  imports:[CoreModule, AuthModule],
  controllers: [DashboardController],
  providers: [DashboardService]
})
export class DashboardModule {}
