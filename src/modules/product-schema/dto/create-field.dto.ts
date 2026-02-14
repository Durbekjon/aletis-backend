import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsBoolean,
  IsOptional,
  IsArray,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FieldType } from '@prisma/client';

export class CreateFieldDto {
  @ApiProperty({
    description: 'The name of the field',
    example: 'Product Name',
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({
    description: 'The type of the field',
    enum: FieldType,
    example: FieldType.TEXT,
  })
  @IsEnum(FieldType)
  type: FieldType;

  @ApiProperty({
    description: 'Whether the field is required',
    example: true,
  })
  @IsBoolean()
  required: boolean;

  @ApiPropertyOptional({
    description: 'Available options for select/radio field types',
    type: [String],
    example: ['Option 1', 'Option 2', 'Option 3'],
  })
  @IsOptional()
  @IsArray()
  options?: string[];

  @ApiPropertyOptional({
    description: 'Display order of the field',
    example: 1,
  })
  @IsOptional()
  order?: number;
}
