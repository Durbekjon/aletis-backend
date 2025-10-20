import { ApiProperty } from '@nestjs/swagger';
import { PaginatedResponseDto } from '@/shared/dto';
import { UploadFileResponseDto } from './upload-file.dto';

export class FilePaginatedResponseDto extends PaginatedResponseDto<UploadFileResponseDto> {
  @ApiProperty({
    description: 'Array of files for the current page',
    type: [UploadFileResponseDto],
  })
  declare items: UploadFileResponseDto[];

  @ApiProperty({
    description: 'Total number of files matching the filter',
    example: 150,
  })
  declare total: number;

  @ApiProperty({
    description: 'Current page number (1-based)',
    example: 1,
  })
  declare page: number;

  @ApiProperty({
    description: 'Number of files per page',
    example: 20,
  })
  declare limit: number;

  @ApiProperty({
    description: 'Total number of pages',
    example: 8,
  })
  declare totalPages: number;

  @ApiProperty({
    description: 'Whether there is a next page',
    example: true,
  })
  declare hasNext: boolean;

  @ApiProperty({
    description: 'Whether there is a previous page',
    example: false,
  })
  declare hasPrevious: boolean;
}
