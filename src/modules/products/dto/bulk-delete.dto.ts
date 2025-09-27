import { IsArray, IsNumber } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class BulkDeleteProductsDto {
  @ApiProperty({
    description: 'Array of product IDs to delete',
    type: [Number],
    example: [1, 2, 3],
  })
  @IsArray()
  @IsNumber({}, { each: true })
  ids: number[];
}
