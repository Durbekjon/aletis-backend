import { Injectable, Logger } from '@nestjs/common';
import * as path from 'path';
import * as fs from 'fs/promises';

@Injectable()
export class FileDeleteService {
  private readonly logger = new Logger(FileDeleteService.name);
  // Only allow deletes within this base directory
  private readonly uploadsDir = path.resolve(__dirname, '@/public/uploads');

  /**
   * Deletes a single file, specified by its key (filename or relative path)
   */
  async deleteFileByKey(key: string): Promise<void> {
    const filePath = this.getSafeFilePath(key);
    try {
      await fs.unlink(filePath);
      this.logger.log(`Deleted file: ${filePath}`);
    } catch (error) {
      // ENOENT = file not found: not a fatal error for delete
      if (error.code !== 'ENOENT') {
        this.logger.warn(`Failed to delete file: ${filePath}`, error);
      }
    }
  }

  /**
   * Deletes multiple files concurrently.
   */
  async deleteFilesByKeys(keys: string[]): Promise<void> {
    if (!keys?.length) return;
    // Concurrently delete files (with Promise.all)
    await Promise.all(
      keys.map((key) => this.deleteFileByKey(key))
    );
  }

  /**
   * Prevents directory traversal attacks; returns only safe paths inside uploadsDir
   */
  private getSafeFilePath(key: string): string {
    const sanitizedKey = path.basename(key); // Only allow filename, drop any dirs
    const fullPath = path.join(this.uploadsDir, sanitizedKey);
    // Extra security: ensure file is within uploadsDir
    if (!fullPath.startsWith(this.uploadsDir)) {
      throw new Error('Invalid file key/path');
    }
    return fullPath;
  }
}
