import { BadRequestException } from '@nestjs/common';
import { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import { memoryStorage } from 'multer';
import { Request } from 'express';

export const MAX_UPLOAD_FILE_SIZE_BYTES = 5 * 1024 * 1024;
export const MAX_UPLOAD_FILES_PER_REQUEST = 5;

export const ALLOWED_UPLOAD_MIME_TYPES: ReadonlySet<string> = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

/**
 * Uploads land in memory as a Buffer (file.buffer). The service then verifies
 * magic bytes and forwards to ImageKit — nothing touches local disk.
 */
export const multerConfig: MulterOptions = {
  storage: memoryStorage(),
  fileFilter: (
    req: Request,
    file: Express.Multer.File,
    cb: (error: Error | null, acceptFile: boolean) => void,
  ) => {
    if (!ALLOWED_UPLOAD_MIME_TYPES.has(file.mimetype)) {
      cb(
        new BadRequestException(
          `Unsupported file type: ${file.mimetype}. Allowed: ${[...ALLOWED_UPLOAD_MIME_TYPES].join(', ')}`,
        ),
        false,
      );
      return;
    }
    cb(null, true);
  },
  limits: {
    fileSize: MAX_UPLOAD_FILE_SIZE_BYTES,
    files: MAX_UPLOAD_FILES_PER_REQUEST,
  },
};
