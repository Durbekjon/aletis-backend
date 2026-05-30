import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';
import { PrismaService } from '@/core/prisma/prisma.service';
import { FileType, FileStatus } from '@prisma/client';
import { UploadFileResponseDto, FilePaginatedResponseDto } from './dto';
import { PaginationDto } from '@/shared/dto';
import { extname, basename } from 'path';
import { ALLOWED_UPLOAD_MIME_TYPES } from './config/multer.config';
import { bufferMatchesMime } from './utils/magic-bytes.util';
import { ImageKitService } from '@/core/imagekit/imagekit.service';

@Injectable()
export class FileService {
  private readonly logger = new Logger(FileService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly imageKit: ImageKitService,
  ) {}

  private getFileType(mimeType: string): FileType {
    if (mimeType.startsWith('image/')) return FileType.IMAGE;
    if (mimeType.startsWith('video/')) return FileType.VIDEO;
    if (mimeType.startsWith('audio/')) return FileType.AUDIO;
    if (
      mimeType.includes('pdf') ||
      mimeType.includes('document') ||
      mimeType.includes('text') ||
      mimeType.includes('spreadsheet') ||
      mimeType.includes('presentation')
    ) {
      return FileType.DOCUMENT;
    }
    return FileType.OTHER;
  }

  /**
   * Build a unique filename. ImageKit is told `useUniqueFileName=false` so the
   * uniqueness we add here is what survives.
   */
  private generateUniqueFilename(originalName: string): string {
    const cleaned = originalName.replace(/\s+/g, '_');
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 15);
    const ext = extname(cleaned);
    const base = basename(cleaned, ext);
    return `${base}_${timestamp}_${random}${ext}`;
  }

  /**
   * Validate + upload a multer file to ImageKit, persist a File row.
   */
  async uploadFile(
    file: Express.Multer.File,
    uploaderId?: number,
    organizationId?: number,
    productId?: number,
  ): Promise<UploadFileResponseDto> {
    if (!ALLOWED_UPLOAD_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException(
        `Unsupported file type: ${file.mimetype}`,
      );
    }
    if (!file.buffer || file.buffer.length === 0) {
      throw new BadRequestException('Empty upload');
    }
    if (!bufferMatchesMime(file.buffer, file.mimetype)) {
      throw new BadRequestException(
        'File content does not match its declared type',
      );
    }
    return this.persistBuffer(file.buffer, {
      originalName: file.originalname,
      mimeType: file.mimetype,
      uploaderId,
      organizationId,
      productId,
    });
  }

  async uploadManyFiles(
    files: Express.Multer.File[],
    uploaderId?: number,
    organizationId?: number,
    productId?: number,
  ): Promise<UploadFileResponseDto[]> {
    if (!files || files.length === 0) {
      throw new BadRequestException('No files provided');
    }
    return Promise.all(
      files.map((file) =>
        this.uploadFile(file, uploaderId, organizationId, productId),
      ),
    );
  }

  /**
   * Save a file we downloaded from elsewhere (e.g. Telegram product image).
   */
  async saveDownloadedFile(
    buffer: Buffer,
    originalName: string,
    mimeType: string,
    organizationId?: number,
    uploaderId?: number,
  ): Promise<UploadFileResponseDto> {
    if (!ALLOWED_UPLOAD_MIME_TYPES.has(mimeType)) {
      throw new BadRequestException(`Unsupported file type: ${mimeType}`);
    }
    if (!bufferMatchesMime(buffer, mimeType)) {
      throw new BadRequestException(
        'Downloaded file content does not match its declared type',
      );
    }
    return this.persistBuffer(buffer, {
      originalName,
      mimeType,
      uploaderId,
      organizationId,
    });
  }

  private async persistBuffer(
    buffer: Buffer,
    opts: {
      originalName: string;
      mimeType: string;
      uploaderId?: number;
      organizationId?: number;
      productId?: number;
    },
  ): Promise<UploadFileResponseDto> {
    const fileName = this.generateUniqueFilename(opts.originalName);
    const uploaded = await this.imageKit.upload(buffer, {
      fileName,
      mimeType: opts.mimeType,
    });

    try {
      const saved = await this.prisma.file.create({
        data: {
          key: uploaded.url,
          externalId: uploaded.externalId,
          originalName: opts.originalName,
          size: uploaded.size,
          mimeType: opts.mimeType,
          type: this.getFileType(opts.mimeType),
          status: FileStatus.READY,
          uploaderId: opts.uploaderId,
          organizationId: opts.organizationId,
          productId: opts.productId,
        },
      });
      this.logger.log(`File uploaded: id=${saved.id}, externalId=${saved.externalId}`);
      return saved;
    } catch (err) {
      // DB write failed after a successful ImageKit upload — roll back the
      // remote asset so we don't accumulate orphans.
      await this.imageKit
        .delete(uploaded.externalId)
        .catch((cleanupErr) =>
          this.logger.warn(
            `Failed to roll back ImageKit upload ${uploaded.externalId}: ${cleanupErr.message}`,
          ),
        );
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to persist file row: ${message}`);
      throw new InternalServerErrorException('Failed to record uploaded file');
    }
  }

  async deleteFile(fileId: number): Promise<void> {
    const file = await this.prisma.file.findUnique({ where: { id: fileId } });
    if (!file) {
      throw new NotFoundException(`File with ID ${fileId} not found`);
    }
    await this.removeRemoteThenRow(file);
  }

  async deleteFileByKey(key: string): Promise<void> {
    const file = await this.prisma.file.findUnique({ where: { key } });
    if (!file) {
      throw new NotFoundException(`File with key ${key} not found`);
    }
    await this.removeRemoteThenRow(file);
  }

  async deleteManyFiles(fileIds: number[]): Promise<void> {
    if (!fileIds || fileIds.length === 0) {
      throw new BadRequestException('No file IDs provided');
    }
    const files = await this.prisma.file.findMany({
      where: { id: { in: fileIds } },
    });
    if (files.length !== fileIds.length) {
      const found = new Set(files.map((f) => f.id));
      const missing = fileIds.filter((id) => !found.has(id));
      throw new NotFoundException(`Files not found: ${missing.join(', ')}`);
    }
    await Promise.all(files.map((file) => this.removeRemoteThenRow(file)));
  }

  private async removeRemoteThenRow(file: {
    id: number;
    externalId: string | null;
  }): Promise<void> {
    if (file.externalId) {
      await this.imageKit.delete(file.externalId);
    }
    await this.prisma.file.delete({ where: { id: file.id } });
    this.logger.log(`File deleted: id=${file.id}`);
  }

  async getFileById(fileId: number): Promise<UploadFileResponseDto> {
    const file = await this.prisma.file.findUnique({ where: { id: fileId } });
    if (!file) {
      throw new NotFoundException(`File with ID ${fileId} not found`);
    }
    return file;
  }

  async getFileByKey(key: string): Promise<UploadFileResponseDto> {
    const file = await this.prisma.file.findUnique({ where: { key } });
    if (!file) {
      throw new NotFoundException(`File with key ${key} not found`);
    }
    return file;
  }

  async getFilesByOrganization(
    organizationId: number,
  ): Promise<UploadFileResponseDto[]> {
    return this.prisma.file.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getFilesByUploader(
    uploaderId: number,
  ): Promise<UploadFileResponseDto[]> {
    return this.prisma.file.findMany({
      where: { uploaderId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getRecentFiles(
    userId: number,
    paginationDto: PaginationDto,
  ): Promise<FilePaginatedResponseDto> {
    const { page, limit, search, order } = paginationDto;
    const where: any = { uploaderId: userId };
    if (search && search.trim()) {
      where.originalName = {
        contains: search.trim(),
        mode: 'insensitive',
      };
    }
    const [files, total] = await Promise.all([
      this.prisma.file.findMany({
        where,
        orderBy: { createdAt: order },
        skip: paginationDto.skip,
        take: paginationDto.take,
      }),
      this.prisma.file.count({ where }),
    ]);
    return new FilePaginatedResponseDto(files, total, page || 1, limit || 20);
  }

  async getRecentFilesByUploader(
    uploaderId: number,
    paginationDto: PaginationDto,
  ): Promise<FilePaginatedResponseDto> {
    return this.getRecentFiles(uploaderId, paginationDto);
  }
}
