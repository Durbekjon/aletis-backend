import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CustomerResponseDto {
  @ApiProperty({ description: 'The unique identifier of the customer', example: 1 })
  id: number;

  @ApiProperty({ description: 'Telegram user id (stringified)', example: '9238472398' })
  telegramId: string;

  @ApiProperty({ description: 'Customer display name', example: 'John Doe' })
  name: string;

  @ApiPropertyOptional({ description: 'Customer username without @', example: 'johndoe' })
  username?: string | null;

  @ApiProperty({ description: 'Organization identifier', example: 1 })
  organizationId: number;

  @ApiProperty({ description: 'Bot identifier the customer is tied to', example: 12 })
  botId: number;

  @ApiProperty({ description: 'Creation timestamp', example: '2025-09-30T10:00:00.000Z' })
  createdAt: Date;

  @ApiProperty({ description: 'Update timestamp', example: '2025-09-30T10:05:00.000Z' })
  updatedAt: Date;
}


