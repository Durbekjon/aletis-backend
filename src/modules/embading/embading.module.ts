import { Module } from '@nestjs/common';
import { EmbadingService } from './embading.service';
import { CoreModule } from '@core/core.module';

@Module({
  imports:[CoreModule],
  providers: [EmbadingService],
  exports: [EmbadingService],
})
export class EmbadingModule {}
