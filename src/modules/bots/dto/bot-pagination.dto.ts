import { ApiProperty } from '@nestjs/swagger';
import { PaginatedResponseDto } from '../../../shared/dto';
import { BotResponseDto } from './bot-response.dto';

export class BotPaginatedResponseDto extends PaginatedResponseDto<BotResponseDto> {
  @ApiProperty({
    description: 'Array of bots for the current page',
    type: [BotResponseDto],
  })
  declare items: BotResponseDto[];

  @ApiProperty({
    description: 'Total number of bots matching the filter',
    example: 150,
  })
  declare total: number;

  @ApiProperty({
    description: 'Current page number (1-based)',
    example: 1,
  })
  declare page: number;

  @ApiProperty({
    description: 'Number of bots per page',
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


