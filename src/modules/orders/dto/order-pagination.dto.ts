import { ApiProperty } from '@nestjs/swagger';
import { PaginatedResponseDto } from '@/shared/dto';
import { OrderResponseDto } from './order-response.dto';

export class OrderPaginatedResponseDto extends PaginatedResponseDto<OrderResponseDto> {
  @ApiProperty({ 
    description: 'Array of orders',
    type: [OrderResponseDto],
    isArray: true
  })
  data: OrderResponseDto[];
}
