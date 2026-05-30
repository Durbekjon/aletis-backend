import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class ResetPasswordDto {
  @ApiProperty({ example: 'alice@example.com' })
  @IsNotEmpty()
  @IsEmail()
  @MaxLength(255)
  email: string;

  @ApiProperty({ description: 'Password reset token' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  token: string;

  @ApiProperty({ minLength: 8, maxLength: 72, example: 'NewStrongPass123' })
  @IsNotEmpty()
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  newPassword: string;
}
