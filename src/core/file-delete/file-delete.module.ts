import { Global, Module } from '@nestjs/common';
import { FileDeleteService } from './file-delete.service';

@Global()
@Module({
  providers: [FileDeleteService],
  exports: [FileDeleteService],
})
export class FileDeleteModule {}
