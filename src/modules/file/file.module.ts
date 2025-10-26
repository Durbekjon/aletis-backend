import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { FileController } from './file.controller';
import { FileService } from './file.service';
import { PrismaModule } from '@/core/prisma/prisma.module';
import { multerConfig } from './config/multer.config';

@Module({
  imports: [PrismaModule, MulterModule.register(multerConfig)],
  controllers: [FileController],
  providers: [FileService],
  exports: [FileService],
})
export class FileModule {}
