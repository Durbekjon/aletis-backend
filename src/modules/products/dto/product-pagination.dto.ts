import { ApiProperty } from '@nestjs/swagger';
import { PaginatedResponseDto } from '@/shared/dto';
import { ProductResponseDto } from './product-response.dto';

export class ProductPaginatedResponseDto extends PaginatedResponseDto<ProductResponseDto> {
  @ApiProperty({
    description: 'Array of products for the current page',
    type: [ProductResponseDto],
  })
  declare items: ProductResponseDto[];

  @ApiProperty({
    description: 'Total number of products matching the filter',
    example: 150,
  })
  declare total: number;

  @ApiProperty({
    description: 'Current page number (1-based)',
    example: 1,
  })
  declare page: number;

  @ApiProperty({
    description: 'Number of products per page',
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
