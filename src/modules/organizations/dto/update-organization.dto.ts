import { ApiPropertyOptional } from '@nestjs/swagger';
import { BUSINESS_CATEGORY } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateOrganizationDto {
  @ApiPropertyOptional({ example: 'New Name' })
  @IsString()
  @IsOptional()
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ example: 'Updated description', nullable: true })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string | null;

  @ApiPropertyOptional({ example: 'FASHION', nullable: true })
  @IsEnum(BUSINESS_CATEGORY)
  @IsOptional()
  category?: BUSINESS_CATEGORY | null;
}
