import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@/core/prisma/prisma.service';
import { ImageKitService } from '@/core/imagekit/imagekit.service';

/**
 * Lightweight delete helper used by services that don't want to depend on the
 * full FileModule (e.g. logo replacement in auth/organizations). Looks up the
 * file row by its `key` (the absolute CDN URL), removes the remote asset, and
 * deletes the DB row.
 */
@Injectable()
export class FileDeleteService {
  private readonly logger = new Logger(FileDeleteService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly imageKit: ImageKitService,
  ) {}

  async deleteFileByKey(key: string): Promise<void> {
    const file = await this.prisma.file.findUnique({ where: { key } });
    if (!file) {
      this.logger.warn(`File with key ${key} not found; nothing to delete`);
      return;
    }
    if (file.externalId) {
      await this.imageKit.delete(file.externalId).catch((err) => {
        this.logger.warn(
          `Remote delete failed for ${key}: ${err.message ?? err}`,
        );
      });
    }
    await this.prisma.file.delete({ where: { id: file.id } });
    this.logger.log(`Deleted file by key: ${key}`);
  }

  async deleteFilesByKeys(keys: string[]): Promise<void> {
    if (!keys?.length) return;
    await Promise.all(keys.map((key) => this.deleteFileByKey(key)));
  }
}
