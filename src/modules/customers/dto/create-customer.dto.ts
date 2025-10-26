import { IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateCustomerDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  username: string | null;

  @IsString()
  @IsNotEmpty()
  telegramId: string;

  @IsInt()
  @IsNotEmpty()
  botId: number;

  @IsInt()
  @IsNotEmpty()
  organizationId: number;
}
