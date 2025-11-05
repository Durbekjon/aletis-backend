import { IsEnum, IsInt, IsOptional, IsPositive, Max, Min } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ActionType, EntityType } from '@prisma/client';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class GetActivityLogsDto {
  @ApiPropertyOptional({
    description: 'Number of logs to return',
    minimum: 1,
    maximum: 100,
    default: 20,
    type: Number,
    example: 20,
  })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({
    description: 'Language code for messages',
    enum: ['en', 'uz', 'ru'],
    default: 'uz',
    example: 'uz',
  })
  @IsOptional()
  @IsEnum(['en', 'uz', 'ru'] as const)
  lang?: 'en' | 'uz' | 'ru' = 'uz';

  @ApiPropertyOptional({
    description: 'Filter by entity type',
    enum: EntityType,
    example: EntityType.BOT,
  })
  @IsOptional()
  @IsEnum(EntityType)
  entityType?: EntityType;

  @ApiPropertyOptional({
    description: 'Filter by action type',
    enum: ActionType,
    example: ActionType.CREATE,
  })
  @IsOptional()
  @IsEnum(ActionType)
  action?: ActionType;

  @ApiPropertyOptional({
    description: 'Start date (ISO8601 string or timestamp) to filter logs from',
    type: String,
    format: 'date-time',
    example: '2024-01-01T00:00:00.000Z',
  })
  @IsOptional()
  @Transform(({ value }) => (value ? new Date(value) : undefined))
  from?: Date;

  @ApiPropertyOptional({
    description: 'End date (ISO8601 string or timestamp) to filter logs to',
    type: String,
    format: 'date-time',
    example: '2024-01-31T23:59:59.000Z',
  })
  @IsOptional()
  @Transform(({ value }) => (value ? new Date(value) : undefined))
  to?: Date;
}

