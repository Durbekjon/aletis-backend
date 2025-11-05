import { ApiProperty } from '@nestjs/swagger';
import { PaginatedResponseDto } from '@/shared/dto';
import { ActivityLogResponseDto } from './activity-log-response.dto';

export class ActivityLogPaginatedResponseDto extends PaginatedResponseDto<ActivityLogResponseDto> {
  @ApiProperty({ description: 'Array of activity logs', type: [ActivityLogResponseDto] })
  declare items: ActivityLogResponseDto[];

  @ApiProperty({ description: 'Total number of activity logs', example: 150 })
  declare total: number;

  @ApiProperty({ description: 'Current page number (1-based)', example: 1 })
  declare page: number;

  @ApiProperty({ description: 'Items per page', example: 20 })
  declare limit: number;

  @ApiProperty({ description: 'Total number of pages', example: 8 })
  declare totalPages: number;

  @ApiProperty({ description: 'Whether there is a next page', example: true })
  declare hasNext: boolean;

  @ApiProperty({ description: 'Whether there is a previous page', example: false })
  declare hasPrevious: boolean;
}


