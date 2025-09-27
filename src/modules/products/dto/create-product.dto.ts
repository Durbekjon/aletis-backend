import { IsString, IsNotEmpty, IsNumber, IsArray, IsOptional, ValidateNested, IsInt, Min, IsBoolean, IsDateString, IsObject, ValidateIf } from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FieldType } from '@prisma/client';

export class CreateFieldValueDto {
  @ApiProperty({
    description: 'The ID of the field',
    example: 1,
  })
  @IsInt()
  @Min(1)
  fieldId: number;

  @ApiProperty({
    description: 'The value for the field (type depends on field type)',
    oneOf: [
      { type: 'string' },
      { type: 'number' },
      { type: 'boolean' },
      { type: 'string', format: 'date-time' },
      { type: 'object' }
    ],
    example: 'Sample text value',
  })
  @IsOptional()
  @Transform(({ value }) => {
    // Ensure the value is properly transformed
    if (value === null || value === undefined) {
      return value;
    }
    return value;
  })
  value: any; // Use 'any' to allow all types since validation happens in service
}

export class CreateProductDto {
  @ApiProperty({
    description: 'The name of the product',
    example: 'Premium Laptop',
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({
    description: 'The price of the product',
    example: 1299.99,
  })
  @IsNumber()
  @Min(0)
  price: number;

  @ApiPropertyOptional({
    description: 'Array of file IDs for product images',
    type: [Number],
    example: [1, 2, 3],
  })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  images?: number[];

  @ApiProperty({
    description: 'Array of field values for the product',
    type: [CreateFieldValueDto],
    example: [
      { fieldId: 1, value: 'Intel i7' },
      { fieldId: 2, value: 16 },
      { fieldId: 3, value: true }
    ],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateFieldValueDto)
  fields: CreateFieldValueDto[];
}
