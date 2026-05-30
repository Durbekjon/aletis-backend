import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Category, Prisma } from '@prisma/client';
import { PrismaService } from '@/core/prisma/prisma.service';
import { RedisService } from '@/core/redis/redis.service';
import {
  AdminCategoryDto,
  CategoryTreeNodeDto,
  CreateCategoryDto,
  ResolvedCategorySchemaDto,
  ResolvedSchemaFieldDto,
  UpdateCategoryDto,
} from './dto';

const TREE_CACHE_KEY = 'categories:tree:v1';
const TREE_CACHE_TTL_SECONDS = 60 * 10;

@Injectable()
export class CategoriesService {
  private readonly logger = new Logger(CategoriesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async getTree(): Promise<CategoryTreeNodeDto[]> {
    const cached = await this.redis
      .get<CategoryTreeNodeDto[]>(TREE_CACHE_KEY)
      .catch(() => null);
    if (cached) return cached;

    // Buyer-facing tree hides archived nodes.
    const all = await this.prisma.category.findMany({
      where: { isArchived: false },
      orderBy: [{ depth: 'asc' }, { name_en: 'asc' }],
    });
    const tree = this.buildTree(all);
    await this.redis
      .set(TREE_CACHE_KEY, tree, TREE_CACHE_TTL_SECONDS)
      .catch((err) =>
        this.logger.warn(`Failed to cache category tree: ${err.message}`),
      );
    return tree;
  }

  async getChildren(parentId: number): Promise<CategoryTreeNodeDto[]> {
    const children = await this.prisma.category.findMany({
      where: { parentId, isArchived: false },
      orderBy: { name_en: 'asc' },
    });
    return children.map((c) => this.toNode(c, []));
  }

  async getResolvedSchema(
    categoryId: number,
  ): Promise<ResolvedCategorySchemaDto> {
    const category = await this.prisma.category.findUnique({
      where: { id: categoryId },
      include: {
        schema: {
          include: {
            fields: { orderBy: { order: 'asc' } },
          },
        },
      },
    });
    if (!category) {
      throw new NotFoundException(`Category ${categoryId} not found`);
    }
    if (!category.isLeaf) {
      throw new BadRequestException(
        `Category "${category.slug}" is not a leaf category and has no schema`,
      );
    }
    const fields: ResolvedSchemaFieldDto[] =
      category.schema?.fields.map((f) => ({
        id: f.id,
        key: f.key,
        label_en: f.label_en,
        label_ru: f.label_ru,
        label_uz: f.label_uz,
        type: f.type,
        required: f.required,
        order: f.order,
        options: f.options,
        validation: f.validation,
        inheritedFromCategoryId: f.inheritedFromCategoryId,
      })) ?? [];

    return {
      categoryId: category.id,
      categorySlug: category.slug,
      fields,
    };
  }

  async search(query: string, limit = 20): Promise<CategoryTreeNodeDto[]> {
    const term = query.trim();
    if (term.length === 0) return [];
    const safeLimit = Math.min(Math.max(limit, 1), 50);
    const results = await this.prisma.category.findMany({
      where: {
        isArchived: false,
        OR: [
          { slug: { contains: term, mode: Prisma.QueryMode.insensitive } },
          { name_en: { contains: term, mode: Prisma.QueryMode.insensitive } },
          { name_ru: { contains: term, mode: Prisma.QueryMode.insensitive } },
          { name_uz: { contains: term, mode: Prisma.QueryMode.insensitive } },
        ],
      },
      take: safeLimit,
      orderBy: [{ isLeaf: 'desc' }, { depth: 'asc' }, { name_en: 'asc' }],
    });
    return results.map((c) => this.toNode(c, []));
  }

  // ───────────────────────────────────────────────────────────────────────
  // Admin surface — kept here so the read + write paths share path/depth
  // mechanics, cache invalidation, and the same type-narrowing helpers.
  // All callers are gated by PlatformAdminGuard at the controller layer.
  // ───────────────────────────────────────────────────────────────────────

  async listAll(includeArchived: boolean): Promise<AdminCategoryDto[]> {
    const rows = await this.prisma.category.findMany({
      where: includeArchived ? undefined : { isArchived: false },
      orderBy: [{ depth: 'asc' }, { name_en: 'asc' }],
    });
    return rows.map((r) => this.toAdminDto(r));
  }

  async create(dto: CreateCategoryDto): Promise<AdminCategoryDto> {
    // Resolve the parent up-front so we can derive depth + path correctly.
    let parent: Category | null = null;
    if (dto.parentId != null) {
      parent = await this.prisma.category.findUnique({
        where: { id: dto.parentId },
      });
      if (!parent) {
        throw new NotFoundException(`Parent category ${dto.parentId} not found`);
      }
      if (parent.isArchived) {
        throw new BadRequestException(
          `Cannot attach to archived parent ${parent.slug}`,
        );
      }
      if (parent.isLeaf) {
        throw new BadRequestException(
          `Parent ${parent.slug} is a leaf and cannot have children`,
        );
      }
    }

    const depth = parent ? parent.depth + 1 : 0;
    const parentPath = parent ? parent.path : [];
    const isLeaf = dto.isLeaf ?? false;

    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const row = await tx.category.create({
          data: {
            slug: dto.slug,
            name_en: dto.name_en,
            name_ru: dto.name_ru,
            name_uz: dto.name_uz,
            iconKey: dto.iconKey ?? null,
            isLeaf,
            depth,
            parentId: parent?.id ?? null,
            path: parentPath, // patched on the next line once we know the id
          },
        });
        const withPath = await tx.category.update({
          where: { id: row.id },
          data: { path: [...parentPath, row.id] },
        });
        if (isLeaf) {
          // Empty schema so `getResolvedSchema` returns [] instead of 404.
          await tx.categorySchema.create({
            data: { categoryId: withPath.id },
          });
        }
        return withPath;
      });

      await this.invalidateTreeCache();
      this.logger.log(`Created category ${created.slug} (id=${created.id})`);
      return this.toAdminDto(created);
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException(
          `Slug "${dto.slug}" is already in use`,
        );
      }
      throw err;
    }
  }

  async update(
    id: number,
    dto: UpdateCategoryDto,
  ): Promise<AdminCategoryDto> {
    await this.requireCategory(id);
    const data: Prisma.CategoryUpdateInput = {};
    if (dto.name_en !== undefined) data.name_en = dto.name_en;
    if (dto.name_ru !== undefined) data.name_ru = dto.name_ru;
    if (dto.name_uz !== undefined) data.name_uz = dto.name_uz;
    if (dto.iconKey !== undefined) data.iconKey = dto.iconKey;

    const updated = await this.prisma.category.update({ where: { id }, data });
    await this.invalidateTreeCache();
    return this.toAdminDto(updated);
  }

  async archive(id: number): Promise<AdminCategoryDto> {
    const category = await this.requireCategory(id);
    if (category.isArchived) {
      return this.toAdminDto(category);
    }

    // Refuse if any active descendants exist — operator must archive bottom-up.
    const activeDescendants = await this.prisma.category.count({
      where: { parentId: id, isArchived: false },
    });
    if (activeDescendants > 0) {
      throw new BadRequestException(
        `Category ${category.slug} has ${activeDescendants} active child categor${
          activeDescendants === 1 ? 'y' : 'ies'
        }; archive them first.`,
      );
    }

    // Refuse if any live products still belong to this leaf.
    if (category.isLeaf) {
      const liveProducts = await this.prisma.product.count({
        where: {
          categoryId: id,
          isDeleted: false,
          status: { not: 'ARCHIVED' },
        },
      });
      if (liveProducts > 0) {
        throw new BadRequestException(
          `Category ${category.slug} has ${liveProducts} live product${
            liveProducts === 1 ? '' : 's'
          }; archive or move them first.`,
        );
      }
    }

    const archived = await this.prisma.category.update({
      where: { id },
      data: { isArchived: true, archivedAt: new Date() },
    });
    await this.invalidateTreeCache();
    this.logger.log(`Archived category ${archived.slug} (id=${id})`);
    return this.toAdminDto(archived);
  }

  async restore(id: number): Promise<AdminCategoryDto> {
    const category = await this.requireCategory(id);
    if (!category.isArchived) {
      return this.toAdminDto(category);
    }

    // Can't restore under an archived parent — re-attach forces a clean tree.
    if (category.parentId != null) {
      const parent = await this.prisma.category.findUnique({
        where: { id: category.parentId },
        select: { isArchived: true, slug: true },
      });
      if (parent?.isArchived) {
        throw new BadRequestException(
          `Cannot restore under archived parent ${parent.slug}; restore the parent first.`,
        );
      }
    }

    const restored = await this.prisma.category.update({
      where: { id },
      data: { isArchived: false, archivedAt: null },
    });
    await this.invalidateTreeCache();
    this.logger.log(`Restored category ${restored.slug} (id=${id})`);
    return this.toAdminDto(restored);
  }

  private async requireCategory(id: number): Promise<Category> {
    const row = await this.prisma.category.findUnique({ where: { id } });
    if (!row) {
      throw new NotFoundException(`Category ${id} not found`);
    }
    return row;
  }

  private toAdminDto(c: Category): AdminCategoryDto {
    return {
      id: c.id,
      parentId: c.parentId,
      slug: c.slug,
      name_en: c.name_en,
      name_ru: c.name_ru,
      name_uz: c.name_uz,
      iconKey: c.iconKey,
      isLeaf: c.isLeaf,
      depth: c.depth,
      path: c.path,
      isArchived: c.isArchived,
      archivedAt: c.archivedAt,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    };
  }

  async invalidateTreeCache(): Promise<void> {
    await this.redis.del(TREE_CACHE_KEY).catch(() => undefined);
  }

  private buildTree(rows: Category[]): CategoryTreeNodeDto[] {
    const byId = new Map<number, CategoryTreeNodeDto>();
    for (const row of rows) {
      byId.set(row.id, this.toNode(row, []));
    }
    const roots: CategoryTreeNodeDto[] = [];
    for (const row of rows) {
      const node = byId.get(row.id)!;
      if (row.parentId == null) {
        roots.push(node);
        continue;
      }
      const parent = byId.get(row.parentId);
      if (parent) {
        parent.children.push(node);
      } else {
        roots.push(node);
      }
    }
    return roots;
  }

  private toNode(c: Category, children: CategoryTreeNodeDto[]): CategoryTreeNodeDto {
    return {
      id: c.id,
      slug: c.slug,
      name_en: c.name_en,
      name_ru: c.name_ru,
      name_uz: c.name_uz,
      isLeaf: c.isLeaf,
      depth: c.depth,
      iconKey: c.iconKey,
      children,
    };
  }
}
