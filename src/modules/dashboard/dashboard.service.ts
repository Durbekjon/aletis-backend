import { Injectable } from '@nestjs/common';
import { PrismaService } from '@core/prisma/prisma.service';

interface OrdersSummary {
  ordersToday: number;
  ordersChange: string;
}

interface RevenueSummary {
  amount: number;
  currency: string;
  change: string;
}

interface ActiveConversationsSummary {
  count: number;
  needAttention: number;
}

interface ConversionRateSummary {
  value: number;
  change: string;
}

export interface DashboardSummary {
  ordersToday: number;
  ordersChange: string;
  revenue: RevenueSummary;
  activeConversations: ActiveConversationsSummary;
  conversionRate: ConversionRateSummary;
}

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(userId: number): Promise<DashboardSummary> {
    // Get user's organization
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { member: { include: { organization: true } } },
    });

    if (!user?.member?.organization) {
      throw new Error('User not associated with any organization');
    }

    const organizationId = user.member.organization.id;

    // Execute all queries in parallel for better performance
    const [
      ordersSummary,
      revenueSummary,
      activeConversationsSummary,
      conversionRateSummary,
    ] = await Promise.all([
      this.getOrdersSummary(organizationId),
      this.getRevenueSummary(organizationId),
      this.getActiveConversationsSummary(organizationId),
      this.getConversionRateSummary(organizationId),
    ]);

    return {
      ordersToday: ordersSummary.ordersToday,
      ordersChange: ordersSummary.ordersChange,
      revenue: revenueSummary,
      activeConversations: activeConversationsSummary,
      conversionRate: conversionRateSummary,
    };
  }

  private async getOrdersSummary(
    organizationId: number,
  ): Promise<OrdersSummary> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const [todayOrders, yesterdayOrders] = await Promise.all([
      this.prisma.order.count({
        where: {
          organizationId,
          createdAt: {
            gte: today,
          },
        },
      }),
      this.prisma.order.count({
        where: {
          organizationId,
          createdAt: {
            gte: yesterday,
            lt: today,
          },
        },
      }),
    ]);

    const ordersChange =
      yesterdayOrders === 0
        ? '0%'
        : `${(((todayOrders - yesterdayOrders) / yesterdayOrders) * 100).toFixed(0)}%`;

    return {
      ordersToday: todayOrders,
      ordersChange: ordersChange.startsWith('-')
        ? ordersChange
        : `+${ordersChange}`,
    };
  }

  private async getRevenueSummary(
    organizationId: number,
  ): Promise<RevenueSummary> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const [todayRevenue, yesterdayRevenue] = await Promise.all([
      this.prisma.order.aggregate({
        where: {
          organizationId,
          createdAt: {
            gte: today,
          },
          // Only sum orders with USD currency products
          products: {
            some: {
              currency: 'USD',
            },
          },
        },
        _sum: {
          totalPrice: true,
        },
      }),
      this.prisma.order.aggregate({
        where: {
          organizationId,
          createdAt: {
            gte: yesterday,
            lt: today,
          },
          // Only sum orders with USD currency products
          products: {
            some: {
              currency: 'USD',
            },
          },
        },
        _sum: {
          totalPrice: true,
        },
      }),
    ]);

    const todayAmount = todayRevenue._sum.totalPrice || 0;
    const yesterdayAmount = yesterdayRevenue._sum.totalPrice || 0;

    const revenueChange =
      yesterdayAmount === 0
        ? '0%'
        : `${(((todayAmount - yesterdayAmount) / yesterdayAmount) * 100).toFixed(0)}%`;

    return {
      amount: Math.round(todayAmount),
      currency: 'USD',
      change: revenueChange.startsWith('-')
        ? revenueChange
        : `+${revenueChange}`,
    };
  }

  private async getActiveConversationsSummary(
    organizationId: number,
  ): Promise<ActiveConversationsSummary> {
    const [count, needAttention] = await Promise.all([
      // Count all active conversations (customers with recent messages)
      this.prisma.customer.count({
        where: {
          organizationId,
          messages: {
            some: {
              createdAt: {
                gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
              },
            },
          },
        },
      }),
      // Count conversations that need attention (customers with messages but no recent orders)
      this.prisma.customer.count({
        where: {
          organizationId,
          messages: {
            some: {
              createdAt: {
                gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
              },
            },
          },
          orders: {
            none: {
              createdAt: {
                gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // No orders in last 7 days
              },
            },
          },
        },
      }),
    ]);

    return {
      count,
      needAttention,
    };
  }

  private async getConversionRateSummary(
    organizationId: number,
  ): Promise<ConversionRateSummary> {
    const now = new Date();
    const thisWeekStart = new Date(now);
    thisWeekStart.setDate(now.getDate() - now.getDay()); // Start of this week (Sunday)
    thisWeekStart.setHours(0, 0, 0, 0);

    const lastWeekStart = new Date(thisWeekStart);
    lastWeekStart.setDate(lastWeekStart.getDate() - 7);

    const lastWeekEnd = new Date(thisWeekStart);

    const [
      thisWeekOrders,
      thisWeekConversations,
      lastWeekOrders,
      lastWeekConversations,
    ] = await Promise.all([
      // This week orders
      this.prisma.order.count({
        where: {
          organizationId,
          createdAt: {
            gte: thisWeekStart,
          },
        },
      }),
      // This week active conversations
      this.prisma.customer.count({
        where: {
          organizationId,
          messages: {
            some: {
              createdAt: {
                gte: thisWeekStart,
              },
            },
          },
        },
      }),
      // Last week orders
      this.prisma.order.count({
        where: {
          organizationId,
          createdAt: {
            gte: lastWeekStart,
            lt: lastWeekEnd,
          },
        },
      }),
      // Last week active conversations
      this.prisma.customer.count({
        where: {
          organizationId,
          messages: {
            some: {
              createdAt: {
                gte: lastWeekStart,
                lt: lastWeekEnd,
              },
            },
          },
        },
      }),
    ]);

    const thisWeekRate =
      thisWeekConversations === 0
        ? 0
        : (thisWeekOrders / thisWeekConversations) * 100;
    const lastWeekRate =
      lastWeekConversations === 0
        ? 0
        : (lastWeekOrders / lastWeekConversations) * 100;

    const conversionRateChange =
      lastWeekRate === 0
        ? '0%'
        : `${(((thisWeekRate - lastWeekRate) / lastWeekRate) * 100).toFixed(1)}%`;

    return {
      value: Math.round(thisWeekRate * 10) / 10, // Round to 1 decimal place
      change: conversionRateChange.startsWith('-')
        ? conversionRateChange
        : `+${conversionRateChange}`,
    };
  }
}
