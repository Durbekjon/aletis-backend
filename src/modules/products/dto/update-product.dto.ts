import { IsString, IsOptional, IsNumber, IsArray, ValidateNested, IsInt, Min } from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateFieldValueDto {
  @ApiPropertyOptional({
    description: 'The ID of the field',
    example: 1,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  fieldId?: number;

  @ApiPropertyOptional({
    description: 'The value for the field (type depends on field type)',
    oneOf: [
      { type: 'string' },
      { type: 'number' },
      { type: 'boolean' },
      { type: 'string', format: 'date-time' },
      { type: 'object' }
    ],
    example: 'Updated text value',
  })
  @IsOptional()
  @Transform(({ value }) => {
    // Ensure the value is properly transformed
    if (value === null || value === undefined) {
      return value;
    }
    return value;
  })
  value?: any; // Use 'any' to allow all types since validation happens in service
}

export class UpdateProductDto {
  @ApiPropertyOptional({
    description: 'The name of the product',
    example: 'Updated Premium Laptop',
  })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({
    description: 'The price of the product',
    example: 1199.99,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;

  @ApiPropertyOptional({
    description: 'Array of file IDs for product images',
    type: [Number],
    example: [1, 2, 3],
  })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  images?: number[];

  @ApiPropertyOptional({
    description: 'Array of field values for the product',
    type: [UpdateFieldValueDto],
    example: [
      { fieldId: 1, value: 'Intel i9' },
      { fieldId: 2, value: 32 }
    ],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateFieldValueDto)
  fields?: UpdateFieldValueDto[];
}
