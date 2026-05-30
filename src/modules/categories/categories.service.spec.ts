import { BadRequestException, NotFoundException } from '@nestjs/common';
import { FieldType } from '@prisma/client';
import { CategoriesService } from './categories.service';
import { PrismaService } from '@/core/prisma/prisma.service';
import { RedisService } from '@/core/redis/redis.service';

function makePrismaMock() {
  return {
    category: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
  };
}

function makeRedisMock() {
  return {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
    del: jest.fn().mockResolvedValue(undefined),
  };
}

describe('CategoriesService', () => {
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

  describe('getTree', () => {
    it('builds a nested tree from flat category rows', async () => {
      prisma.category.findMany.mockResolvedValue([
        {
          id: 1,
          parentId: null,
          slug: 'electronics',
          name_en: 'Electronics',
          name_ru: 'Электроника',
          name_uz: 'Elektronika',
          isLeaf: false,
          depth: 0,
          iconKey: null,
        },
        {
          id: 2,
          parentId: 1,
          slug: 'electronics/phones',
          name_en: 'Phones',
          name_ru: 'Телефоны',
          name_uz: 'Telefonlar',
          isLeaf: false,
          depth: 1,
          iconKey: null,
        },
        {
          id: 3,
          parentId: 2,
          slug: 'electronics/phones/smartphones',
          name_en: 'Smartphones',
          name_ru: 'Смартфоны',
          name_uz: 'Smartfonlar',
          isLeaf: true,
          depth: 2,
          iconKey: 'phone.svg',
        },
      ]);

      const tree = await service.getTree();

      expect(tree).toHaveLength(1);
      expect(tree[0].slug).toBe('electronics');
      expect(tree[0].children).toHaveLength(1);
      expect(tree[0].children[0].slug).toBe('electronics/phones');
      expect(tree[0].children[0].children[0]).toMatchObject({
        id: 3,
        slug: 'electronics/phones/smartphones',
        isLeaf: true,
        iconKey: 'phone.svg',
      });
      expect(redis.set).toHaveBeenCalled();
    });

    it('returns the cached tree when present and skips the DB', async () => {
      const cached = [{ id: 99, children: [] }];
      redis.get.mockResolvedValue(cached);
      const tree = await service.getTree();
      expect(tree).toBe(cached);
      expect(prisma.category.findMany).not.toHaveBeenCalled();
    });
  });

  describe('getResolvedSchema', () => {
    it('throws NotFoundException when the category does not exist', async () => {
      prisma.category.findUnique.mockResolvedValue(null);
      await expect(service.getResolvedSchema(42)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('throws BadRequestException when the category is not a leaf', async () => {
      prisma.category.findUnique.mockResolvedValue({
        id: 1,
        slug: 'electronics',
        isLeaf: false,
        schema: null,
      });
      await expect(service.getResolvedSchema(1)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('returns the flattened schema fields for a leaf, preserving order', async () => {
      prisma.category.findUnique.mockResolvedValue({
        id: 3,
        slug: 'electronics/phones/smartphones',
        isLeaf: true,
        schema: {
          id: 7,
          fields: [
            {
              id: 21,
              key: 'brand',
              label_en: 'Brand',
              label_ru: 'Бренд',
              label_uz: 'Brend',
              type: FieldType.TEXT,
              required: true,
              order: 0,
              options: null,
              validation: null,
              inheritedFromCategoryId: 1,
            },
            {
              id: 22,
              key: 'color',
              label_en: 'Color',
              label_ru: 'Цвет',
              label_uz: 'Rang',
              type: FieldType.ENUM,
              required: false,
              order: 1,
              options: { values: [{ key: 'black' }] },
              validation: null,
              inheritedFromCategoryId: null,
            },
          ],
        },
      });

      const resolved = await service.getResolvedSchema(3);

      expect(resolved.categoryId).toBe(3);
      expect(resolved.categorySlug).toBe('electronics/phones/smartphones');
      expect(resolved.fields.map((f) => f.key)).toEqual(['brand', 'color']);
      expect(resolved.fields[0].inheritedFromCategoryId).toBe(1);
      expect(resolved.fields[1].options).toEqual({
        values: [{ key: 'black' }],
      });
    });
  });
});
