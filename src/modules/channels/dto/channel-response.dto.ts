import { ApiProperty } from '@nestjs/swagger';
import { ConnectionStatus } from '@prisma/client';

export class ChannelResponseDto {
  @ApiProperty({ description: 'Channel ID', example: 1 })
  id: number;

  @ApiProperty({ description: 'Telegram channel ID', example: '1234567890' })
  telegramId: string;

  @ApiProperty({ description: 'Channel username', example: 'my_channel' })
  username: string;

  @ApiProperty({ description: 'Channel title', example: 'My Channel' })
  title: string;

  @ApiProperty({ description: 'Channel description', required: false })
  description?: string | null;

  @ApiProperty({ description: 'Connection status', enum: ConnectionStatus })
  status: ConnectionStatus;

  @ApiProperty({ description: 'Creation timestamp' })
  createdAt: Date;

  @ApiProperty({ description: 'Update timestamp' })
  updatedAt: Date;
}
