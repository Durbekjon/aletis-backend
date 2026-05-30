import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AiKeyStatus, AiProvider } from '@prisma/client';

/**
 * Safe response shape: the raw API key is never exposed. Only metadata.
 */
export class AiKeyResponseDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ enum: AiProvider, example: AiProvider.GEMINI })
  provider: AiProvider;

  @ApiProperty({ example: 'gemini-account-a' })
  label: string;

  @ApiProperty({ enum: AiKeyStatus })
  status: AiKeyStatus;

  @ApiPropertyOptional({ type: String, nullable: true })
  exhaustedAt: Date | null;

  @ApiProperty({ example: 1023 })
  usageCount: number;

  @ApiPropertyOptional({ type: String, nullable: true })
  lastUsedAt: Date | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  lastErrorAt: Date | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  lastError: string | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
