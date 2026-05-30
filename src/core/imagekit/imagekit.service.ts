import {
  Injectable,
  InternalServerErrorException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import ImageKit from 'imagekit';

export interface ImageKitUploadResult {
  /** Stable id used to delete the asset later. */
  externalId: string;
  /** Fully-qualified URL we can store as `File.key`. */
  url: string;
  /** Final filename ImageKit assigned (matches input when useUniqueFileName=false). */
  name: string;
  /** Reported size in bytes. */
  size: number;
  /** Server-side MIME if ImageKit detected it. */
  mimeType?: string;
}

/**
 * Thin wrapper around the ImageKit SDK so the rest of the app talks to a
 * provider-agnostic interface. Swapping providers (S3, R2, etc.) later means
 * replacing only this service.
 */
@Injectable()
export class ImageKitService implements OnModuleInit {
  private readonly logger = new Logger(ImageKitService.name);
  private client!: ImageKit;
  private folder!: string;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit(): void {
    const publicKey = this.configService.get<string>('IMAGEKIT_PUBLIC_KEY');
    const privateKey = this.configService.get<string>('IMAGEKIT_PRIVATE_KEY');
    const urlEndpoint = this.configService.get<string>('IMAGEKIT_URL_ENDPOINT');

    if (!publicKey || !privateKey || !urlEndpoint) {
      throw new Error(
        'IMAGEKIT_PUBLIC_KEY, IMAGEKIT_PRIVATE_KEY and IMAGEKIT_URL_ENDPOINT must all be set',
      );
    }

    this.client = new ImageKit({ publicKey, privateKey, urlEndpoint });
    this.folder =
      this.configService.get<string>('IMAGEKIT_FOLDER') ?? '/aletis';
  }

  async upload(
    buffer: Buffer,
    opts: { fileName: string; mimeType?: string },
  ): Promise<ImageKitUploadResult> {
    try {
      const result = await this.client.upload({
        file: buffer,
        fileName: opts.fileName,
        folder: this.folder,
        useUniqueFileName: false,
      });
      return {
        externalId: result.fileId,
        url: result.url,
        name: result.name,
        size: typeof result.size === 'number' ? result.size : buffer.length,
        mimeType: opts.mimeType,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`ImageKit upload failed: ${message}`);
      throw new InternalServerErrorException('Failed to upload file to storage');
    }
  }

  async delete(externalId: string): Promise<void> {
    try {
      await this.client.deleteFile(externalId);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Treat "not found" as success — the contract is "the file is gone".
      if (/not\s*found|does\s*not\s*exist|404/i.test(message)) {
        this.logger.warn(
          `ImageKit delete: file ${externalId} already absent (${message})`,
        );
        return;
      }
      this.logger.error(`ImageKit delete failed for ${externalId}: ${message}`);
      throw new InternalServerErrorException('Failed to delete file');
    }
  }
}
