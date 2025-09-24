import { IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class TelegramLoginDto {
  @IsInt()
  id!: number;

  @IsOptional()
  @IsString()
  username?: string;

  @IsOptional()
  @IsString()
  first_name?: string;

  @IsOptional()
  @IsString()
  last_name?: string;

  @IsInt()
  auth_date!: number;

  @IsString()
  @IsNotEmpty()
  hash!: string;

  @IsOptional()
  @IsString()
  photo_url?: string;
}
