import { BadRequestException } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { PrismaService } from '@/core/prisma/prisma.service';
import { ActivityLogService } from '../activity-log/activity-log.service';

function makePrismaMock() {
  return {
    member: { findUnique: jest.fn() },
    customer: { findUnique: jest.fn() },
    product: { findMany: jest.fn() },
    order: { create: jest.fn() },
  };
}

describe('OrdersService.createOrder (productIds path)', () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let activity: { createLog: jest.Mock };
  let service: OrdersService;

  beforeEach(() => {
    prisma = makePrismaMock();
    activity = { createLog: jest.fn().mockResolvedValue(undefined) };
    service = new OrdersService(
      prisma as unknown as PrismaService,
      activity as unknown as ActivityLogService,
    );
    prisma.member.findUnique.mockResolvedValue({ organizationId: 99 });
  });

  it('batches the product lookup into a single findMany() call', async () => {
    prisma.product.findMany.mockResolvedValue([
      { id: 1, price: 10 },
      { id: 2, price: 20 },
      { id: 3, price: 30 },
    ]);
    prisma.order.create.mockResolvedValue({
      id: 500,
      organizationId: 99,
      status: 'NEW',
      paymentStatus: 'PENDING',
      totalPrice: 60,
      createdAt: new Date(),
      updatedAt: new Date(),
      currency: 'USD',
      customerId: null,
      customer: null,
      orderItems: [
        { id: 1, productId: 1, quantity: 1, price: 10, product: { id: 1 } },
        { id: 2, productId: 2, quantity: 1, price: 20, product: { id: 2 } },
        { id: 3, productId: 3, quantity: 1, price: 30, product: { id: 3 } },
      ],
      details: null,
      trackingNumber: null,
      discountAmount: null,
      discountPercentage: null,
      notes: null,
    });

    await service.createOrder(1, { productIds: [1, 2, 3] });

    expect(prisma.product.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: [1, 2, 3] }, organizationId: 99 },
      }),
    );
  });

  it('rejects when a productId does not belong to the user organization', async () => {
    // Only one of the two requested ids comes back -> mismatch
    prisma.product.findMany.mockResolvedValue([{ id: 1, price: 10 }]);

    await expect(
      service.createOrder(1, { productIds: [1, 999] }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.order.create).not.toHaveBeenCalled();
  });

  it('uses Map lookup for prices (not Array.find) and computes the total correctly', async () => {
    prisma.product.findMany.mockResolvedValue([
      { id: 1, price: 10 },
      { id: 2, price: 25.5 },
    ]);
    let capturedCreate: any;
    prisma.order.create.mockImplementation((args: any) => {
      capturedCreate = args;
      return Promise.resolve({
        id: 1,
        organizationId: 99,
        status: 'NEW',
        paymentStatus: 'PENDING',
        totalPrice: args.data.totalPrice,
        createdAt: new Date(),
        updatedAt: new Date(),
        currency: 'USD',
        customerId: null,
        customer: null,
        orderItems: [],
        details: null,
        trackingNumber: null,
        discountAmount: null,
        discountPercentage: null,
        notes: null,
      });
    });

    await service.createOrder(1, { productIds: [1, 2] });

    expect(capturedCreate.data.totalPrice).toBeCloseTo(35.5);
    const itemsCreate = capturedCreate.data.orderItems.create;
    expect(itemsCreate).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ productId: 1, price: 10, quantity: 1 }),
        expect.objectContaining({ productId: 2, price: 25.5, quantity: 1 }),
      ]),
    );
  });
});
