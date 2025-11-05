import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsEnum, IsIn, IsNumber, IsOptional, Max, Min } from 'class-validator';
import { ActionType, EntityType } from '@prisma/client';

export class ActivityLogPaginationDto {
  @ApiPropertyOptional({ description: 'Page number (1-based)', example: 1, minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Items per page', example: 20, minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({ description: 'Sort order by creation date', enum: ['asc', 'desc'], example: 'desc', default: 'desc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  order?: 'asc' | 'desc' = 'desc';

  @ApiPropertyOptional({ description: 'Language of the message', enum: ['en', 'uz', 'ru'], example: 'uz', default: 'uz' })
  @IsOptional()
  @IsEnum(['en', 'uz', 'ru'] as const)
  lang?: 'en' | 'uz' | 'ru' = 'uz';

  @ApiPropertyOptional({ description: 'Filter by entity type', enum: EntityType })
  @IsOptional()
  @IsEnum(EntityType)
  entityType?: EntityType;

  @ApiPropertyOptional({ description: 'Filter by action type', enum: ActionType })
  @IsOptional()
  @IsEnum(ActionType)
  action?: ActionType;

  @ApiPropertyOptional({ description: 'Start date (ISO8601) inclusive', type: String, format: 'date-time' })
  @IsOptional()
  @Transform(({ value }) => (value ? new Date(value) : undefined))
  from?: Date;

  @ApiPropertyOptional({ description: 'End date (ISO8601) inclusive', type: String, format: 'date-time' })
  @IsOptional()
  @Transform(({ value }) => (value ? new Date(value) : undefined))
  to?: Date;

  get skip(): number {
    return ((this.page || 1) - 1) * (this.limit || 20);
  }

  get take(): number {
    return this.limit || 20;
  }
}


