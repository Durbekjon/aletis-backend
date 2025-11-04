import { IsEnum, IsInt, IsOptional, IsPositive, IsString, Max, Min } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ActionType, EntityType } from '@prisma/client';

export class GetActivityLogsDto {
  @Type(() => Number)
  @IsInt()
  organizationId!: number;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @IsOptional()
  @IsEnum(['en', 'uz', 'ru'] as const)
  lang?: 'en' | 'uz' | 'ru' = 'uz';

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @IsPositive()
  userId?: number;

  @IsOptional()
  @IsEnum(EntityType)
  entityType?: EntityType;

  @IsOptional()
  @IsEnum(ActionType)
  action?: ActionType;

  @IsOptional()
  @Transform(({ value }) => (value ? new Date(value) : undefined))
  from?: Date;

  @IsOptional()
  @Transform(({ value }) => (value ? new Date(value) : undefined))
  to?: Date;
}


