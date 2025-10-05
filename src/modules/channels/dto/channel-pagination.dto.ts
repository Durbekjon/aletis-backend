import { ApiProperty } from '@nestjs/swagger';
import { PaginatedResponseDto } from '@/shared/dto';
import { ChannelResponseDto } from './channel-response.dto';

export class ChannelPaginatedResponseDto extends PaginatedResponseDto<ChannelResponseDto> {
  @ApiProperty({ description: 'Array of channels for the current page', type: [ChannelResponseDto] })
  declare items: ChannelResponseDto[];

  @ApiProperty({ description: 'Total number of channels matching the filter', example: 150 })
  declare total: number;

  @ApiProperty({ description: 'Current page number (1-based)', example: 1 })
  declare page: number;

  @ApiProperty({ description: 'Number of channels per page', example: 20 })
  declare limit: number;

  @ApiProperty({ description: 'Total number of pages', example: 8 })
  declare totalPages: number;

  @ApiProperty({ description: 'Whether there is a next page', example: true })
  declare hasNext: boolean;

  @ApiProperty({ description: 'Whether there is a previous page', example: false })
  declare hasPrevious: boolean;
}


