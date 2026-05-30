import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsOptional,
  IsNumber,
  IsEnum,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { OrderStatus } from '@prisma/client';
import { OrderDetailsDto } from './order-details.dto';

export class CreateOrderDto {
  @ApiPropertyOptional({
    description: 'Customer ID (optional if creating from webhook)',
    type: 'integer',
    example: 1,
  })
  @IsOptional()
  @IsInt()
  customerId?: number;

  @ApiPropertyOptional({
    description: 'Order status',
    enum: OrderStatus,
    default: OrderStatus.NEW,
    example: OrderStatus.NEW,
  })
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus = OrderStatus.NEW;

  @ApiPropertyOptional({
    description: 'Structured order details (customer info, items, etc.)',
    type: OrderDetailsDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => OrderDetailsDto)
  details?: OrderDetailsDto;

  @ApiPropertyOptional({
    description: 'Quantity of items',
    type: 'integer',
    minimum: 1,
    default: 1,
    example: 2,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  quantity?: number = 1;

  @ApiPropertyOptional({
    description: 'Total price of the order',
    type: 'number',
    minimum: 0,
    default: 0,
    example: 1500.5,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  totalPrice?: number = 0;

  @ApiPropertyOptional({
    description: 'Array of product IDs to associate with this order',
    type: [Number],
    example: [1, 2, 3],
  })
  @IsOptional()
  @IsInt({ each: true })
  productIds?: number[];
}
