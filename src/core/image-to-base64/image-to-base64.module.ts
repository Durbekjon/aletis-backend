import { Module } from '@nestjs/common';
import { ImageToBase64Service } from './image-to-base64.service';

@Module({
  providers: [ImageToBase64Service],
  exports: [ImageToBase64Service],
})
export class ImageToBase64Module {}
