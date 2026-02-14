import { Injectable, NotFoundException } from '@nestjs/common';
import { readFile } from 'fs/promises';
import * as path from 'path';

@Injectable()
export class ImageToBase64Service {
  async convert(filename: string): Promise<string> {
    try {
      // filename is treated as the relative path from project root (e.g., 'public/uploads/image.png')
      const filepath = path.join(process.cwd(), filename);
      const data = await readFile(filepath);
      return data.toString('base64');
    } catch (error) {
      throw new Error(`Failed to convert image to base64: ${error.message}`);
    }
  }
}
