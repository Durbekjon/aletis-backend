import { IsOptional, IsNumber, IsString, IsIn, Min, Max, IsEnum } from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class PaginationDto {
  @ApiPropertyOptional({
    description: 'Page number (1-based)',
    example: 1,
    minimum: 1,
    default: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Number of items per page',
    example: 20,
    minimum: 1,
    maximum: 100,
    default: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({
    description: 'Search term for filtering results',
    example: 'document',
  })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  search?: string;

  @ApiPropertyOptional({
    description: 'Sort order',
    enum: ['asc', 'desc'],
    example: 'desc',
    default: 'desc',
  })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  order?: 'asc' | 'desc' = 'desc';

  @ApiPropertyOptional({
    description: 'Status filter',
    enum: ['ACTIVE', 'ARCHIVED','DRAFT'],
    example: 'ACTIVE',
  })
  @IsOptional()
  @IsEnum(['ACTIVE', 'ARCHIVED','DRAFT'], { message: 'Invalid status' })
  status?: 'ACTIVE' | 'ARCHIVED' | 'DRAFT';
  /**
   * Get the skip value for Prisma pagination
   */
  get skip(): number {
    return ((this.page || 1) - 1) * (this.limit || 20);
  }

  /**
   * Get the take value for Prisma pagination
   */
  get take(): number {
    return this.limit || 20;
  }
}
