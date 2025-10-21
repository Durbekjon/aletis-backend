import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OrderStatus } from '@prisma/client';

export class CustomerInfoDto {
  @ApiProperty({ description: 'Customer ID', example: 1 })
  id: number;

  @ApiProperty({ description: 'Customer name', example: 'John Doe' })
  name: string;

  @ApiPropertyOptional({ description: 'Customer Telegram username', example: 'johndoe' })
  username?: string;

  @ApiProperty({ description: 'Customer Telegram ID', example: '123456789' })
  telegramId: string;
}

export class OrderResponseDto {
  @ApiProperty({ description: 'Order ID', example: 1 })
  id: number;

  @ApiProperty({
    description: 'Order creation date',
    example: '2024-01-15T10:30:00Z',
  })
  createdAt: Date;

  @ApiProperty({
    description: 'Order last update date',
    example: '2024-01-15T11:00:00Z',
  })
  updatedAt: Date;

  @ApiProperty({
    description: 'Order status',
    enum: OrderStatus,
    example: OrderStatus.NEW,
  })
  status: OrderStatus;

  @ApiPropertyOptional({ description: 'Associated customer information' })
  customer?: CustomerInfoDto;

  @ApiPropertyOptional({
    description: 'Order details as JSON object',
    example: {
      customerName: 'John Doe',
      phoneNumber: '+998901234567',
      location: 'Tashkent, Chilonzor',
      items: ['iPhone 15 Pro', 'Samsung Galaxy S24'],
      notes: 'Delivery to office',
    },
  })
  details?: Record<string, any>;

  @ApiProperty({ description: 'Organization ID', example: 1 })
  organizationId: number;

  @ApiProperty({ description: 'Order quantity', example: 2 })
  quantity: number;

  @ApiProperty({ description: 'Total order price', example: 1500.5 })
  totalPrice: number;

  @ApiProperty({ description: 'Associated products', type: [Object] })
  products: any[];

  @ApiProperty({
    description: 'Order items with quantities and prices',
    type: [Object],
  })
  orderItems: any[];
}
