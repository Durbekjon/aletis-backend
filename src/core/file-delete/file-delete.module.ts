import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '@/core/prisma/prisma.module';
import { ImageKitModule } from '@/core/imagekit/imagekit.module';
import { FileDeleteService } from './file-delete.service';

@Global()
@Module({
  imports: [PrismaModule, ImageKitModule],
  providers: [FileDeleteService],
  exports: [FileDeleteService],
})
export class FileDeleteModule {}
