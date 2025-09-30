import { ApiProperty } from '@nestjs/swagger';

export class BotResponseDto {
  @ApiProperty({ description: 'The unique identifier of the bot', example: 1 })
  id: number;

  @ApiProperty({ description: 'Telegram bot id (stringified)', example: '8329472389' })
  telegramId: string;

  @ApiProperty({ description: 'Bot display name', example: 'My Shop Bot' })
  name: string;

  @ApiProperty({ description: 'Bot username without @', example: 'myshopbot' })
  username: string;

  @ApiProperty({ description: 'Organization identifier', example: 1 })
  organizationId: number;

  @ApiProperty({ description: 'Whether bot is enabled (webhook set)', example: true })
  isEnabled: boolean;

  @ApiProperty({ description: 'Creation timestamp', example: '2025-09-30T10:00:00.000Z' })
  createdAt: Date;

  @ApiProperty({ description: 'Update timestamp', example: '2025-09-30T10:05:00.000Z' })
  updatedAt: Date;
}


