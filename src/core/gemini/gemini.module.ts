import { Module } from '@nestjs/common';
import { PrismaModule } from '@/core/prisma/prisma.module';
import { AiKeysModule } from '@modules/ai-keys/ai-keys.module';
import { GeminiService } from './gemini.service';

@Module({
  imports: [PrismaModule, AiKeysModule],
  providers: [GeminiService],
  exports: [GeminiService],
})
export class GeminiModule {}
