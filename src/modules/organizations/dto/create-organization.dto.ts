import { ApiProperty } from '@nestjs/swagger';
import { BUSINESS_CATEGORY } from '@prisma/client';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateOrganizationDto {
  @ApiProperty({ example: 'Acme Inc.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @ApiProperty({
    example: 'We sell everything',
    required: false,
    nullable: true,
  })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string | null;

  @ApiProperty({
    example: BUSINESS_CATEGORY.FASHION,
    required: false,
    nullable: true,
    enum: BUSINESS_CATEGORY,
  })
  @IsEnum(BUSINESS_CATEGORY)
  @IsOptional()
  category?: BUSINESS_CATEGORY | null;
}
