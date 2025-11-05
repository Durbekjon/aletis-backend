import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ActionType, EntityType } from '@prisma/client';

export class ActivityLogResponseDto {
  @ApiProperty()
  id: number;

  @ApiProperty({ description: 'Creation timestamp' })
  createdAt: Date;

  @ApiProperty({ description: 'Localized message' })
  message: string;

  @ApiProperty({ enum: EntityType })
  entityType: EntityType;

  @ApiProperty({ enum: ActionType })
  action: ActionType;

  @ApiPropertyOptional({ description: 'Related entity ID', example: 123 })
  entityId?: number | null;

  @ApiPropertyOptional({ description: 'Additional metadata', type: 'object', additionalProperties: true })
  meta?: Record<string, any> | null;

  @ApiPropertyOptional({ description: 'Actor user info' })
  user?: { id: number; firstName: string | null } | null;
}


