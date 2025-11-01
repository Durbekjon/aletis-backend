import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@core/prisma/prisma.service';
import { RedisService } from '@core/redis/redis.service';

type Metric = 'revenue' | 'orders';

@Injectable()
export class AnalyticsService {
  private readonly ttlSeconds = 60;
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  private parsePeriod(period: string): { from: Date; to: Date; prevFrom: Date; prevTo: Date } {
    const now = new Date();
    const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));
    const n = period.endsWith('d') ? parseInt(period) : 7;
    const from = new Date(to);
    from.setUTCDate(to.getUTCDate() - (n - 1));
    const prevTo = new Date(from);
    prevTo.setUTCDate(from.getUTCDate() - 1);
    const prevFrom = new Date(prevTo);
    prevFrom.setUTCDate(prevTo.getUTCDate() - (n - 1));
    return { from, to, prevFrom, prevTo };
  }

  private startOfTodayUTC(): Date {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
  }

  private async resolveOrgId(userId: number): Promise<number> {
    this.logger.debug(`Resolving organizationId for userId=${userId}`);
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { member: { include: { organization: true } } },
    });
    if (!user?.member?.organization?.id) {
      throw new Error('User not associated with any organization');
    }
    const orgId = user.member.organization.id;
    this.logger.debug(`Resolved organizationId=${orgId} for userId=${userId}`);
    return orgId;
  }

  async getSummary(userId: number, period: string) {
    const orgId = await this.resolveOrgId(userId);
    const cacheKey = `analytics:summary:${orgId}:${period}`;
    const cached = await this.redis.get<any>(cacheKey);
    if (cached) {
      this.logger.verbose(`Cache hit: ${cacheKey}`);
      return cached;
    }
    this.logger.verbose(`Cache miss: ${cacheKey}`);

    const { from, to, prevFrom, prevTo } = this.parsePeriod(period);
    const started = Date.now();
    const startToday = this.startOfTodayUTC();

    // Aggregate sums for completed days in range (exclude today for realtime add-on)
    const [currentAgg, previous] = await Promise.all([
      (this.prisma as any).analyticsDailyAggregate.aggregate({
        _sum: { revenue: true, orders: true, conversations: true, inquiries: true, ordersCompleted: true },
        where: { organizationId: orgId, day: { gte: from, lt: startToday } },
      }),
      (this.prisma as any).analyticsDailyAggregate.aggregate({
        _sum: { revenue: true, orders: true, conversations: true, inquiries: true, ordersCompleted: true },
        where: { organizationId: orgId, day: { gte: prevFrom, lte: prevTo } },
      }),
    ]);

    // Real-time for today
    const [todayRevenueAgg, todayOrdersCount, todayConversations, todayInquiries, todayCompleted] = await Promise.all([
      this.prisma.order.aggregate({ _sum: { totalPrice: true }, where: { organizationId: orgId, createdAt: { gte: startToday, lte: to } } }),
      this.prisma.order.count({ where: { organizationId: orgId, createdAt: { gte: startToday, lte: to } } }),
      this.prisma.message.findMany({ where: { bot: { organizationId: orgId }, createdAt: { gte: startToday, lte: to } }, distinct: ['customerId'], select: { customerId: true } }).then(a => a.length),
      this.prisma.message.count({ where: { bot: { organizationId: orgId }, createdAt: { gte: startToday, lte: to }, isInquiry: true as any } }),
      this.prisma.order.count({ where: { organizationId: orgId, status: 'DELIVERED', createdAt: { gte: startToday, lte: to } } }),
    ]);

    const safe = (v?: number | null) => (v ?? 0);
    const currRevenue = safe(currentAgg._sum.revenue) + safe(todayRevenueAgg._sum.totalPrice);
    const prevRevenue = safe(previous._sum.revenue);
    const currOrders = safe(currentAgg._sum.orders) + todayOrdersCount;
    const prevOrders = safe(previous._sum.orders);

    const percent = (a: number, b: number) => (b === 0 ? (a > 0 ? 100 : 0) : ((a - b) / b) * 100);

    const response = {
      ordersToday: currOrders,
      ordersChange: `${percent(currOrders, prevOrders).toFixed(0)}%`,
      revenue: { amount: currRevenue, currency: 'USD', change: `${percent(currRevenue, prevRevenue).toFixed(0)}%` },
      activeConversations: { count: safe(currentAgg._sum.conversations) + todayConversations, needAttention: 0 },
      conversionRate: {
        conversationToInquiry: 0,
        inquiryToCart: 0,
        cartToOrder: 0,
        orderToCompletion: currOrders === 0 ? 0 : ((safe(currentAgg._sum.ordersCompleted) + todayCompleted) / currOrders) * 100,
      },
      period,
    };

    await this.redis.set(cacheKey, response, this.ttlSeconds);
    this.logger.verbose(`Summary computed in ${Date.now() - started}ms for orgId=${orgId}, period=${period}`);
    return response;
  }

  async getTrends(userId: number, period: string, metric: Metric) {
    const orgId = await this.resolveOrgId(userId);
    const cacheKey = `analytics:trends:${orgId}:${period}:${metric}`;
    const cached = await this.redis.get<any>(cacheKey);
    if (cached) {
      this.logger.verbose(`Cache hit: ${cacheKey}`);
      return cached;
    }
    this.logger.verbose(`Cache miss: ${cacheKey}`);

    const { from, to } = this.parsePeriod(period);
    const started = Date.now();
    const startToday = this.startOfTodayUTC();

    const rows = await (this.prisma as any).analyticsDailyAggregate.findMany({
      where: { organizationId: orgId, day: { gte: from, lt: startToday } },
      orderBy: { day: 'asc' },
      select: { day: true, revenue: true, orders: true },
    });

    const data = (rows as Array<{ day: Date; revenue: number; orders: number }>).map((r) => ({ date: r.day, value: metric === 'revenue' ? r.revenue : r.orders }));

    // Append today's realtime point
    const [todayRevenueAgg, todayOrdersCount] = await Promise.all([
      this.prisma.order.aggregate({ _sum: { totalPrice: true }, where: { organizationId: orgId, createdAt: { gte: startToday, lte: to } } }),
      this.prisma.order.count({ where: { organizationId: orgId, createdAt: { gte: startToday, lte: to } } }),
    ]);
    data.push({ date: startToday, value: metric === 'revenue' ? (todayRevenueAgg._sum.totalPrice ?? 0) : todayOrdersCount });
    await this.redis.set(cacheKey, data, this.ttlSeconds);
    this.logger.verbose(`Trends computed in ${Date.now() - started}ms for orgId=${orgId}, period=${period}, metric=${metric}`);
    return data;
  }

  async getFunnel(userId: number, period: string) {
    const orgId = await this.resolveOrgId(userId);
    const { from, to } = this.parsePeriod(period);
    const started = Date.now();
    const startToday = this.startOfTodayUTC();
    const agg = await (this.prisma as any).analyticsDailyAggregate.aggregate({
      _sum: { conversations: true, inquiries: true, orders: true, ordersCompleted: true },
      where: { organizationId: orgId, day: { gte: from, lt: startToday } },
    });
    // Today's realtime
    const [todayConversations, todayInquiries, todayOrders, todayCompleted] = await Promise.all([
      this.prisma.message.findMany({ where: { bot: { organizationId: orgId }, createdAt: { gte: startToday, lte: to } }, distinct: ['customerId'], select: { customerId: true } }).then(a => a.length),
      this.prisma.message.count({ where: { bot: { organizationId: orgId }, createdAt: { gte: startToday, lte: to }, isInquiry: true as any } }),
      this.prisma.order.count({ where: { organizationId: orgId, createdAt: { gte: startToday, lte: to } } }),
      this.prisma.order.count({ where: { organizationId: orgId, status: 'DELIVERED', createdAt: { gte: startToday, lte: to } } }),
    ]);
    const conversations = (agg._sum.conversations ?? 0) + todayConversations;
    const inquiries = (agg._sum.inquiries ?? 0) + todayInquiries;
    const orders = (agg._sum.orders ?? 0) + todayOrders;
    const completed = (agg._sum.ordersCompleted ?? 0) + todayCompleted;
    const rate = (a: number, b: number) => (a === 0 ? 0 : (b / a) * 100);
    return {
      conversationToInquiry: rate(conversations, inquiries),
      inquiryToCart: 0,
      cartToOrder: rate(inquiries, orders),
      orderToCompletion: rate(orders, completed),
    };
  }

  async getTopProducts(userId: number, period: string) {
    const orgId = await this.resolveOrgId(userId);
    const { from, to } = this.parsePeriod(period);
    const started = Date.now();
    const rows = await this.prisma.$queryRaw<{ productId: number; qty: number; revenue: number }[]>`
      SELECT oi."productId" as "productId",
             SUM(oi.quantity) as qty,
             SUM(oi.price * oi.quantity) as revenue
      FROM order_items oi
      JOIN orders o ON o.id = oi."orderId"
      WHERE o."organizationId" = ${orgId}
        AND o."createdAt" BETWEEN ${from} AND ${to}
      GROUP BY oi."productId"
      ORDER BY revenue DESC
      LIMIT 10;
    `;
    this.logger.verbose(`Top products computed in ${Date.now() - started}ms for orgId=${orgId}, period=${period}`);
    return rows;
  }
}


