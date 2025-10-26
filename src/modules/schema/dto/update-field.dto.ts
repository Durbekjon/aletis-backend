import {
  IsString,
  IsOptional,
  IsEnum,
  IsBoolean,
  IsArray,
  IsNumber,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { FieldType } from '@prisma/client';

export class UpdateFieldDto {
  @ApiPropertyOptional({
    description: 'The name of the field',
    example: 'Updated Product Name',
  })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({
    description: 'The type of the field',
    enum: FieldType,
    example: FieldType.TEXT,
  })
  @IsOptional()
  @IsEnum(FieldType)
  type?: FieldType;

  @ApiPropertyOptional({
    description: 'Whether the field is required',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @ApiPropertyOptional({
    description: 'Available options for select/radio field types',
    type: [String],
    example: ['Updated Option 1', 'Updated Option 2'],
  })
  @IsOptional()
  @IsArray()
  options?: string[];

  @ApiPropertyOptional({
    description: 'Display order of the field',
    example: 5,
  })
  @IsOptional()
  @IsNumber()
  order?: number;
}
