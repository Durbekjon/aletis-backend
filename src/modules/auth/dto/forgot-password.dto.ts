import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, MaxLength } from 'class-validator';

export class ForgotPasswordDto {
  @ApiProperty({ example: 'alice@example.com' })
  @IsNotEmpty()
  @IsEmail()
  @MaxLength(255)
  email: string;
}


