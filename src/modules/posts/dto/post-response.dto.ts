import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PostStatus } from '@prisma/client';

export class PostResponseDto {
  @ApiProperty()
  id: number;

  @ApiProperty()
  productId: number;

  @ApiProperty()
  channelId: number;

  @ApiProperty()
  content: string;

  @ApiProperty({ enum: PostStatus })
  status: PostStatus;

  @ApiPropertyOptional({ type: 'object', description: 'Telegram metadata', additionalProperties: true })
  metaData?: Record<string, any> | null;

  @ApiPropertyOptional()
  telegramId?: string | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  @ApiPropertyOptional()
  scheduledAt?: Date | null;

  @ApiPropertyOptional()
  sentAt?: Date | null;

  @ApiPropertyOptional()
  failLog?: string | null;
}


