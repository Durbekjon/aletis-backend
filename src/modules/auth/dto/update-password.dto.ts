import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdatePasswordDto {
  @ApiProperty({ description: 'Current password', example: 'OldPassword123' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(72)
  oldPassword: string;

  @ApiProperty({
    minLength: 8,
    maxLength: 72,
    example: 'NewStrongPass123',
  })
  @IsNotEmpty()
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  newPassword: string;
}
