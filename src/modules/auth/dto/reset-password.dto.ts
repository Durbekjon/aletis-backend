import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class ResetPasswordDto {
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


