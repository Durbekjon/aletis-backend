import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Admin response shape — includes archive metadata that the buyer-facing
 * `CategoryTreeNodeDto` deliberately omits.
 */
export class AdminCategoryDto {
  @ApiProperty({ example: 3 })
  id: number;

  @ApiPropertyOptional({ type: Number, nullable: true, example: 2 })
  parentId: number | null;

  @ApiProperty({ example: 'electronics/phones/smartphones' })
  slug: string;

  @ApiProperty({ example: 'Smartphones' })
  name_en: string;

  @ApiProperty({ example: 'Смартфоны' })
  name_ru: string;

  @ApiProperty({ example: 'Smartfonlar' })
  name_uz: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  iconKey: string | null;

  @ApiProperty({ example: true })
  isLeaf: boolean;

  @ApiProperty({ example: 2 })
  depth: number;

  @ApiProperty({ type: [Number], example: [1, 2, 3] })
  path: number[];

  @ApiProperty({ example: false })
  isArchived: boolean;

  @ApiPropertyOptional({ type: String, nullable: true })
  archivedAt: Date | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
