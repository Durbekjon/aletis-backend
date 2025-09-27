import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
  InternalServerErrorException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { FieldType } from '@prisma/client';
import {
  CreateProductDto,
  UpdateProductDto,
  ProductResponseDto,
  ProductPaginatedResponseDto,
  FieldValueResponseDto,
  ProductImageResponseDto,
} from './dto';
import { PaginationDto } from '../../shared/dto';

@Injectable()
export class ProductsService {
  private readonly logger = new Logger(ProductsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Validates field value based on field type and requirements
   */
  private validateFieldValue(
    field: { type: FieldType; required: boolean; options?: string[] },
    value: any,
  ): void {
      if (field.required && (value === null || value === undefined || value === '')) {
        throw new BadRequestException(`Field ${field.type} is required`);
      }

    if (value === null || value === undefined || value === '') {
      return; // Optional field can be empty
    }

    switch (field.type) {
      case FieldType.TEXT:
        if (typeof value !== 'string') {
          throw new BadRequestException('Text field must be a string');
        }
        break;
      case FieldType.NUMBER:
        if (typeof value !== 'number') {
          throw new BadRequestException('Number field must be a number');
        }
        break;
      case FieldType.BOOLEAN:
        if (typeof value !== 'boolean') {
          throw new BadRequestException('Boolean field must be a boolean');
        }
        break;
      case FieldType.DATE:
        if (!(value instanceof Date) && typeof value !== 'string') {
          throw new BadRequestException('Date field must be a date or date string');
        }
        break;
      case FieldType.ENUM:
        if (typeof value !== 'string') {
          throw new BadRequestException('Enum field must be a string');
        }
        if (field.options && !field.options.includes(value)) {
          throw new BadRequestException(`Enum value must be one of: ${field.options.join(', ')}`);
        }
        break;
      case FieldType.IMAGE:
      case FieldType.FILE:
        if (typeof value !== 'object' || !value.fileId) {
          throw new BadRequestException('File/Image field must be an object with fileId');
        }
        break;
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

    const invalidFiles = files.filter(file => file.organizationId !== organizationId);
    if (invalidFiles.length > 0) {
      throw new BadRequestException('One or more files do not belong to your organization');
    }
  }

  /**
   * Transforms field value to the appropriate Prisma field
   */
  private transformFieldValue(fieldType: FieldType, value: any) {
    const result: any = {};

    switch (fieldType) {
      case FieldType.TEXT:
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
      case FieldType.IMAGE:
      case FieldType.FILE:
        result.valueJson = value;
        break;
    }

    return result;
  }

  /**
   * Transforms Prisma field value to response format
   */
  private transformFieldValueResponse(fieldValue: any, field: any): FieldValueResponseDto {
    return {
      id: fieldValue.id,
      fieldId: fieldValue.fieldId,
      fieldName: field.name,
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

      // Get the organization's schema
      const schema = await this.prisma.productSchema.findUnique({
        where: { organizationId },
        include: { fields: true },
      });

      if (!schema) {
        throw new NotFoundException('Product schema not found for organization');
      }

      // Validate images if provided
      if (createProductDto.images && createProductDto.images.length > 0) {
        await this.validateFileOwnership(createProductDto.images, organizationId);
      }
      console.log({b:createProductDto.fields})
      // Validate field values
      const fieldMap = new Map(schema.fields.map(field => [field.id, field]));
      for (const fieldValue of createProductDto.fields) {
        const field = fieldMap.get(fieldValue.fieldId);
        if (!field) {
          throw new BadRequestException(`Field with ID ${fieldValue.fieldId} not found in schema`);
        }
        this.validateFieldValue(field, fieldValue.value);
      }

      // Create product with field values in a transaction
      const result = await this.prisma.$transaction(async (tx) => {
        // Create the product
        const product = await tx.product.create({
          data: {
            name: createProductDto.name,
            price: createProductDto.price,
            schemaId: schema.id,
            organizationId,
            images: createProductDto.images ? {
              connect: createProductDto.images.map(id => ({ id }))
            } : undefined,
          },
        });

        // Create field values
        const fieldValues = await Promise.all(
          createProductDto.fields.map(fieldValue => {
            const field = fieldMap.get(fieldValue.fieldId)!;
            const transformedValue = this.transformFieldValue(field.type, fieldValue.value);
            
            return tx.fieldValue.create({
              data: {
                productId: product.id,
                fieldId: fieldValue.fieldId,
                ...transformedValue,
              },
            });
          })
        );

        return { product, fieldValues };
      });

      this.logger.log(`Product created successfully: ${result.product.id}`);

      // Return the created product with full details
      return this.getProductById(result.product.id, userId);
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      this.logger.error(`Failed to create product: ${error.message}`, error.stack);
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
        include: { schema: { include: { fields: true } } },
      });

      if (!existingProduct) {
        throw new NotFoundException('Product not found or does not belong to your organization');
      }

      // Validate images if provided
      if (updateProductDto.images && updateProductDto.images.length > 0) {
        await this.validateFileOwnership(updateProductDto.images, organizationId);
      }

      // Validate field values if provided
      if (updateProductDto.fields) {
        const fieldMap = new Map(existingProduct.schema.fields.map(field => [field.id, field]));
        for (const fieldValue of updateProductDto.fields) {
          if (fieldValue.fieldId) {
            const field = fieldMap.get(fieldValue.fieldId);
            if (!field) {
              throw new BadRequestException(`Field with ID ${fieldValue.fieldId} not found in schema`);
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
            ...(updateProductDto.price !== undefined && { price: updateProductDto.price }),
            ...(updateProductDto.images && {
              images: {
                set: updateProductDto.images.map(id => ({ id }))
              }
            }),
          },
        });

        // Update field values if provided
        if (updateProductDto.fields) {
          for (const fieldValue of updateProductDto.fields) {
            if (fieldValue.fieldId && fieldValue.value !== undefined) {
              const field = existingProduct.schema.fields.find(f => f.id === fieldValue.fieldId);
              if (field) {
                const transformedValue = this.transformFieldValue(field.type, fieldValue.value);
                
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

      // Return the updated product with full details
      return this.getProductById(result.id, userId);
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      this.logger.error(`Failed to update product ${productId}: ${error.message}`, error.stack);
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
      });

      if (!product) {
        throw new NotFoundException('Product not found or does not belong to your organization');
      }

      // Delete product (field values will be cascade deleted)
      await this.prisma.product.delete({
        where: { id: productId },
      });

      this.logger.log(`Product deleted successfully: ${productId}`);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(`Failed to delete product ${productId}: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Failed to delete product');
    }
  }

  /**
   * Gets a product by ID
   */
  async getProductById(productId: number, userId: number): Promise<ProductResponseDto> {
    try {
      const organizationId = await this.getUserOrganizationId(userId);

      const product = await this.prisma.product.findFirst({
        where: { id: productId, organizationId },
        include: {
          schema: true,
          images: true,
          fields: {
            include: {
              field: true,
            },
          },
        },
      });

      if (!product) {
        throw new NotFoundException('Product not found or does not belong to your organization');
      }

      // Transform the response
      const transformedFields: FieldValueResponseDto[] = product.fields.map(fieldValue =>
        this.transformFieldValueResponse(fieldValue, fieldValue.field)
      );

      const transformedImages: ProductImageResponseDto[] = product.images.map(image => ({
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
        schemaId: product.schemaId,
        schemaName: product.schema.name,
        organizationId: product.organizationId,
        images: transformedImages,
        fields: transformedFields,
        createdAt: product.createdAt,
        updatedAt: product.updatedAt,
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(`Failed to get product ${productId}: ${error.message}`, error.stack);
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
      const { page, limit, search, order } = paginationDto;
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
            schema: true,
            images: {
              select: {
                id: true,
                key: true,
              }
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
      const transformedProducts: ProductResponseDto[] = products.map(product => {
        const transformedFields: FieldValueResponseDto[] = product.fields.map(fieldValue =>
          this.transformFieldValueResponse(fieldValue, fieldValue.field)
        );

        const transformedImages: ProductImageResponseDto[] = product.images.map(image => ({
          id: image.id,
          key: image.key,
          // originalName: image.originalName,
          // size: image.size,
          // mimeType: image.mimeType,
        }));

        return {
          id: product.id,
          name: product.name,
          price: product.price,
          schemaId: product.schemaId,
          schemaName: product.schema.name,
          organizationId: product.organizationId,
          images: transformedImages,
          fields: transformedFields,
          createdAt: product.createdAt,
          updatedAt: product.updatedAt,
        };
      });

      this.logger.log(
        `Retrieved ${products.length} products for organization ${organizationId} (page ${page}, total: ${total})`,
      );

      return new ProductPaginatedResponseDto(transformedProducts, total, page || 1, limit || 20);
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
        const foundIds = products.map(p => p.id);
        const missingIds = productIds.filter(id => !foundIds.includes(id));
        throw new NotFoundException(
          `Products not found or do not belong to your organization: ${missingIds.join(', ')}`,
        );
      }

      // Delete products in a transaction
      await this.prisma.$transaction(
        productIds.map(id =>
          this.prisma.product.delete({
            where: { id },
          }),
        ),
      );

      this.logger.log(`Successfully deleted ${products.length} products`);
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      this.logger.error(`Failed to bulk delete products: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Failed to delete products');
    }
  }
}
