import { ApiPropertyOptional } from '@nestjs/swagger';
import { AiKeyStatus } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UpdateAiKeyDto {
  @ApiPropertyOptional({ maxLength: 80 })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  label?: string;

  @ApiPropertyOptional({
    description: 'Replace the stored API key. Stored encrypted; never returned.',
    minLength: 8,
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(500)
  apiKey?: string;

  @ApiPropertyOptional({ enum: AiKeyStatus })
  @IsOptional()
  @IsEnum(AiKeyStatus)
  status?: AiKeyStatus;

  @ApiPropertyOptional({
    description: 'Force-clear the exhausted state (override the nightly reset).',
  })
  @IsOptional()
  @IsBoolean()
  clearExhausted?: boolean;
}
