import { IsArray, IsNumber, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class FieldOrderDto {
  @IsNumber()
  fieldId: number;

  @IsNumber()
  order: number;
}

export class ReorderFieldsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FieldOrderDto)
  fields: FieldOrderDto[];
}
