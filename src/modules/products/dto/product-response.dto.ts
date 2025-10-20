import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FieldType, ProductStatus } from '@prisma/client';

export class FieldValueResponseDto {
  @ApiProperty({
    description: 'The unique identifier of the field value',
    example: 1,
  })
  id: number;

  @ApiProperty({
    description: 'The ID of the field',
    example: 1,
  })
  fieldId: number;

  @ApiProperty({
    description: 'The name of the field',
    example: 'Processor',
  })
  fieldName: string;

  @ApiProperty({
    description: 'The type of the field',
    enum: FieldType,
    example: FieldType.TEXT,
  })
  fieldType: FieldType;

  @ApiPropertyOptional({
    description: 'Text value (for TEXT fields)',
    example: 'Intel i7',
  })
  valueText?: string | null;

  @ApiPropertyOptional({
    description: 'Number value (for NUMBER fields)',
    example: 16,
  })
  valueNumber?: number | null;

  @ApiPropertyOptional({
    description: 'Boolean value (for BOOLEAN fields)',
    example: true,
  })
  valueBool?: boolean | null;

  @ApiPropertyOptional({
    description: 'Date value (for DATE fields)',
    example: '2023-12-01T10:30:00Z',
  })
  valueDate?: Date | null;

  @ApiPropertyOptional({
    description: 'JSON value (for ENUM, FILE, IMAGE fields)',
    example: { fileId: 1, fileName: 'image.jpg' },
  })
  valueJson?: any | null;
}

export class ProductImageResponseDto {
  @ApiProperty({
    description: 'The unique identifier of the file',
    example: 1,
  })
  id: number;

  @ApiProperty({
    description: 'The relative path to the file',
    example: 'public/uploads/image_123.jpg',
  })
  key: string;

  // @ApiProperty({
  //   description: 'The original filename',
  //   example: 'product-image.jpg',
  // })
  // originalName: string;

  // @ApiProperty({
  //   description: 'The size of the file in bytes',
  //   example: 1024000,
  // })
  // size: number;

  // @ApiProperty({
  //   description: 'The MIME type of the file',
  //   example: 'image/jpeg',
  // })
  // mimeType: string;
}

export class ProductResponseDto {
  @ApiProperty({
    description: 'The unique identifier of the product',
    example: 1,
  })
  id: number;

  @ApiProperty({
    description: 'The name of the product',
    example: 'Premium Laptop',
  })
  name: string;

  @ApiProperty({
    description: 'The price of the product',
    example: 1299.99,
  })
  price: number;

  @ApiProperty({
    description: 'The quantity of the product',
    example: 1,
  })
  quantity: number;

  @ApiProperty({
    description: 'The status of the product',
    example: ProductStatus.DRAFT,
  })
  status: ProductStatus;

  @ApiProperty({
    description: 'The ID of the schema this product belongs to',
    example: 1,
  })
  schemaId: number;

  @ApiProperty({
    description: 'The name of the schema',
    example: 'Electronics Schema',
  })
  schemaName: string;

  @ApiProperty({
    description: 'The ID of the organization',
    example: 1,
  })
  organizationId: number;

  @ApiProperty({
    description: 'Array of product images',
    type: [ProductImageResponseDto],
  })
  images: ProductImageResponseDto[];

  @ApiProperty({
    description: 'Array of field values',
    type: [FieldValueResponseDto],
  })
  fields: FieldValueResponseDto[];

  @ApiProperty({
    description: 'The timestamp when the product was created',
    example: '2023-12-01T10:30:00Z',
  })
  createdAt: Date;

  @ApiProperty({
    description: 'The timestamp when the product was last updated',
    example: '2023-12-01T10:30:00Z',
  })
  updatedAt: Date;
}
