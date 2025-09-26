import { IsString, IsNotEmpty, IsEnum, IsBoolean, IsOptional, IsArray } from 'class-validator';
import { FieldType } from '@prisma/client';

export class CreateFieldDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsEnum(FieldType)
  type: FieldType;

  @IsBoolean()
  required: boolean;

  @IsOptional()
  @IsArray()
  options?: string[];

  @IsOptional()
  order?: number;
}
