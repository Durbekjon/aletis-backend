import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AiKeyStatus, AiProvider } from '@prisma/client';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateAiKeyDto {
  @ApiPropertyOptional({ enum: AiProvider, default: AiProvider.GEMINI })
  @IsOptional()
  @IsEnum(AiProvider)
  provider?: AiProvider;

  @ApiProperty({ example: 'gemini-account-a', maxLength: 80 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  label: string;

  @ApiProperty({
    description: 'Raw API key. Stored encrypted at rest; never returned.',
    minLength: 8,
    maxLength: 500,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  @MaxLength(500)
  apiKey: string;

  @ApiPropertyOptional({ enum: AiKeyStatus, default: AiKeyStatus.ACTIVE })
  @IsOptional()
  @IsEnum(AiKeyStatus)
  status?: AiKeyStatus;
}
