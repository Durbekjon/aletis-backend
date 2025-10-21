import {
  Controller,
  Get,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  ParseIntPipe,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiBearerAuth,
  ApiBody,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '@auth/guards/jwt-auth.guard';
import { CurrentUser } from '@auth/decorators/current-user.decorator';
import type { JwtPayload } from '@modules/auth/strategies/jwt.strategy';
import { PaginationDto } from '@/shared/dto';
import { OrderPaginationDto } from './dto/order-pagination.dto';
import { OrdersService } from './orders.service';
import {
  UpdateOrderStatusDto,
  OrderResponseDto,
  OrderPaginatedResponseDto,
} from './dto';

@ApiTags('Orders')
@ApiBearerAuth('bearer')
@UseGuards(JwtAuthGuard)
@Controller({ path: 'orders', version: '1' })
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  @ApiOperation({
    summary: 'Get all orders',
    description:
      'Retrieve paginated list of orders with search functionality and filtering by status and payment status',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    example: 1,
    description: 'Page number (1-based)',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    example: 20,
    description: 'Number of items per page (max 100)',
  })
  @ApiQuery({
    name: 'search',
    required: false,
    type: String,
    description: 'Search by customer name, order ID, or details content',
  })
  @ApiQuery({
    name: 'order',
    required: false,
    enum: ['asc', 'desc'],
    example: 'desc',
    description: 'Sort order by creation date',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: [
      'NEW',
      'PENDING',
      'CONFIRMED',
      'SHIPPED',
      'DELIVERED',
      'CANCELLED',
      'REFUNDED',
    ],
    description: 'Filter by order status',
    example: 'PENDING',
  })
  @ApiQuery({
    name: 'paymentStatus',
    required: false,
    enum: ['PENDING', 'PAID', 'FAILED', 'REFUNDED'],
    description: 'Filter by payment status',
    example: 'PAID',
  })
  @ApiResponse({
    status: 200,
    description: 'Orders retrieved successfully',
    type: OrderPaginatedResponseDto,
  })
  async findAll(
    @CurrentUser() user: JwtPayload,
    @Query() pagination: OrderPaginationDto,
  ): Promise<OrderPaginatedResponseDto> {
    return this.ordersService.getOrders(
      +user.userId,
      pagination,
    ) as Promise<OrderPaginatedResponseDto>;
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get order by ID',
    description: 'Retrieve a specific order by its ID',
  })
  @ApiParam({
    name: 'id',
    type: Number,
    example: 1,
    description: 'Order ID',
  })
  @ApiResponse({
    status: 200,
    description: 'Order retrieved successfully',
    type: OrderResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Order not found',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - order does not belong to your organization',
  })
  async findOne(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<OrderResponseDto> {
    return this.ordersService.getOrderById(+user.userId, id);
  }

  @Patch(':id/status')
  @ApiOperation({
    summary: 'Update order status',
    description: 'Update the status of an existing order',
  })
  @ApiParam({
    name: 'id',
    type: Number,
    example: 1,
    description: 'Order ID',
  })
  @ApiBody({ type: UpdateOrderStatusDto })
  @ApiResponse({
    status: 200,
    description: 'Order status updated successfully',
    type: OrderResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Order not found',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - order does not belong to your organization',
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - invalid status value',
  })
  async updateStatus(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateOrderStatusDto,
  ): Promise<OrderResponseDto> {
    return this.ordersService.updateOrderStatus(+user.userId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete order',
    description: 'Permanently delete an order',
  })
  @ApiParam({
    name: 'id',
    type: Number,
    example: 1,
    description: 'Order ID',
  })
  @ApiResponse({
    status: 204,
    description: 'Order deleted successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'Order not found',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - order does not belong to your organization',
  })
  async remove(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<void> {
    await this.ordersService.deleteOrder(+user.userId, id);
  }
}