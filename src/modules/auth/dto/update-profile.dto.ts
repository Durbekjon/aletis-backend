import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength, IsInt } from 'class-validator';
import { Type } from 'class-transformer';

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

  @ApiPropertyOptional({ example: 1, description: 'File ID of the user logo', nullable: true })
  @IsInt()
  @IsOptional()
  @Type(() => Number)
  logoId?: number | null;
}
