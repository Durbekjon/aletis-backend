import { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { Request } from 'express';

export const multerConfig: MulterOptions = {
  storage: diskStorage({
    destination: (req:Request, file:Express.Multer.File, cb:any) => {
      const uploadPath = join(process.cwd(), 'public', 'uploads');
      
      // Create directory if it doesn't exist
      if (!existsSync(uploadPath)) {
        mkdirSync(uploadPath, { recursive: true });
      }
      
      cb(null, uploadPath);
    },
    filename: (req: Request, file: Express.Multer.File, cb: (error: Error | null, filename: string) => void) => {
      // Generate unique filename
      const timestamp = Date.now();
      const randomString = Math.random().toString(36).substring(2, 15);
      const extension = extname(file.originalname);
      const baseName = file.originalname.replace(extension, '');
      const uniqueFilename = `${baseName}_${timestamp}_${randomString}${extension}`;
      
      cb(null, uniqueFilename);
    },
  }),
  fileFilter: (req: Request, file: Express.Multer.File, cb: (error: Error | null, acceptFile: boolean) => void) => {
    // Allow all file types for now, but you can add restrictions here
    // Example: only allow images
    // if (file.mimetype.match(/\/(jpg|jpeg|png|gif)$/)) {
    //   cb(null, true);
    // } else {
    //   cb(new Error('Only image files are allowed!'), false);
    // }
    cb(null, true);
  },
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
    files: 10, // Maximum 10 files per request
  },
};
