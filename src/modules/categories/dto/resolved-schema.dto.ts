import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FieldType } from '@prisma/client';

export class ResolvedSchemaFieldDto {
  @ApiProperty({ example: 12 })
  id: number;

  @ApiProperty({ example: 'brand' })
  key: string;

  @ApiProperty({ example: 'Brand' })
  label_en: string;

  @ApiProperty({ example: 'Бренд' })
  label_ru: string;

  @ApiProperty({ example: 'Brend' })
  label_uz: string;

  @ApiProperty({ enum: FieldType, example: FieldType.TEXT })
  type: FieldType;

  @ApiProperty({ example: true })
  required: boolean;

  @ApiProperty({ example: 0 })
  order: number;

  @ApiPropertyOptional({
    description:
      'Enum option metadata (for ENUM / ENUM_MULTI fields). Shape: { values: [{ key, label_en, label_ru, label_uz }] }',
    type: Object,
  })
  options: unknown;

  @ApiPropertyOptional({
    description: 'Optional validation hints (e.g. { min, max, regex }).',
    type: Object,
  })
  validation: unknown;

  @ApiPropertyOptional({
    description:
      'If set, this field was inherited from an ancestor category (e.g. "brand" defined at Electronics).',
    type: Number,
    nullable: true,
  })
  inheritedFromCategoryId: number | null;
}

export class ResolvedCategorySchemaDto {
  @ApiProperty({ example: 42 })
  categoryId: number;

  @ApiProperty({ example: 'electronics/phones/smartphones' })
  categorySlug: string;

  @ApiProperty({ type: () => ResolvedSchemaFieldDto, isArray: true })
  fields: ResolvedSchemaFieldDto[];
}
