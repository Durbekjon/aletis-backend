import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/**
 * Slugs are write-once and form the public identifier of a category. They must
 * be URL-safe lowercase with optional `/` segments so a leaf's slug encodes its
 * ancestry (e.g. `electronics/phones/smartphones`). Renaming a category mutates
 * labels only, never the slug.
 */
const SLUG_PATTERN = /^[a-z0-9]+(?:[-/][a-z0-9]+)*$/;

export class CreateCategoryDto {
  @ApiPropertyOptional({
    description: 'Parent category id. Omit for a root category.',
    example: 1,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  parentId?: number;

  @ApiProperty({
    description:
      'URL-safe slug, optionally encoding ancestry with `/` separators.',
    example: 'electronics/phones/smartphones',
    maxLength: 200,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(200)
  @Matches(SLUG_PATTERN, {
    message:
      'slug must be lowercase letters, digits, and hyphens; segments separated by "/"',
  })
  slug: string;

  @ApiProperty({ example: 'Smartphones', maxLength: 120 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name_en: string;

  @ApiProperty({ example: 'Смартфоны', maxLength: 120 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name_ru: string;

  @ApiProperty({ example: 'Smartfonlar', maxLength: 120 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name_uz: string;

  @ApiPropertyOptional({
    description:
      'Optional icon key/path stored alongside the category for UI rendering.',
    example: 'icons/smartphone.svg',
    maxLength: 200,
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  iconKey?: string;

  @ApiPropertyOptional({
    description:
      'Mark as a leaf (accepts products). Leaves auto-create an empty CategorySchema. Write-once at creation.',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  isLeaf?: boolean;
}
