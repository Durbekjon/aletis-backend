import { ApiProperty } from '@nestjs/swagger';
import { PaginatedResponseDto } from '@/shared/dto';
import { CustomerResponseDto } from './customer-response.dto';

export class CustomerPaginatedResponseDto extends PaginatedResponseDto<CustomerResponseDto> {
  @ApiProperty({
    description: 'Array of customers for the current page',
    type: [CustomerResponseDto],
  })
  declare items: CustomerResponseDto[];

  @ApiProperty({
    description: 'Total number of customers matching the filter',
    example: 150,
  })
  declare total: number;

  @ApiProperty({ description: 'Current page number (1-based)', example: 1 })
  declare page: number;

  @ApiProperty({ description: 'Number of customers per page', example: 20 })
  declare limit: number;

  @ApiProperty({ description: 'Total number of pages', example: 8 })
  declare totalPages: number;

  @ApiProperty({ description: 'Whether there is a next page', example: true })
  declare hasNext: boolean;

  @ApiProperty({
    description: 'Whether there is a previous page',
    example: false,
  })
  declare hasPrevious: boolean;
}
