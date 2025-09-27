import { IsArray, IsNumber, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class FieldOrderDto {
  @ApiProperty({
    description: 'The ID of the field to reorder',
    example: 1,
  })
  @IsNumber()
  fieldId: number;

  @ApiProperty({
    description: 'The new order position for the field',
    example: 2,
  })
  @IsNumber()
  order: number;
}

export class ReorderFieldsDto {
  @ApiProperty({
    description: 'Array of field order objects',
    type: [FieldOrderDto],
    example: [
      { fieldId: 1, order: 1 },
      { fieldId: 2, order: 2 },
      { fieldId: 3, order: 3 },
    ],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FieldOrderDto)
  fields: FieldOrderDto[];
}
