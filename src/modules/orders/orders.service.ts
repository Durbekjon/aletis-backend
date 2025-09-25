import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { CacheService } from '../../core/cache/cache.service';
import { CreateOrderDto } from './dto/create-order.dto';
import type { Order } from '@prisma/client';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: CacheService,
  ) {}

  async createOrder(
    userId: number,
    createOrderDto: CreateOrderDto,
  ): Promise<Order> {
    this.logger.log(`Creating order for user ${userId}`);

    const order = await this.prisma.order.create({
      data: {
        organizationId: userId, // todo
        customerName: createOrderDto.customerName,
        customerContact: createOrderDto.customerContact,
        customerAddress: createOrderDto.customerAddress,
        details: createOrderDto.details,
        status: 'PENDING',
      },
    });

    // Invalidate related cache entries
    this.cacheService.invalidatePattern(`dashboard:summary:${userId}`);
    this.cacheService.invalidatePattern(`orders:user:${userId}:*`);

    this.logger.log(`Order created with ID: ${order.id}`);
    return order;
  }

  async createOrderFromIntent(
    userId: number,
    orderData: {
      customerName?: string;
      customerContact?: string;
      customerAddress?: string;
      items?: string;
      notes?: string;
    },
  ): Promise<Order> {
    this.logger.log(
      `Creating order from AI intent for user ${userId}:`,
      orderData,
    );

    // Transform AI order data to our format
    const createOrderDto: CreateOrderDto = {
      customerName:
        orderData.customerName !== 'Not provided'
          ? orderData.customerName
          : undefined,
      customerContact:
        orderData.customerContact !== 'Not provided'
          ? orderData.customerContact
          : undefined,
      customerAddress:
        orderData.customerAddress !== 'Not provided'
          ? orderData.customerAddress
          : undefined,
      details: {
        items: orderData.items,
        notes: orderData.notes,
        source: 'telegram_chat',
        aiGenerated: true,
        originalData: orderData,
      },
    };

    return this.createOrder(userId, createOrderDto);
  }

  async getOrdersByUser(userId: number): Promise<Order[]> {
    return this.prisma.order.findMany({
      where: { organizationId: userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getOrdersByCustomerContact(contact: string): Promise<Order[]> {
    return this.prisma.order.findMany({
      where: {
        customerContact: {
          contains: contact,
          mode: 'insensitive',
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getOrdersWithPagination(
    userId: number,
    page: number = 1,
    limit: number = 10,
  ): Promise<{ orders: Order[]; total: number }> {
    const cacheKey = this.cacheService.getUserOrdersKey(userId, page, limit);

    // Try to get from cache first
    const cached = this.cacheService.get<{
      orders: Order[];
      total: number;
    }>(cacheKey);
    if (cached) {
      return cached;
    }

    const skip = (page - 1) * limit;

    const [orders, total] = await Promise.all([
      this.prisma.order.findMany({
        where: { organizationId: userId }, // todo
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.order.count({
        where: { organizationId: userId }, // todo
      }),
    ]);

    const result = { orders, total };

    // Cache the result for 2 minutes
    this.cacheService.set(cacheKey, result, 2 * 60 * 1000);

    return result;
  }

  async getDashboardSummary(userId: number): Promise<{
    totalOrders: number;
    pendingOrders: number;
    confirmedOrders: number;
    shippedOrders: number;
    deliveredOrders: number;
    cancelledOrders: number;
    last7DaysOrders: number;
    last30DaysOrders: number;
    averageOrderValue?: number;
    topProducts?: Array<{ name: string; count: number }>;
  }> {
    const cacheKey = this.cacheService.getDashboardSummaryKey(userId);

    // Try to get from cache first
    const cached =
      this.cacheService.get<ReturnType<typeof this.getDashboardSummary>>(
        cacheKey,
      );
    if (cached) {
      return cached;
    }
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Use efficient database queries instead of fetching all orders
    const [
      totalOrders,
      statusCounts,
      last7DaysOrders,
      last30DaysOrders,
      ordersWithPrices,
      topProductsData,
    ] = await Promise.all([
      // Total orders count
      this.prisma.order.count({ where: { organizationId: userId } }), //todo

      // Status counts in a single query
      this.prisma.order.groupBy({
        by: ['status'],
        where: { organizationId: userId }, //todo
        _count: { status: true },
      }),

      // Last 7 days orders
      this.prisma.order.count({
        where: {
          organizationId: userId, //todo
          createdAt: { gte: sevenDaysAgo },
        },
      }),

      // Last 30 days orders
      this.prisma.order.count({
        where: {
          organizationId: userId, // todo
          createdAt: { gte: thirtyDaysAgo },
        },
      }),

      // Orders with price data for average calculation
      this.prisma.order.findMany({
        where: {
          organizationId: userId, //todo
          details: {
            path: ['price'],
            not: 'null',
          },
        },
        select: {
          details: true,
        },
      }),

      // Top products analysis
      this.prisma.order.findMany({
        where: { organizationId: userId }, //todo,
        select: {
          details: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 100, // Limit to recent orders for performance
      }),
    ]);

    // Process status counts
    const statusMap = new Map(
      statusCounts.map(({ status, _count }) => [status, _count.status]),
    );

    const pendingOrders = statusMap.get('PENDING') || 0;
    const confirmedOrders = statusMap.get('CONFIRMED') || 0;
    const shippedOrders = statusMap.get('SHIPPED') || 0;
    const deliveredOrders = statusMap.get('DELIVERED') || 0;
    const cancelledOrders = statusMap.get('CANCELLED') || 0;

    // Calculate average order value
    let averageOrderValue: number | undefined;
    if (ordersWithPrices.length > 0) {
      const totalValue = ordersWithPrices.reduce((sum, order) => {
        const details = order.details as Record<string, unknown>;
        return (
          sum + ((details?.price as number) || (details?.total as number) || 0)
        );
      }, 0);
      averageOrderValue = totalValue / ordersWithPrices.length;
    }

    // Process top products
    const productCounts: Record<string, number> = {};
    topProductsData.forEach((order) => {
      const details = order.details as Record<string, unknown>;
      const items = (details?.items as string) || 'Unknown Product';
      productCounts[items] = (productCounts[items] || 0) + 1;
    });

    const topProducts = Object.entries(productCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }));

    const result = {
      totalOrders,
      pendingOrders,
      confirmedOrders,
      shippedOrders,
      deliveredOrders,
      cancelledOrders,
      last7DaysOrders,
      last30DaysOrders,
      averageOrderValue,
      topProducts,
    };

    // Cache the result for 5 minutes
    this.cacheService.set(cacheKey, result, 5 * 60 * 1000);

    return result;
  }
}
