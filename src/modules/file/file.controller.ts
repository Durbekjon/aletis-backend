import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
  UseInterceptors,
  UploadedFile,
  UploadedFiles,
  ParseIntPipe,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  FileInterceptor,
  FilesInterceptor,
} from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiConsumes,
  ApiBearerAuth,
  ApiBody,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { FileService } from './file.service';
import { UploadFileResponseDto, DeleteFilesDto, DeleteFileByKeyDto, FilePaginatedResponseDto } from './dto';
import { PaginationDto } from '../../shared/dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';
import { multerConfig } from './config/multer.config';
import { PrismaService } from '../../core/prisma/prisma.service';

@ApiTags('Files')
@ApiBearerAuth('bearer')
@UseGuards(JwtAuthGuard)
@Controller({ path: 'files', version: '1' })
export class FileController {
  constructor(
    private readonly fileService: FileService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Get user's organization ID from database
   */
  private async getUserOrganizationId(userId: number): Promise<number | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { member: true },
    });
    return user?.member?.organizationId || null;
  }

  @Post('upload')
  @UseInterceptors(FileInterceptor('file', multerConfig))
  @ApiOperation({ summary: 'Upload a single file' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: 'File to upload',
    type: 'multipart/form-data',
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'The file to upload',
        },
      },
      required: ['file'],
    },
  })
  @ApiResponse({
    status: 201,
    description: 'File uploaded successfully',
    type: UploadFileResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - invalid file or missing file',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - invalid or missing JWT token',
  })
  @ApiResponse({
    status: 500,
    description: 'Internal server error - failed to upload file',
  })
  async uploadFile(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: JwtPayload,
  ): Promise<UploadFileResponseDto> {
    if (!file) {
      throw new Error('No file provided');
    }

    // Get user's organization ID from database
    const organizationId = await this.getUserOrganizationId(
      Number(user.userId),
    );
    if (!organizationId) {
      throw new Error('User is not a member of any organization');
    }

    return this.fileService.uploadFile(
      file,
      Number(user.userId),
      organizationId,
    );
  }

  @Post('upload-many')
  @UseInterceptors(FilesInterceptor('files', 10, multerConfig))
  @ApiOperation({ summary: 'Upload multiple files' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: 'Files to upload',
    type: 'multipart/form-data',
    schema: {
      type: 'object',
      properties: {
        files: {
          type: 'array',
          items: {
            type: 'string',
            format: 'binary',
          },
          description: 'The files to upload (max 10)',
        },
      },
      required: ['files'],
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Files uploaded successfully',
    type: [UploadFileResponseDto],
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - invalid files or missing files',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - invalid or missing JWT token',
  })
  @ApiResponse({
    status: 500,
    description: 'Internal server error - failed to upload files',
  })
  async uploadManyFiles(
    @UploadedFiles() files: Express.Multer.File[],
    @CurrentUser() user: JwtPayload,
  ): Promise<UploadFileResponseDto[]> {
    if (!files || files.length === 0) {
      throw new Error('No files provided');
    }

    // Get user's organization ID from database
    const organizationId = await this.getUserOrganizationId(
      Number(user.userId),
    );
    if (!organizationId) {
      throw new Error('User is not a member of any organization');
    }

    return this.fileService.uploadManyFiles(
      files,
      Number(user.userId),
      organizationId,
    );
  }

  @Get('recent')
  @ApiOperation({ summary: 'Get recent files with pagination and search' })
  @ApiQuery({
    name: 'page',
    description: 'Page number (1-based)',
    required: false,
    type: Number,
    example: 1,
  })
  @ApiQuery({
    name: 'limit',
    description: 'Number of items per page (max 100)',
    required: false,
    type: Number,
    example: 20,
  })
  @ApiQuery({
    name: 'search',
    description: 'Search term for filtering by filename',
    required: false,
    type: String,
    example: 'document',
  })
  @ApiQuery({
    name: 'order',
    description: 'Sort order by creation date',
    required: false,
    enum: ['asc', 'desc'],
    example: 'desc',
  })
  @ApiResponse({
    status: 200,
    description: 'Files retrieved successfully',
    type: FilePaginatedResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - invalid pagination parameters',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - invalid or missing JWT token',
  })
  @ApiResponse({
    status: 500,
    description: 'Internal server error - failed to retrieve files',
  })
  async getRecentFiles(
    @Query() paginationDto: PaginationDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<FilePaginatedResponseDto> {
    return this.fileService.getRecentFiles(Number(user.userId), paginationDto);
  }

  @Delete('delete-many')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete multiple files by IDs' })
  @ApiBody({
    description: 'Array of file IDs to delete',
    type: DeleteFilesDto,
  })
  @ApiResponse({
    status: 204,
    description: 'Files deleted successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - invalid file IDs or no IDs provided',
  })
  @ApiResponse({
    status: 404,
    description: 'One or more files not found',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - invalid or missing JWT token',
  })
  @ApiResponse({
    status: 500,
    description: 'Internal server error - failed to delete files',
  })
  async deleteManyFiles(@Body() deleteFilesDto: DeleteFilesDto): Promise<void> {
    return this.fileService.deleteManyFiles(deleteFilesDto.fileIds);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a file by ID' })
  @ApiParam({
    name: 'id',
    description: 'The ID of the file to delete',
    type: 'number',
    example: 1,
  })
  @ApiResponse({
    status: 204,
    description: 'File deleted successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'File not found',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - invalid or missing JWT token',
  })
  @ApiResponse({
    status: 500,
    description: 'Internal server error - failed to delete file',
  })
  async deleteFile(@Param('id', ParseIntPipe) fileId: number): Promise<void> {
    return this.fileService.deleteFile(fileId);
  }

  @Delete('by-key/:key')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a file by key/path' })
  @ApiParam({
    name: 'key',
    description: 'The key/path of the file to delete',
    type: 'string',
    example: 'public/uploads/abc123.png',
  })
  @ApiResponse({
    status: 204,
    description: 'File deleted successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'File not found',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - invalid or missing JWT token',
  })
  @ApiResponse({
    status: 500,
    description: 'Internal server error - failed to delete file',
  })
  async deleteFileByKey(@Param('key') key: string): Promise<void> {
    return this.fileService.deleteFileByKey(key);
  }
}
