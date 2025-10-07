import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { Prisma, OrderStatus } from '@prisma/client';
import { PrismaService } from '@core/prisma/prisma.service';
import { PaginationDto, PaginatedResponseDto } from '@/shared/dto';
import { CreateOrderDto, OrderResponseDto, UpdateOrderStatusDto } from './dto';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get the organization ID for a user
   */
  private async getUserOrganizationId(userId: number): Promise<number> {
    const member = await this.prisma.member.findUnique({
      where: { userId },
      select: { organizationId: true },
    });
    if (!member) {
      throw new ForbiddenException('User is not a member of any organization');
    }
    return member.organizationId;
  }

  /**
   * Ensure the order belongs to the user's organization
   */
  private async ensureOrderOwnership(orderId: number, organizationId: number) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { organizationId: true },
    });
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    if (order.organizationId !== organizationId) {
      throw new ForbiddenException(
        'Order does not belong to your organization',
      );
    }
    return order;
  }

  /**
   * Create a new order
   */
  async createOrder(
    userId: number,
    dto: CreateOrderDto,
  ): Promise<OrderResponseDto> {
    const organizationId = await this.getUserOrganizationId(userId);

    // If customerId is provided, ensure it belongs to the organization
    if (dto.customerId) {
      const customer = await this.prisma.customer.findUnique({
        where: { id: dto.customerId },
        select: { organizationId: true },
      });
      if (!customer) {
        throw new NotFoundException('Customer not found');
      }
      if (customer.organizationId !== organizationId) {
        throw new ForbiddenException(
          'Customer does not belong to your organization',
        );
      }
    }

    // If productIds are provided, ensure they belong to the organization
    if (dto.productIds && dto.productIds.length > 0) {
      const products = await this.prisma.product.findMany({
        where: {
          id: { in: dto.productIds },
          organizationId,
        },
        select: { id: true },
      });
      if (products.length !== dto.productIds.length) {
        throw new BadRequestException(
          'One or more products do not belong to your organization',
        );
      }
    }

    const order = await this.prisma.order.create({
      data: {
        status: dto.status || OrderStatus.NEW,
        customerId: dto.customerId,
        details: dto.details as Prisma.InputJsonValue,
        organizationId,
        quantity: dto.quantity || 1,
        totalPrice: dto.totalPrice || 0,
        products: dto.productIds
          ? {
              connect: dto.productIds.map((id) => ({ id })),
            }
          : undefined,
      },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            username: true,
            telegramId: true,
          },
        },
        products: {
          select: {
            id: true,
            name: true,
            price: true,
            images: {
              select: {
                id: true,
                key: true,
                originalName: true,
              },
            },
          },
        },
      },
    });

    this.logger.log(
      `Order created: ${order.id} for organization: ${organizationId}`,
    );
    return this.mapOrderToResponse(order);
  }

  /**
   * Get all orders with pagination and search
   */
  async getOrders(
    userId: number,
    pagination: PaginationDto,
  ): Promise<PaginatedResponseDto<OrderResponseDto>> {
    const organizationId = await this.getUserOrganizationId(userId);

    // Build search filter
    const searchFilter = pagination.search
      ? {
          OR: [
            {
              customer: {
                name: {
                  contains: pagination.search,
                  mode: Prisma.QueryMode.insensitive,
                },
              },
            },
            {
              id: {
                equals: isNaN(Number(pagination.search))
                  ? undefined
                  : Number(pagination.search),
              },
            },
            {
              details: {
                path: [],
                string_contains: pagination.search,
              },
            },
          ],
        }
      : {};

    const whereClause = {
      organizationId,
      ...searchFilter,
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where: whereClause,
        include: {
          customer: {
            select: {
              id: true,
              name: true,
              username: true,
              telegramId: true,
            },
          },
          products: {
            select: {
              id: true,
              name: true,
              price: true,
              images: {
                select: {
                  id: true,
                  key: true,
                  originalName: true,
                },
              },
            },
          },
        },
        skip: pagination.skip,
        take: pagination.take,
        orderBy: { createdAt: pagination.order },
      }),
      this.prisma.order.count({ where: whereClause }),
    ]);

    const mappedItems = items.map((order) => this.mapOrderToResponse(order));

    return new PaginatedResponseDto(
      mappedItems,
      total,
      pagination.page ?? 1,
      pagination.limit ?? 20,
    );
  }

  /**
   * Get order by ID
   */
  async getOrderById(
    userId: number,
    orderId: number,
  ): Promise<OrderResponseDto> {
    const organizationId = await this.getUserOrganizationId(userId);
    await this.ensureOrderOwnership(orderId, organizationId);

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            username: true,
            telegramId: true,
          },
        },
        products: {
          select: {
            id: true,
            name: true,
            price: true,
            images: {
              select: {
                id: true,
                key: true,
                originalName: true,
              },
            },
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    return this.mapOrderToResponse(order);
  }

  /**
   * Update order status
   */
  async updateOrderStatus(
    userId: number,
    orderId: number,
    dto: UpdateOrderStatusDto,
  ): Promise<OrderResponseDto> {
    const organizationId = await this.getUserOrganizationId(userId);
    await this.ensureOrderOwnership(orderId, organizationId);

    const order = await this.prisma.order.update({
      where: { id: orderId },
      data: {
        status: dto.status,
        updatedAt: new Date(),
      },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            username: true,
            telegramId: true,
          },
        },
        products: {
          select: {
            id: true,
            name: true,
            price: true,
            images: {
              select: {
                id: true,
                key: true,
                originalName: true,
              },
            },
          },
        },
      },
    });

    this.logger.log(`Order ${orderId} status updated to ${dto.status}`);
    return this.mapOrderToResponse(order);
  }

  /**
   * Delete order
   */
  async deleteOrder(
    userId: number,
    orderId: number,
  ): Promise<{ success: boolean }> {
    const organizationId = await this.getUserOrganizationId(userId);
    await this.ensureOrderOwnership(orderId, organizationId);

    await this.prisma.order.delete({
      where: { id: orderId },
    });

    this.logger.log(`Order ${orderId} deleted`);
    return { success: true };
  }

  /**
   * Create order from webhook/AI data
   */
  async createOrderFromWebhook(
    organizationId: number,
    customerId: number,
    orderData: any,
  ): Promise<OrderResponseDto> {
    const { customerName, customerContact, items, notes } = orderData;

    // Extract customer details for storage in order.details
    const customerDetails = {
      phoneNumber: customerContact || 'Not provided',
      name: customerName || 'Not provided',
      location: 'Not provided', // Will be updated when customer provides it
      items: items || [],
      notes: notes || '',
      createdAt: new Date().toISOString(),
    };

    const order = await this.prisma.order.create({
      data: {
        status: OrderStatus.NEW,
        customerId,
        details: customerDetails as Prisma.InputJsonValue,
        organizationId,
        quantity: 1, // Default quantity, can be updated
        totalPrice: 0, // Will be calculated when products are assigned
      },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            username: true,
            telegramId: true,
          },
        },
        products: {
          select: {
            id: true,
            name: true,
            price: true,
            images: {
              select: {
                id: true,
                key: true,
                originalName: true,
              },
            },
          },
        },
      },
    });

    this.logger.log(
      `Order created from webhook: ${order.id} for customer: ${customerId}`,
    );
    return this.mapOrderToResponse(order);
  }

  /**
   * Get orders for AI context
   */
  async getOrdersForAI(
    organizationId: number,
    customerId?: number,
  ): Promise<any[]> {
    const whereClause: Prisma.OrderWhereInput = {
      organizationId,
    };

    if (customerId) {
      whereClause.customerId = customerId;
    }

    const orders = await this.prisma.order.findMany({
      where: whereClause,
      select: {
        id: true,
        status: true,
        details: true,
        createdAt: true,
        customer: {
          select: {
            name: true,
            telegramId: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 10, // Limit to recent orders for AI context
    });

    return orders.map((order) => ({
      id: order.id,
      status: order.status,
      details: order.details,
      createdAt: order.createdAt,
      customer: order.customer,
    }));
  }

  /**
   * Create order from AI response data
   */
  async createFromAIResponse(
    aiResponse: any,
    customer: any,
    organizationId: number,
  ): Promise<OrderResponseDto> {
    const { customerName, customerContact, items, notes } = aiResponse;

    // Extract customer details for storage in order.details
    const customerDetails = {
      phoneNumber: customerContact || 'Not provided',
      name: customerName || customer.name || 'Not provided',
      location: 'Not provided', // Will be updated when customer provides it
      items: items || [],
      notes: notes || '',
      createdAt: new Date().toISOString(),
      source: 'AI_INTENT',
    };

    const order = await this.prisma.order.create({
      data: {
        status: OrderStatus.NEW,
        customerId: customer.id,
        details: customerDetails as Prisma.InputJsonValue,
        organizationId,
        quantity: 1, // Default quantity, can be updated
        totalPrice: 0, // Will be calculated when products are assigned
      },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            username: true,
            telegramId: true,
          },
        },
        products: {
          select: {
            id: true,
            name: true,
            price: true,
            images: {
              select: {
                id: true,
                key: true,
                originalName: true,
              },
            },
          },
        },
      },
    });

    this.logger.log(
      `Order created from AI response: ${order.id} for customer: ${customer.id}`,
    );
    return this.mapOrderToResponse(order);
  }

  /**
   * Get orders for a specific customer
   */
  async getOrdersForCustomer(
    customerId: number,
    organizationId: number,
    limit: number = 5,
  ): Promise<OrderResponseDto[]> {
    const orders = await this.prisma.order.findMany({
      where: {
        customerId,
        organizationId,
      },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            username: true,
            telegramId: true,
          },
        },
        products: {
          select: {
            id: true,
            name: true,
            price: true,
            images: {
              select: {
                id: true,
                key: true,
                originalName: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return orders.map((order) => this.mapOrderToResponse(order));
  }

  /**
   * Update order details (for AI-driven updates)
   */
  async updateOrderDetails(
    orderId: number,
    customerId: number,
    organizationId: number,
    updates: Partial<{
      status: OrderStatus;
      details: Record<string, any>;
      quantity: number;
      totalPrice: number;
    }>,
  ): Promise<OrderResponseDto> {
    // Ensure order belongs to customer and organization
    const order = await this.prisma.order.findFirst({
      where: {
        id: orderId,
        customerId,
        organizationId,
      },
    });

    if (!order) {
      throw new NotFoundException(
        'Order not found or does not belong to customer',
      );
    }

    const updatedOrder = await this.prisma.order.update({
      where: { id: orderId },
      data: {
        ...updates,
        updatedAt: new Date(),
      },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            username: true,
            telegramId: true,
          },
        },
        products: {
          select: {
            id: true,
            name: true,
            price: true,
            images: {
              select: {
                id: true,
                key: true,
                originalName: true,
              },
            },
          },
        },
      },
    });

    this.logger.log(`Order ${orderId} details updated via AI`);
    return this.mapOrderToResponse(updatedOrder);
  }

  /**
   * Cancel order (AI-driven cancellation)
   */
  async cancelOrder(
    orderId: number,
    customerId: number,
    organizationId: number,
  ): Promise<OrderResponseDto> {
    // Ensure order belongs to customer and organization
    const order = await this.prisma.order.findFirst({
      where: {
        id: orderId,
        customerId,
        organizationId,
      },
    });

    if (!order) {
      throw new NotFoundException(
        'Order not found or does not belong to customer',
      );
    }

    // Only allow cancellation of NEW or PENDING orders
    if (
      order.status !== OrderStatus.NEW &&
      order.status !== OrderStatus.PENDING
    ) {
      throw new BadRequestException(
        `Cannot cancel order with status: ${order.status}`,
      );
    }

    const updatedOrder = await this.prisma.order.update({
      where: { id: orderId },
      data: {
        status: OrderStatus.CANCELLED,
        updatedAt: new Date(),
        details: {
          ...(order.details as Record<string, any>),
          cancelledAt: new Date().toISOString(),
          cancelledBy: 'AI_INTENT',
        } as Prisma.InputJsonValue,
      },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            username: true,
            telegramId: true,
          },
        },
        products: {
          select: {
            id: true,
            name: true,
            price: true,
            images: {
              select: {
                id: true,
                key: true,
                originalName: true,
              },
            },
          },
        },
      },
    });

    this.logger.log(`Order ${orderId} cancelled via AI`);
    return this.mapOrderToResponse(updatedOrder);
  }

  /**
   * Map Prisma order to response DTO
   */
  private mapOrderToResponse(order: any): OrderResponseDto {
    return {
      id: order.id,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      status: order.status,
      customer: order.customer
        ? {
            id: order.customer.id,
            name: order.customer.name,
            username: order.customer.username,
            telegramId: order.customer.telegramId,
          }
        : undefined,
      details: order.details,
      organizationId: order.organizationId,
      quantity: order.quantity,
      totalPrice: order.totalPrice,
      products: order.products || [],
    };
  }
}
