import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'John', nullable: true })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  @MinLength(2)
  firstName?: string | null;

  @ApiPropertyOptional({ example: 'Doe', nullable: true })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  @MinLength(2)
  lastName?: string | null;
}
