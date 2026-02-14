import { Module } from '@nestjs/common';
import { PrismaModule } from '@/core/prisma/prisma.module';
import { SchemaController } from './schema.controller';
import { SchemaService } from './schema.service';
import { ActivityLogModule } from '../activity-log/activity-log.module';

@Module({
  imports: [PrismaModule, ActivityLogModule],
  controllers: [SchemaController],
  providers: [SchemaService],
  exports: [SchemaService],
})
export class SchemaModule {}
