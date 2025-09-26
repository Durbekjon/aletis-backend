import { IsString, IsOptional, IsEnum, IsBoolean, IsArray, IsNumber } from 'class-validator';
import { FieldType } from '@prisma/client';

export class UpdateFieldDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEnum(FieldType)
  type?: FieldType;

  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @IsOptional()
  @IsArray()
  options?: string[];

  @IsOptional()
  @IsNumber()
  order?: number;
}
