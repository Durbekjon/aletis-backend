import { Module } from '@nestjs/common';
import { PrismaModule } from '@/core/prisma/prisma.module';
import { SchemaController } from './schema.controller';
import { SchemaService } from './schema.service';

@Module({
  imports: [PrismaModule],
  controllers: [SchemaController],
  providers: [SchemaService],
  exports: [SchemaService]
})
export class SchemaModule {}
