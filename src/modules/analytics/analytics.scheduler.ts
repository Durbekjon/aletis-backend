import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@core/prisma/prisma.service';

@Injectable()
export class AnalyticsScheduler {
  private readonly logger = new Logger(AnalyticsScheduler.name);

  constructor(private readonly prisma: PrismaService) {
    // Run at 00:30 UTC daily
    this.scheduleDaily();
  }

  private scheduleDaily(): void {
    const now = new Date();
    const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 30, 0, 0));
    if (next <= now) {
      next.setUTCDate(next.getUTCDate() + 1);
    }
    const delay = next.getTime() - now.getTime();
    setTimeout(() => {
      this.computeDailyAggregates().catch(() => undefined);
      setInterval(() => this.computeDailyAggregates().catch(() => undefined), 24 * 60 * 60 * 1000);
    }, delay);
  }

  private getYesterdayRange(): { from: Date; to: Date } {
    const now = new Date();
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1, 0, 0, 0, 0));
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1, 23, 59, 59, 999));
    return { from: start, to: end };
  }

  async computeDailyAggregates(): Promise<void> {
    const orgs = await this.prisma.organization.findMany({ select: { id: true } });
    const { from, to } = this.getYesterdayRange();
    for (const org of orgs) {
      const revenueAgg = await this.prisma.order.aggregate({
        _sum: { totalPrice: true },
        where: { organizationId: org.id, createdAt: { gte: from, lte: to } },
      });
      const ordersCount = await this.prisma.order.count({
        where: { organizationId: org.id, createdAt: { gte: from, lte: to } },
      });
      const conversations = await this.prisma.message.findMany({
        where: { bot: { organizationId: org.id }, createdAt: { gte: from, lte: to } },
        distinct: ['customerId'],
        select: { customerId: true },
      }).then((arr) => arr.length);
      const inquiries = await this.prisma.message.count({
        where: { bot: { organizationId: org.id }, createdAt: { gte: from, lte: to }, isInquiry: true as any },
      });
      const newCustomers = await this.prisma.customer.count({
        where: { organizationId: org.id, createdAt: { gte: from, lte: to } },
      });
      const ordersCompleted = await this.prisma.order.count({
        where: { organizationId: org.id, status: 'DELIVERED', createdAt: { gte: from, lte: to } },
      });

      await (this.prisma as any).analyticsDailyAggregate.upsert({
        where: { organizationId_day_unique: { organizationId: org.id, day: from } },
        update: {
          revenue: revenueAgg._sum.totalPrice || 0,
          orders: ordersCount,
          conversations,
          inquiries,
          newCustomers,
          ordersCompleted,
        },
        create: {
          organizationId: org.id,
          day: from,
          revenue: revenueAgg._sum.totalPrice || 0,
          orders: ordersCount,
          conversations,
          inquiries,
          newCustomers,
          ordersCompleted,
        },
      });
    }
  }
}


