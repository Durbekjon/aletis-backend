import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'John', nullable: true })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  firstName?: string | null;

  @ApiPropertyOptional({ example: 'Doe', nullable: true })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  lastName?: string | null;
}
