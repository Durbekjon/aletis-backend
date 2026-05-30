import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';
import { PrismaService } from '@/core/prisma/prisma.service';
import {
  FieldType,
  ProductStatus,
  ActionType,
  EntityType,
} from '@prisma/client';
import {
  CreateProductDto,
  UpdateProductDto,
  ProductResponseDto,
  ProductPaginatedResponseDto,
  FieldValueResponseDto,
  ProductImageResponseDto,
} from './dto';
import { PaginationDto } from '@shared/dto';
import { RedisService } from '@core/redis/redis.service';
import { FileDeleteService } from '@core/file-delete/file-delete.service';
import { ActivityLogService } from '../activity-log/activity-log.service';
import { EmbadingService } from '@modules/embading/embading.service';

@Injectable()
export class ProductsService {
  private readonly logger = new Logger(ProductsService.name);

  // Cache key patterns for consistent naming
  private readonly CACHE_KEYS = {
    PRODUCT: (id: number) => `product:${id}`,
    PRODUCTS_LIST: (
      orgId: number,
      page: number,
      limit: number,
      search?: string,
      order?: string,
      status?: string,
    ) =>
      `products:org:${orgId}:page:${page}:limit:${limit}${search ? `:search:${search}` : ''}${order ? `:order:${order}` : ''}${status ? `:status:${status}` : ''}`,
    PRODUCT_DETAILS: (id: number) => `product:${id}:details`,
    ORG_PRODUCTS: (orgId: number) => `org:${orgId}:products`,
    PRODUCT_LOCK: (id: number) => `product:${id}:lock`,
  };

  // TTL values in seconds
  private readonly TTL = {
    PRODUCT: 600, // 10 minutes
    PRODUCTS_LIST: 300, // 5 minutes
    PRODUCT_DETAILS: 600, // 10 minutes
    ORG_PRODUCTS: 900, // 15 minutes
    LOCK: 30,
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly fileDeleteService: FileDeleteService,
    private readonly activityLogService: ActivityLogService,
    private readonly embadingService: EmbadingService,
  ) {}

  // ==================== CACHE HELPER METHODS ====================

  /**
   * Generic cache get method with type safety and error handling
   */
  private async getFromCache<T>(key: string): Promise<T | null> {
    try {
      return await this.redis.get<T>(key);
    } catch (error) {
      this.logger.warn(`Cache get failed for key ${key}:`, error);
      return null;
    }
  }

  /**
   * Generic cache set method with TTL and error handling
   */
  private async setCache<T>(key: string, value: T, ttl: number): Promise<void> {
    try {
      await this.redis.set(key, value, ttl);
    } catch (error) {
      this.logger.warn(`Cache set failed for key ${key}:`, error);
    }
  }

  /**
   * Get or set cache with stampede protection
   * Implements cache-aside pattern with double-checked locking
   */
  private async getOrSetCache<T>(
    key: string,
    ttl: number,
    factory: () => Promise<T>,
    lockKey?: string,
  ): Promise<T> {
    // Try to get from cache first
    const cached = await this.getFromCache<T>(key);
    if (cached !== null) {
      return cached;
    }

    // If lock key provided, implement stampede protection
    if (lockKey) {
      const lockAcquired = await this.acquireLock(lockKey);
      if (!lockAcquired) {
        // Another process is building the cache, wait and retry
        await this.sleep(100);
        const retryCached = await this.getFromCache<T>(key);
        if (retryCached !== null) {
          return retryCached;
        }
      }
    }

    try {
      // Generate the data
      const data = await factory();

      // Cache the result
      await this.setCache(key, data, ttl);

      return data;
    } finally {
      // Release lock if we acquired it
      if (lockKey) {
        await this.releaseLock(lockKey);
      }
    }
  }

  /**
   * Acquire a distributed lock for cache stampede protection
   */
  private async acquireLock(lockKey: string): Promise<boolean> {
    try {
      // Use Redis SET with NX and PX for atomic lock acquisition
      return await this.redis.setNx(lockKey, 'locked', this.TTL.LOCK);
    } catch (error) {
      this.logger.warn(`Lock acquisition failed for ${lockKey}:`, error);
      return false;
    }
  }

  /**
   * Release a distributed lock
   */
  private async releaseLock(lockKey: string): Promise<void> {
    try {
      await this.redis.del(lockKey);
    } catch (error) {
      this.logger.warn(`Lock release failed for ${lockKey}:`, error);
    }
  }

  /**
   * Sleep utility for retry logic
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Invalidate cache by key pattern
   */
  private async invalidateCache(pattern: string): Promise<void> {
    try {
      const keys = await this.redis.keys(pattern);
      if (keys.length > 0) {
        await this.redis.delMultiple(keys);
      }
    } catch (error) {
      this.logger.warn(
        `Cache invalidation failed for pattern ${pattern}:`,
        error,
      );
    }
  }

  /**
   * Invalidate all product-related caches for an organization
   */
  private async invalidateOrganizationProductCaches(
    organizationId: number,
  ): Promise<void> {
    const patterns = [
      `products:org:${organizationId}:*`,
      `org:${organizationId}:products`,
    ];

    await Promise.all(patterns.map((pattern) => this.invalidateCache(pattern)));
  }

  /**
   * Invalidate all caches for a specific product
   */
  private async invalidateProductCaches(productId: number): Promise<void> {
    const patterns = [`product:${productId}*`];

    await Promise.all(patterns.map((pattern) => this.invalidateCache(pattern)));
  }

  /**
   * Pulls the allowed enum keys out of a SchemaField's `options` JSON blob.
   * Expected shape: { values: [{ key: string, label_en?, label_ru?, label_uz? }] }
   */
  private parseEnumOptionKeys(options: unknown): string[] {
    if (!options || typeof options !== 'object') return [];
    const values = (options as { values?: unknown }).values;
    if (!Array.isArray(values)) return [];
    return values
      .map((v) =>
        v && typeof v === 'object' && 'key' in (v as Record<string, unknown>)
          ? String((v as Record<string, unknown>).key)
          : null,
      )
      .filter((k): k is string => k !== null);
  }

  /**
   * Validates a value against its SchemaField definition.
   */
  private validateFieldValue(
    field: { key: string; type: FieldType; required: boolean; options: unknown },
    value: any,
  ): void {
    if (
      field.required &&
      (value === null || value === undefined || value === '')
    ) {
      throw new BadRequestException(`Field "${field.key}" is required`);
    }

    if (value === null || value === undefined || value === '') {
      return;
    }

    switch (field.type) {
      case FieldType.TEXT:
        if (typeof value !== 'string') {
          throw new BadRequestException(
            `Field "${field.key}" must be a string`,
          );
        }
        break;
      case FieldType.NUMBER:
        if (typeof value !== 'number') {
          throw new BadRequestException(
            `Field "${field.key}" must be a number`,
          );
        }
        break;
      case FieldType.BOOLEAN:
        if (typeof value !== 'boolean') {
          throw new BadRequestException(
            `Field "${field.key}" must be a boolean`,
          );
        }
        break;
      case FieldType.DATE:
        if (!(value instanceof Date) && typeof value !== 'string') {
          throw new BadRequestException(
            `Field "${field.key}" must be a date or date string`,
          );
        }
        break;
      case FieldType.ENUM: {
        if (typeof value !== 'string') {
          throw new BadRequestException(
            `Field "${field.key}" must be a string`,
          );
        }
        const keys = this.parseEnumOptionKeys(field.options);
        if (keys.length > 0 && !keys.includes(value)) {
          throw new BadRequestException(
            `Field "${field.key}" must be one of: ${keys.join(', ')}`,
          );
        }
        break;
      }
      case FieldType.ENUM_MULTI: {
        if (!Array.isArray(value) || value.some((v) => typeof v !== 'string')) {
          throw new BadRequestException(
            `Field "${field.key}" must be an array of strings`,
          );
        }
        const keys = this.parseEnumOptionKeys(field.options);
        if (keys.length > 0) {
          const invalid = (value as string[]).filter(
            (v) => !keys.includes(v),
          );
          if (invalid.length > 0) {
            throw new BadRequestException(
              `Field "${field.key}" contains invalid values: ${invalid.join(', ')}`,
            );
          }
        }
        break;
      }
      case FieldType.URL: {
        if (typeof value !== 'string') {
          throw new BadRequestException(
            `Field "${field.key}" must be a string`,
          );
        }
        try {
          new URL(value);
        } catch {
          throw new BadRequestException(
            `Field "${field.key}" must be a valid URL`,
          );
        }
        break;
      }
      default:
        throw new BadRequestException(`Unsupported field type: ${field.type}`);
    }
  }

  /**
   * Validates file ownership for images and file fields
   */
  private async validateFileOwnership(
    fileIds: number[],
    organizationId: number,
  ): Promise<void> {
    if (!fileIds || fileIds.length === 0) return;

    const files = await this.prisma.file.findMany({
      where: { id: { in: fileIds } },
      select: { id: true, organizationId: true },
    });

    if (files.length !== fileIds.length) {
      throw new BadRequestException('One or more files not found');
    }

    const invalidFiles = files.filter(
      (file) => file.organizationId !== organizationId,
    );
    if (invalidFiles.length > 0) {
      throw new BadRequestException(
        'One or more files do not belong to your organization',
      );
    }
  }

  /**
   * Transforms field value to the appropriate Prisma column
   */
  private transformFieldValue(fieldType: FieldType, value: any) {
    const result: any = {};

    switch (fieldType) {
      case FieldType.TEXT:
      case FieldType.URL:
        result.valueText = value;
        break;
      case FieldType.NUMBER:
        result.valueNumber = value;
        break;
      case FieldType.BOOLEAN:
        result.valueBool = value;
        break;
      case FieldType.DATE:
        result.valueDate = value instanceof Date ? value : new Date(value);
        break;
      case FieldType.ENUM:
      case FieldType.ENUM_MULTI:
        result.valueJson = value;
        break;
    }

    return result;
  }

  /**
   * Transforms Prisma field value to response format
   */
  private transformFieldValueResponse(
    fieldValue: any,
    field: { key: string; type: FieldType },
  ): FieldValueResponseDto {
    return {
      id: fieldValue.id,
      fieldId: fieldValue.fieldId,
      fieldKey: field.key,
      fieldType: field.type,
      valueText: fieldValue.valueText,
      valueNumber: fieldValue.valueNumber,
      valueBool: fieldValue.valueBool,
      valueDate: fieldValue.valueDate,
      valueJson: fieldValue.valueJson,
    };
  }

  /**
   * Gets user's organization ID
   */
  private async getUserOrganizationId(userId: number): Promise<number> {
    const member = await this.prisma.member.findUnique({
      where: { userId },
      select: { organizationId: true },
    });

    if (!member) {
      throw new NotFoundException('User organization not found');
    }

    return member.organizationId;
  }

  /**
   * Creates a new product
   */
  async createProduct(
    userId: number,
    createProductDto: CreateProductDto,
  ): Promise<ProductResponseDto> {
    try {
      const organizationId = await this.getUserOrganizationId(userId);

      // Resolve the leaf category and its flattened schema.
      const category = await this.prisma.category.findUnique({
        where: { id: createProductDto.categoryId },
        include: { schema: { include: { fields: true } } },
      });

      if (!category) {
        throw new NotFoundException(
          `Category ${createProductDto.categoryId} not found`,
        );
      }
      if (!category.isLeaf) {
        throw new BadRequestException(
          'Products can only be created in leaf categories',
        );
      }
      if (!category.schema) {
        throw new BadRequestException(
          `Category "${category.slug}" has no schema configured`,
        );
      }

      const schemaFields = category.schema.fields;

      // Validate images if provided
      if (createProductDto.images && createProductDto.images.length > 0) {
        await this.validateFileOwnership(
          createProductDto.images,
          organizationId,
        );
      }

      // Validate field values + check required fields
      const fieldMap = new Map(schemaFields.map((field) => [field.id, field]));
      const providedFieldIds = new Set<number>();
      for (const fieldValue of createProductDto.fields) {
        const field = fieldMap.get(fieldValue.fieldId);
        if (!field) {
          throw new BadRequestException(
            `Field with ID ${fieldValue.fieldId} not part of category "${category.slug}"`,
          );
        }
        this.validateFieldValue(field, fieldValue.value);
        providedFieldIds.add(field.id);
      }
      const missingRequired = schemaFields
        .filter((f) => f.required && !providedFieldIds.has(f.id))
        .map((f) => f.key);
      if (missingRequired.length > 0) {
        throw new BadRequestException(
          `Missing required fields: ${missingRequired.join(', ')}`,
        );
      }

      // Create product with field values in a single transaction
      const result = await this.prisma.$transaction(async (tx) => {
        const product = await tx.product.create({
          data: {
            name: createProductDto.name,
            price: createProductDto.price,
            quantity: createProductDto.quantity,
            status: createProductDto.status,
            currency: createProductDto.currency,
            categoryId: category.id,
            organizationId,
            images: createProductDto.images
              ? {
                  connect: createProductDto.images.map((id) => ({ id })),
                }
              : undefined,
          },
        });

        const fieldValues = await Promise.all(
          createProductDto.fields.map((fieldValue) => {
            const field = fieldMap.get(fieldValue.fieldId)!;
            const transformedValue = this.transformFieldValue(
              field.type,
              fieldValue.value,
            );

            return tx.fieldValue.create({
              data: {
                productId: product.id,
                fieldId: fieldValue.fieldId,
                ...transformedValue,
              },
            });
          }),
        );

        return { product, fieldValues };
      });

      this.logger.log(`Product created successfully: ${result.product.id}`);

      await this.activityLogService.createLog({
        userId,
        organizationId,
        entityType: EntityType.PRODUCT,
        entityId: result.product.id,
        action: ActionType.CREATE,
        templateKey: 'PRODUCT_CREATED',
        data: { name: createProductDto.name },
      });

      const fullProduct = await this.getProductById(result.product.id, userId);
      await this.embadingService.createProductEmbedding(fullProduct);

      await this.invalidateOrganizationProductCaches(organizationId);

      return fullProduct;
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      this.logger.error(
        `Failed to create product: ${error.message}`,
        error.stack,
      );
      throw new InternalServerErrorException('Failed to create product');
    }
  }

  /**
   * Updates a product
   */
  async updateProduct(
    productId: number,
    userId: number,
    updateProductDto: UpdateProductDto,
  ): Promise<ProductResponseDto> {
    try {
      const organizationId = await this.getUserOrganizationId(userId);

      // Check if product exists and belongs to user's organization
      const existingProduct = await this.prisma.product.findFirst({
        where: { id: productId, organizationId },
        include: { category: { include: { schema: { include: { fields: true } } } } },
      });

      if (!existingProduct) {
        throw new NotFoundException(
          'Product not found or does not belong to your organization',
        );
      }
      if (!existingProduct.category.schema) {
        throw new BadRequestException(
          'Product category has no schema configured',
        );
      }
      const schemaFields = existingProduct.category.schema.fields;

      // Validate images if provided
      if (updateProductDto.images && updateProductDto.images.length > 0) {
        await this.validateFileOwnership(
          updateProductDto.images,
          organizationId,
        );
      }

      // Validate field values if provided
      if (updateProductDto.fields) {
        const fieldMap = new Map(
          schemaFields.map((field) => [field.id, field]),
        );
        for (const fieldValue of updateProductDto.fields) {
          if (fieldValue.fieldId) {
            const field = fieldMap.get(fieldValue.fieldId);
            if (!field) {
              throw new BadRequestException(
                `Field with ID ${fieldValue.fieldId} not part of category "${existingProduct.category.slug}"`,
              );
            }
            if (fieldValue.value !== undefined) {
              this.validateFieldValue(field, fieldValue.value);
            }
          }
        }
      }

      // Update product in a transaction
      const result = await this.prisma.$transaction(async (tx) => {
        // Update the product
        const product = await tx.product.update({
          where: { id: productId },
          data: {
            ...(updateProductDto.name && { name: updateProductDto.name }),
            ...(updateProductDto.price !== undefined && {
              price: updateProductDto.price,
            }),
            ...(updateProductDto.quantity !== undefined && {
              quantity: updateProductDto.quantity,
            }),
            ...(updateProductDto.status !== undefined && {
              status: updateProductDto.status,
            }),
            ...(updateProductDto.currency !== undefined && {
              currency: updateProductDto.currency,
            }),
            ...(updateProductDto.images && {
              images: {
                set: updateProductDto.images.map((id) => ({ id })),
              },
            }),
          },
        });

        // Update field values if provided
        if (updateProductDto.fields) {
          for (const fieldValue of updateProductDto.fields) {
            if (fieldValue.fieldId && fieldValue.value !== undefined) {
              const field = schemaFields.find(
                (f) => f.id === fieldValue.fieldId,
              );
              if (field) {
                const transformedValue = this.transformFieldValue(
                  field.type,
                  fieldValue.value,
                );

                await tx.fieldValue.upsert({
                  where: {
                    productId_fieldId: {
                      productId: productId,
                      fieldId: fieldValue.fieldId,
                    },
                  },
                  update: transformedValue,
                  create: {
                    productId: productId,
                    fieldId: fieldValue.fieldId,
                    ...transformedValue,
                  },
                });
              }
            }
          }
        }

        return product;
      });

      this.logger.log(`Product updated successfully: ${result.id}`);

      // Activity Log: Product Updated or Status Changed
      const oldStatus = existingProduct.status;
      const newStatus = result.status;
      if (oldStatus !== newStatus) {
        await this.activityLogService.createLog({
          userId,
          organizationId,
          entityType: EntityType.PRODUCT,
          entityId: result.id,
          action: ActionType.STATUS_CHANGE,
          templateKey: 'PRODUCT_STATUS_CHANGED',
          data: { name: result.name, oldStatus, newStatus },
          meta: { productId: result.id },
        });
      } else {
        await this.activityLogService.createLog({
          userId,
          organizationId,
          entityType: EntityType.PRODUCT,
          entityId: result.id,
          action: ActionType.UPDATE,
          templateKey: 'PRODUCT_UPDATED',
          data: { name: result.name },
          meta: { productId: result.id },
        });
      }

      // Invalidate all caches related to this product and organization
      await Promise.all([
        this.invalidateProductCaches(productId),
        this.invalidateOrganizationProductCaches(organizationId),
      ]);

      // Return the updated product with full details
      return this.getProductById(result.id, userId);
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      this.logger.error(
        `Failed to update product ${productId}: ${error.message}`,
        error.stack,
      );
      throw new InternalServerErrorException('Failed to update product');
    }
  }

  /**
   * Deletes a product
   */
  async deleteProduct(productId: number, userId: number): Promise<void> {
    try {
      const organizationId = await this.getUserOrganizationId(userId);

      // Check if product exists and belongs to user's organization
      const product = await this.prisma.product.findFirst({
        where: { id: productId, organizationId },
        select: { id: true, name: true },
      });

      if (!product) {
        throw new NotFoundException(
          'Product not found or does not belong to your organization',
        );
      }

      // Get product images BEFORE database deletion
      const productWithImages = await this.prisma.product.findUnique({
        where: { id: productId },
        select: { images: { select: { key: true } } },
      });
      if (productWithImages?.images?.length) {
        const keys = productWithImages.images.map((img) => img.key);
        await this.fileDeleteService.deleteFilesByKeys(keys);
      }

      // Delete product (field values will be cascade deleted)
      await this.prisma.product.delete({
        where: { id: productId },
      });

      // Invalidate all caches related to this product and organization
      await Promise.all([
        this.invalidateProductCaches(productId),
        this.invalidateOrganizationProductCaches(organizationId),
      ]);

      this.logger.log(`Product deleted successfully: ${productId}`);

      // Activity Log: Product Deleted
      await this.activityLogService.createLog({
        userId,
        organizationId,
        entityType: EntityType.PRODUCT,
        entityId: productId,
        action: ActionType.DELETE,
        templateKey: 'PRODUCT_DELETED',
        data: { name: product?.name || String(productId) },
        meta: { productId },
      });
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to delete product ${productId}: ${error.message}`,
        error.stack,
      );
      throw new InternalServerErrorException('Failed to delete product');
    }
  }

  /**
   * Gets a product by ID
   */
  async getProductById(
    productId: number,
    userId: number,
  ): Promise<ProductResponseDto> {
    try {
      const organizationId = await this.getUserOrganizationId(userId);

      // Create cache key for product details
      const cacheKey = this.CACHE_KEYS.PRODUCT_DETAILS(productId);
      const lockKey = this.CACHE_KEYS.PRODUCT_LOCK(productId);

      // Use getOrSetCache with stampede protection for individual products
      return await this.getOrSetCache(
        cacheKey,
        this.TTL.PRODUCT_DETAILS,
        async () => {
          const product = await this.prisma.product.findFirst({
            where: { id: productId, organizationId },
            include: {
              category: { select: { id: true, slug: true } },
              images: true,
              fields: {
                include: {
                  field: true,
                },
              },
            },
          });

          if (!product) {
            throw new NotFoundException(
              'Product not found or does not belong to your organization',
            );
          }

          // Transform the response
          const transformedFields: FieldValueResponseDto[] = product.fields.map(
            (fieldValue) =>
              this.transformFieldValueResponse(fieldValue, fieldValue.field),
          );

          const transformedImages: ProductImageResponseDto[] =
            product.images.map((image) => ({
              id: image.id,
              key: image.key,
              originalName: image.originalName,
              size: image.size,
              mimeType: image.mimeType,
            }));

          return {
            id: product.id,
            name: product.name,
            price: product.price,
            quantity: product.quantity,
            currency: product.currency,
            status: product.status,
            categoryId: product.category.id,
            categorySlug: product.category.slug,
            organizationId: product.organizationId,
            images: transformedImages,
            fields: transformedFields,
            createdAt: product.createdAt,
            updatedAt: product.updatedAt,
          };
        },
        lockKey, // Use lock key for stampede protection
      );
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to get product ${productId}: ${error.message}`,
        error.stack,
      );
      throw new InternalServerErrorException('Failed to retrieve product');
    }
  }

  /**
   * Gets products with pagination and search
   */
  async getProducts(
    userId: number,
    paginationDto: PaginationDto,
  ): Promise<ProductPaginatedResponseDto> {
    try {
      const organizationId = await this.getUserOrganizationId(userId);
      const { page, limit, search, order, status } = paginationDto;

      // Create cache key for this specific query
      const cacheKey = this.CACHE_KEYS.PRODUCTS_LIST(
        organizationId,
        page || 1,
        limit || 20,
        search,
        order,
        status,
      );

      // Use getOrSetCache with stampede protection
      return await this.getOrSetCache(
        cacheKey,
        this.TTL.PRODUCTS_LIST,
        async () => {
          const skip = paginationDto.skip;
          const take = paginationDto.take;

          // Build the where clause
          const where: any = {
            organizationId,
          };

          // Add search filter if provided
          if (search && search.trim()) {
            const searchTerm = search.trim();
            where.OR = [
              {
                name: {
                  contains: searchTerm,
                  mode: 'insensitive',
                },
              },
              {
                fields: {
                  some: {
                    OR: [
                      {
                        valueText: {
                          contains: searchTerm,
                          mode: 'insensitive',
                        },
                      },
                      {
                        valueJson: {
                          path: ['$'],
                          string_contains: searchTerm,
                        },
                      },
                    ],
                  },
                },
              },
            ];
          }

          // Add status filter if provided
          if (status && status.trim()) {
            where.status = status.trim() as ProductStatus;
          }

          // Build the orderBy clause
          const orderBy = {
            createdAt: order,
          };

          // Execute queries in parallel for better performance
          const [products, total] = await Promise.all([
            this.prisma.product.findMany({
              where,
              orderBy,
              skip,
              take,
              include: {
                category: { select: { id: true, slug: true } },
                images: {
                  select: {
                    id: true,
                    key: true,
                  },
                },
                fields: {
                  include: {
                    field: true,
                  },
                },
              },
            }),
            this.prisma.product.count({
              where,
            }),
          ]);

          // Transform the response
          const transformedProducts: ProductResponseDto[] = products.map(
            (product) => {
              const transformedFields: FieldValueResponseDto[] =
                product.fields.map((fieldValue) =>
                  this.transformFieldValueResponse(
                    fieldValue,
                    fieldValue.field,
                  ),
                );

              const transformedImages: ProductImageResponseDto[] =
                product.images.map((image) => ({
                  id: image.id,
                  key: image.key,
                }));

              return {
                id: product.id,
                name: product.name,
                price: product.price,
                quantity: product.quantity,
                status: product.status,
                categoryId: product.category.id,
                categorySlug: product.category.slug,
                organizationId: product.organizationId,
                currency: product.currency,
                images: transformedImages,
                fields: transformedFields,
                createdAt: product.createdAt,
                updatedAt: product.updatedAt,
              };
            },
          );

          this.logger.log(
            `Retrieved ${products.length} products for organization ${organizationId} (page ${page}, total: ${total})`,
          );

          return new ProductPaginatedResponseDto(
            transformedProducts,
            total,
            page || 1,
            limit || 20,
          );
        },
        // No lock key needed for list queries as they're less prone to stampede
      );
    } catch (error) {
      this.logger.error(
        `Failed to get products for organization: ${error.message}`,
        error.stack,
      );
      throw new InternalServerErrorException('Failed to retrieve products');
    }
  }
  /**
   * Bulk deletes products
   */
  async bulkDeleteProducts(
    userId: number,
    productIds: number[],
  ): Promise<void> {
    try {
      if (!productIds || productIds.length === 0) {
        throw new BadRequestException('No product IDs provided');
      }

      const organizationId = await this.getUserOrganizationId(userId);

      // Check if all products exist and belong to user's organization
      const products = await this.prisma.product.findMany({
        where: { id: { in: productIds }, organizationId },
        select: { id: true },
      });

      if (products.length !== productIds.length) {
        const foundIds = products.map((p) => p.id);
        const missingIds = productIds.filter((id) => !foundIds.includes(id));
        throw new NotFoundException(
          `Products not found or do not belong to your organization: ${missingIds.join(', ')}`,
        );
      }

      // Delete products in a transaction
      await this.prisma.$transaction(
        productIds.map((id) =>
          this.prisma.product.delete({
            where: { id },
          }),
        ),
      );

      // Invalidate all caches related to deleted products and organization
      await Promise.all([
        ...productIds.map((id) => this.invalidateProductCaches(id)),
        this.invalidateOrganizationProductCaches(organizationId),
      ]);

      this.logger.log(`Successfully deleted ${products.length} products`);
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      this.logger.error(
        `Failed to bulk delete products: ${error.message}`,
        error.stack,
      );
      throw new InternalServerErrorException('Failed to delete products');
    }
  }
}
