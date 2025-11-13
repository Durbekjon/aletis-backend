import { Module } from '@nestjs/common';
import { InstagramController } from './instagram.controller';
import { InstagramService } from './instagram.service';
import { CoreModule } from '@/core/core.module';

@Module({
  imports: [CoreModule],
  controllers: [InstagramController],
  providers: [InstagramService],
  exports: [InstagramService],
})
export class InstagramModule {}

