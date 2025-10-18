import { ApiProperty } from '@nestjs/swagger';
import { BotStatus } from '@prisma/client';

export class BotStatisticsResponseDto {
  @ApiProperty({ description: 'Total number of messages', example: 100 })
  totalMessages: number;

  @ApiProperty({ description: 'Total number of active chats', example: 10 })
  activeChats: number;

  @ApiProperty({ description: 'Uptime', example: '10 hours' })
  uptime: string;

  @ApiProperty({
    description: 'Last active time (ISO string) or null if no bot messages',
    example: '2025-09-30T10:00:00.000Z',
    nullable: true,
  })
  lastActive: string | null;
}
export class BotResponseDto {
  @ApiProperty({ description: 'The unique identifier of the bot', example: 1 })
  id: number;

  @ApiProperty({
    description: 'Telegram bot id (stringified)',
    example: '8329472389',
  })
  telegramId: string;

  @ApiProperty({ description: 'Bot display name', example: 'My Shop Bot' })
  name: string;

  @ApiProperty({ description: 'Bot username without @', example: 'myshopbot' })
  username: string;

  @ApiProperty({ description: 'Organization identifier', example: 1 })
  organizationId: number;

  @ApiProperty({
    description: 'Bot status',
    enum: BotStatus,
    example: BotStatus.ACTIVE,
  })
  status: BotStatus;

  @ApiProperty({ description: 'Whether bot is default', example: true })
  isDefault: boolean;

  @ApiProperty({
    description: 'Creation timestamp',
    example: '2025-09-30T10:00:00.000Z',
  })
  createdAt: Date;

  @ApiProperty({
    description: 'Update timestamp',
    example: '2025-09-30T10:05:00.000Z',
  })
  updatedAt: Date;

  @ApiProperty({
    description: 'Bot statistics',
    type: BotStatisticsResponseDto,
  })
  statistics: BotStatisticsResponseDto;
}



