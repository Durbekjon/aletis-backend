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
import { PaginationDto, PaginatedResponseDto } from '@/shared/dto';
import * as fs from 'fs/promises';
import * as path from 'path';
import { promisify } from 'util';
import { unlink } from 'fs';

const unlinkAsync = promisify(unlink);

export interface UploadFileData {
  originalName: string;
  size: number;
  mimeType: string;
  key: string;
  uploaderId?: number;
  organizationId?: number;
  productId?: number;
  type?: FileType;
}

@Injectable()
export class FileService {
  private readonly logger = new Logger(FileService.name);
  private readonly uploadsDir = path.join(process.cwd(), 'public', 'uploads');

  constructor(private readonly prisma: PrismaService) {
    this.ensureUploadsDirectory();
  }

  /**
   * Ensures the uploads directory exists
   */
  private async ensureUploadsDirectory(): Promise<void> {
    try {
      await fs.access(this.uploadsDir);
    } catch {
      await fs.mkdir(this.uploadsDir, { recursive: true });
      this.logger.log(`Created uploads directory: ${this.uploadsDir}`);
    }
  }

  /**
   * Determines file type based on MIME type
   */
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
   * Generates a unique filename to prevent conflicts
   */
  private generateUniqueFilename(originalName: string): string {
    originalName = originalName.replace(/\s+/g, '_');

    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substring(2, 15);
    const extension = path.extname(originalName);
    const baseName = path.basename(originalName, extension);
    return `${baseName}_${timestamp}_${randomString}${extension}`;
  }

  /**
   * Uploads a single file and saves metadata to database
   */
  async uploadFile(
    file: Express.Multer.File,
    uploaderId?: number,
    organizationId?: number,
    productId?: number,
  ): Promise<UploadFileResponseDto> {
    try {
      const uniqueFilename = this.generateUniqueFilename(file.originalname);
      const fileKey = `public/uploads/${uniqueFilename}`;
      const filePath = path.join(process.cwd(), fileKey);

      // Move file to permanent location
      await fs.rename(file.path, filePath);

      // Determine file type
      const fileType = this.getFileType(file.mimetype);

      // Save metadata to database
      const savedFile = await this.prisma.file.create({
        data: {
          key: fileKey,
          originalName: file.originalname,
          size: file.size,
          mimeType: file.mimetype,
          type: fileType,
          status: FileStatus.READY,
          uploaderId,
          organizationId,
          productId,
        },
      });

      this.logger.log(
        `File uploaded successfully: ${savedFile.id} - ${fileKey}`,
      );

      return savedFile;
    } catch (error) {
      this.logger.error(`Failed to upload file: ${error.message}`, error.stack);

      // Clean up file if it exists
      try {
        if (file?.path) {
          await unlinkAsync(file.path);
        }
      } catch (cleanupError) {
        this.logger.warn(`Failed to cleanup file: ${cleanupError.message}`);
      }

      throw new InternalServerErrorException('Failed to upload file');
    }
  }

  /**
   * Saves a downloaded file from URL/buffer to filesystem and database
   */
  async saveDownloadedFile(
    buffer: Buffer,
    originalName: string,
    mimeType: string,
    organizationId?: number,
    uploaderId?: number,
  ): Promise<UploadFileResponseDto> {
    this.logger.log(
      `[saveDownloadedFile] Starting: originalName=${originalName}, size=${buffer.length}, mimeType=${mimeType}, organizationId=${organizationId}, uploaderId=${uploaderId}`,
    );
    try {
      const uniqueFilename = this.generateUniqueFilename(originalName);
      const fileKey = `public/uploads/${uniqueFilename}`;
      const filePath = path.join(process.cwd(), fileKey);

      this.logger.log(`[saveDownloadedFile] Generated unique filename: ${uniqueFilename}, fileKey: ${fileKey}`);

      // Ensure directory exists
      await this.ensureUploadsDirectory();

      // Write buffer to file
      this.logger.log(`[saveDownloadedFile] Writing buffer to file: ${filePath}`);
      await fs.writeFile(filePath, buffer);

      // Determine file type
      const fileType = this.getFileType(mimeType);
      this.logger.log(`[saveDownloadedFile] File type determined: ${fileType}`);

      // Save metadata to database
      this.logger.log(`[saveDownloadedFile] Creating file record in database`);
      const savedFile = await this.prisma.file.create({
        data: {
          key: fileKey,
          originalName,
          size: buffer.length,
          mimeType,
          type: fileType,
          status: FileStatus.READY,
          uploaderId,
          organizationId,
        },
      });

      this.logger.log(
        `[saveDownloadedFile] SUCCESS: File saved with id=${savedFile.id}, key=${fileKey}, size=${savedFile.size}`,
      );

      return savedFile;
    } catch (error) {
      this.logger.error(
        `[saveDownloadedFile] ERROR: Failed to save downloaded file: ${error.message}`,
        error.stack,
      );
      this.logger.error(
        `[saveDownloadedFile] ERROR DETAILS: originalName=${originalName}, size=${buffer.length}, organizationId=${organizationId}, errorType=${error.constructor.name}`,
      );
      throw new InternalServerErrorException('Failed to save downloaded file');
    }
  }

  /**
   * Uploads multiple files and saves metadata to database
   */
  async uploadManyFiles(
    files: Express.Multer.File[],
    uploaderId?: number,
    organizationId?: number,
    productId?: number,
  ): Promise<UploadFileResponseDto[]> {
    if (!files || files.length === 0) {
      throw new BadRequestException('No files provided');
    }

    const uploadPromises = files.map((file) =>
      this.uploadFile(file, uploaderId, organizationId, productId),
    );

    try {
      const results = await Promise.all(uploadPromises);
      this.logger.log(`Successfully uploaded ${results.length} files`);
      return results;
    } catch (error) {
      this.logger.error(`Failed to upload multiple files: ${error.message}`);
      throw new InternalServerErrorException('Failed to upload files');
    }
  }

  /**
   * Deletes a file by ID (removes from database and filesystem)
   */
  async deleteFile(fileId: number): Promise<void> {
    try {
      const file = await this.prisma.file.findUnique({
        where: { id: fileId },
      });

      if (!file) {
        throw new NotFoundException(`File with ID ${fileId} not found`);
      }

      // Delete from database first
      await this.prisma.file.delete({
        where: { id: fileId },
      });

      // Delete from filesystem
      const filePath = path.join(process.cwd(), file.key);
      try {
        await unlinkAsync(filePath);
        this.logger.log(`File deleted successfully: ${fileId} - ${file.key}`);
      } catch (fsError) {
        this.logger.warn(`File not found on filesystem: ${file.key}`);
        // Don't throw error if file doesn't exist on filesystem
      }
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(`Failed to delete file ${fileId}: ${error.message}`);
      throw new InternalServerErrorException('Failed to delete file');
    }
  }

  /**
   * Deletes a file by key (removes from database and filesystem)
   */
  async deleteFileByKey(key: string): Promise<void> {
    try {
      const file = await this.prisma.file.findUnique({
        where: { key },
      });

      if (!file) {
        throw new NotFoundException(`File with key ${key} not found`);
      }

      // Delete from database first
      await this.prisma.file.delete({
        where: { key },
      });

      // Delete from filesystem
      const filePath = path.join(process.cwd(), key);
      try {
        await unlinkAsync(filePath);
        this.logger.log(`File deleted successfully by key: ${key}`);
      } catch (fsError) {
        this.logger.warn(`File not found on filesystem: ${key}`);
        // Don't throw error if file doesn't exist on filesystem
      }
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to delete file by key ${key}: ${error.message}`,
      );
      throw new InternalServerErrorException('Failed to delete file');
    }
  }

  /**
   * Deletes multiple files by IDs in a transaction
   */
  async deleteManyFiles(fileIds: number[]): Promise<void> {
    if (!fileIds || fileIds.length === 0) {
      throw new BadRequestException('No file IDs provided');
    }

    try {
      // Get all files first to check existence and get keys
      const files = await this.prisma.file.findMany({
        where: { id: { in: fileIds } },
        select: { id: true, key: true },
      });

      if (files.length !== fileIds.length) {
        const foundIds = files.map((f) => f.id);
        const missingIds = fileIds.filter((id) => !foundIds.includes(id));
        throw new NotFoundException(
          `Files not found: ${missingIds.join(', ')}`,
        );
      }

      // Delete from database in transaction
      await this.prisma.$transaction(
        fileIds.map((id) =>
          this.prisma.file.delete({
            where: { id },
          }),
        ),
      );

      // Delete from filesystem
      const deletePromises = files.map(async (file) => {
        const filePath = path.join(process.cwd(), file.key);
        try {
          await unlinkAsync(filePath);
          this.logger.log(
            `File deleted successfully: ${file.id} - ${file.key}`,
          );
        } catch (fsError) {
          this.logger.warn(`File not found on filesystem: ${file.key}`);
          // Don't throw error if file doesn't exist on filesystem
        }
      });

      await Promise.all(deletePromises);
      this.logger.log(`Successfully deleted ${files.length} files`);
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      this.logger.error(`Failed to delete multiple files: ${error.message}`);
      throw new InternalServerErrorException('Failed to delete files');
    }
  }

  /**
   * Gets file metadata by ID
   */
  async getFileById(fileId: number): Promise<UploadFileResponseDto> {
    const file = await this.prisma.file.findUnique({
      where: { id: fileId },
    });

    if (!file) {
      throw new NotFoundException(`File with ID ${fileId} not found`);
    }

    return file;
  }

  /**
   * Gets file metadata by key
   */
  async getFileByKey(key: string): Promise<UploadFileResponseDto> {
    const file = await this.prisma.file.findUnique({
      where: { key },
    });

    if (!file) {
      throw new NotFoundException(`File with key ${key} not found`);
    }

    return file;
  }

  /**
   * Gets files by organization ID
   */
  async getFilesByOrganization(
    organizationId: number,
  ): Promise<UploadFileResponseDto[]> {
    return this.prisma.file.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Gets files by uploader ID
   */
  async getFilesByUploader(
    uploaderId: number,
  ): Promise<UploadFileResponseDto[]> {
    return this.prisma.file.findMany({
      where: { uploaderId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Gets recent files with pagination, search, and ordering
   * Only returns files belonging to the authenticated user's organization
   */
  async getRecentFiles(
    userId: number,
    paginationDto: PaginationDto,
  ): Promise<FilePaginatedResponseDto> {
    try {
      const { page, limit, search, order } = paginationDto;
      const skip = paginationDto.skip;
      const take = paginationDto.take;

      // Build the where clause
      const where: any = {
        uploaderId: userId,
      };

      // Add search filter if provided
      if (search && search.trim()) {
        where.originalName = {
          contains: search.trim(),
          mode: 'insensitive', // Case-insensitive search
        };
      }

      // Build the orderBy clause
      const orderBy = {
        createdAt: order,
      };

      // Execute queries in parallel for better performance
      const [files, total] = await Promise.all([
        this.prisma.file.findMany({
          where,
          orderBy,
          skip,
          take,
        }),
        this.prisma.file.count({
          where,
        }),
      ]);

      this.logger.log(
        `Retrieved ${files.length} files for uploader ${userId} (page ${page}, total: ${total})`,
      );

      return new FilePaginatedResponseDto(files, total, page || 1, limit || 20);
    } catch (error) {
      this.logger.error(
        `Failed to get recent files for uploader ${userId}: ${error.message}`,
        error.stack,
      );
      throw new InternalServerErrorException('Failed to retrieve files');
    }
  }

  /**
   * Gets recent files by uploader with pagination, search, and ordering
   */
  async getRecentFilesByUploader(
    uploaderId: number,
    paginationDto: PaginationDto,
  ): Promise<FilePaginatedResponseDto> {
    try {
      const { page, limit, search, order } = paginationDto;
      const skip = paginationDto.skip;
      const take = paginationDto.take;

      // Build the where clause
      const where: any = {
        uploaderId: uploaderId,
      };

      // Add search filter if provided
      if (search && search.trim()) {
        where.originalName = {
          contains: search.trim(),
          mode: 'insensitive', // Case-insensitive search
        };
      }

      // Build the orderBy clause
      const orderBy = {
        createdAt: order,
      };

      // Execute queries in parallel for better performance
      const [files, total] = await Promise.all([
        this.prisma.file.findMany({
          where,
          orderBy,
          skip,
          take,
        }),
        this.prisma.file.count({
          where,
        }),
      ]);

      this.logger.log(
        `Retrieved ${files.length} files for uploader ${uploaderId} (page ${page}, total: ${total})`,
      );

      return new FilePaginatedResponseDto(files, total, page || 1, limit || 20);
    } catch (error) {
      this.logger.error(
        `Failed to get recent files for uploader ${uploaderId}: ${error.message}`,
        error.stack,
      );
      throw new InternalServerErrorException('Failed to retrieve files');
    }
  }
}
