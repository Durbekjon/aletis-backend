import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Intentionally narrow: slug, parentId, and isLeaf are write-once. Restructuring
 * the tree is done via archive + recreate so the audit trail stays clean.
 */
export class UpdateCategoryDto {
  @ApiPropertyOptional({ example: 'Smartphones', maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name_en?: string;

  @ApiPropertyOptional({ example: 'Смартфоны', maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name_ru?: string;

  @ApiPropertyOptional({ example: 'Smartfonlar', maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name_uz?: string;

  @ApiPropertyOptional({
    description: 'Pass null to clear the icon.',
    example: 'icons/smartphone.svg',
    nullable: true,
    maxLength: 200,
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  iconKey?: string | null;
}
