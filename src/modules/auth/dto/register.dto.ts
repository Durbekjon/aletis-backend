import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RegisterDto {
  @ApiPropertyOptional({ maxLength: 100, example: 'Alice' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  firstName?: string;

  @ApiPropertyOptional({ maxLength: 100, example: 'Doe' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  lastName?: string;

  @ApiProperty({ example: 'alice@example.com' })
  @IsNotEmpty()
  @IsEmail()
  @MaxLength(255)
  email: string;

  @ApiProperty({ minLength: 8, maxLength: 72, example: 'StrongPass123' })
  @IsNotEmpty()
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password: string;

  @ApiPropertyOptional({
    maxLength: 120,
    example: 'Acme Inc.',
    description:
      'Optional organization name created alongside the user. Defaults to "<firstName>\'s store" or "My store" when omitted.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  orgName?: string;
}
