import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CategoriesService } from './categories.service';
import { PrismaService } from '@/core/prisma/prisma.service';
import { RedisService } from '@/core/redis/redis.service';

function makePrismaMock() {
  const tx = {
    category: { create: jest.fn(), update: jest.fn() },
    categorySchema: { create: jest.fn() },
  };
  return {
    category: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    categorySchema: { create: jest.fn() },
    product: { count: jest.fn() },
    $transaction: jest.fn(async (cb: (t: typeof tx) => Promise<unknown>) =>
      cb(tx),
    ),
    __tx: tx,
  };
}

function makeRedisMock() {
  return {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
    del: jest.fn().mockResolvedValue(undefined),
  };
}

describe('CategoriesService (admin write paths)', () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let redis: ReturnType<typeof makeRedisMock>;
  let service: CategoriesService;

  beforeEach(() => {
    prisma = makePrismaMock();
    redis = makeRedisMock();
    service = new CategoriesService(
      prisma as unknown as PrismaService,
      redis as unknown as RedisService,
    );
  });

  describe('create', () => {
    it('derives depth and path from the parent and appends self.id', async () => {
      prisma.category.findUnique.mockResolvedValue({
        id: 2,
        slug: 'electronics/phones',
        isArchived: false,
        isLeaf: false,
        depth: 1,
        path: [1, 2],
      });
      prisma.__tx.category.create.mockResolvedValue({
        id: 99,
        slug: 'electronics/phones/smartphones',
        isLeaf: true,
        depth: 2,
        parentId: 2,
        path: [1, 2],
        isArchived: false,
        archivedAt: null,
        name_en: 'Smartphones',
        name_ru: 'Смартфоны',
        name_uz: 'Smartfonlar',
        iconKey: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      prisma.__tx.category.update.mockResolvedValue({
        id: 99,
        slug: 'electronics/phones/smartphones',
        isLeaf: true,
        depth: 2,
        parentId: 2,
        path: [1, 2, 99],
        isArchived: false,
        archivedAt: null,
        name_en: 'Smartphones',
        name_ru: 'Смартфоны',
        name_uz: 'Smartfonlar',
        iconKey: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.create({
        parentId: 2,
        slug: 'electronics/phones/smartphones',
        name_en: 'Smartphones',
        name_ru: 'Смартфоны',
        name_uz: 'Smartfonlar',
        isLeaf: true,
      });

      const createArgs = prisma.__tx.category.create.mock.calls[0][0];
      expect(createArgs.data.depth).toBe(2);
      expect(createArgs.data.path).toEqual([1, 2]);

      const updateArgs = prisma.__tx.category.update.mock.calls[0][0];
      expect(updateArgs.data.path).toEqual([1, 2, 99]);

      expect(prisma.__tx.categorySchema.create).toHaveBeenCalledWith({
        data: { categoryId: 99 },
      });
      expect(redis.del).toHaveBeenCalled();
      expect(result.path).toEqual([1, 2, 99]);
    });

    it('treats omitted parentId as a root node (depth 0, no auto-schema for non-leaf)', async () => {
      prisma.__tx.category.create.mockResolvedValue({
        id: 1,
        slug: 'electronics',
        isLeaf: false,
        depth: 0,
        parentId: null,
        path: [],
        isArchived: false,
        archivedAt: null,
        name_en: 'Electronics',
        name_ru: 'Электроника',
        name_uz: 'Elektronika',
        iconKey: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      prisma.__tx.category.update.mockResolvedValue({
        id: 1,
        slug: 'electronics',
        isLeaf: false,
        depth: 0,
        parentId: null,
        path: [1],
        isArchived: false,
        archivedAt: null,
        name_en: 'Electronics',
        name_ru: 'Электроника',
        name_uz: 'Elektronika',
        iconKey: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await service.create({
        slug: 'electronics',
        name_en: 'Electronics',
        name_ru: 'Электроника',
        name_uz: 'Elektronika',
      });

      expect(prisma.category.findUnique).not.toHaveBeenCalled();
      expect(prisma.__tx.category.create.mock.calls[0][0].data.depth).toBe(0);
      expect(prisma.__tx.categorySchema.create).not.toHaveBeenCalled();
    });

    it('rejects when the parent is archived', async () => {
      prisma.category.findUnique.mockResolvedValue({
        id: 2,
        slug: 'electronics/phones',
        isArchived: true,
        isLeaf: false,
        depth: 1,
        path: [1, 2],
      });

      await expect(
        service.create({
          parentId: 2,
          slug: 'electronics/phones/smartphones',
          name_en: 'Smartphones',
          name_ru: 'Смартфоны',
          name_uz: 'Smartfonlar',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects when the parent is itself a leaf', async () => {
      prisma.category.findUnique.mockResolvedValue({
        id: 3,
        slug: 'electronics/phones/smartphones',
        isArchived: false,
        isLeaf: true,
        depth: 2,
        path: [1, 2, 3],
      });

      await expect(
        service.create({
          parentId: 3,
          slug: 'electronics/phones/smartphones/foldables',
          name_en: 'Foldables',
          name_ru: 'Складные',
          name_uz: 'Buklanadigan',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('translates Prisma unique-violation into ConflictException', async () => {
      prisma.__tx.category.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('dup', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      );

      await expect(
        service.create({
          slug: 'electronics',
          name_en: 'Electronics',
          name_ru: 'Электроника',
          name_uz: 'Elektronika',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('archive', () => {
    it('refuses if non-archived descendants exist', async () => {
      prisma.category.findUnique.mockResolvedValue({
        id: 2,
        slug: 'electronics/phones',
        isLeaf: false,
        isArchived: false,
      });
      prisma.category.count.mockResolvedValue(3);

      await expect(service.archive(2)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.category.update).not.toHaveBeenCalled();
    });

    it('refuses if a leaf still has live products', async () => {
      prisma.category.findUnique.mockResolvedValue({
        id: 3,
        slug: 'electronics/phones/smartphones',
        isLeaf: true,
        isArchived: false,
      });
      prisma.category.count.mockResolvedValue(0);
      prisma.product.count.mockResolvedValue(7);

      await expect(service.archive(3)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.category.update).not.toHaveBeenCalled();
    });

    it('archives when nothing blocks and invalidates the tree cache', async () => {
      const now = new Date();
      prisma.category.findUnique.mockResolvedValue({
        id: 3,
        slug: 'electronics/phones/smartphones',
        isLeaf: true,
        isArchived: false,
      });
      prisma.category.count.mockResolvedValue(0);
      prisma.product.count.mockResolvedValue(0);
      prisma.category.update.mockResolvedValue({
        id: 3,
        slug: 'electronics/phones/smartphones',
        parentId: 2,
        name_en: 'Smartphones',
        name_ru: 'Смартфоны',
        name_uz: 'Smartfonlar',
        iconKey: null,
        isLeaf: true,
        depth: 2,
        path: [1, 2, 3],
        isArchived: true,
        archivedAt: now,
        createdAt: now,
        updatedAt: now,
      });

      const result = await service.archive(3);
      expect(result.isArchived).toBe(true);
      expect(redis.del).toHaveBeenCalled();
    });

    it('throws NotFoundException when the category does not exist', async () => {
      prisma.category.findUnique.mockResolvedValue(null);
      await expect(service.archive(999)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('restore', () => {
    it('refuses if the parent is still archived', async () => {
      prisma.category.findUnique
        .mockResolvedValueOnce({
          id: 3,
          slug: 'electronics/phones/smartphones',
          isArchived: true,
          parentId: 2,
        })
        .mockResolvedValueOnce({ isArchived: true, slug: 'electronics/phones' });

      await expect(service.restore(3)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });
});
