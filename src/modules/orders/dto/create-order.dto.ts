import { IsOptional, IsString, IsObject, IsNotEmpty } from 'class-validator';

export class CreateOrderDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  customerName?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  customerContact?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  customerAddress?: string;

  @IsObject()
  @IsNotEmpty()
  details!: Record<string, any>;
}
