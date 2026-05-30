import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CategoryTreeNodeDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 'electronics/phones/smartphones' })
  slug: string;

  @ApiProperty({ example: 'Smartphones' })
  name_en: string;

  @ApiProperty({ example: 'Смартфоны' })
  name_ru: string;

  @ApiProperty({ example: 'Smartfonlar' })
  name_uz: string;

  @ApiProperty({ example: true })
  isLeaf: boolean;

  @ApiProperty({ example: 2 })
  depth: number;

  @ApiPropertyOptional({ type: String, nullable: true, example: 'phone.svg' })
  iconKey: string | null;

  @ApiProperty({ type: () => CategoryTreeNodeDto, isArray: true })
  children: CategoryTreeNodeDto[];
}
