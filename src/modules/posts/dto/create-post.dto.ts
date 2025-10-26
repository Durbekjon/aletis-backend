import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsEnum,
  IsISO8601,
} from 'class-validator';
import { PostStatus } from '@prisma/client';

export class CreatePostDto {
  @ApiProperty({ description: 'Related product ID' })
  @IsInt()
  productId: number;

  @ApiProperty({ description: 'Target channel ID' })
  @IsInt()
  channelId: number;

  @ApiProperty({ description: 'Post content (caption/text)' })
  @IsString()
  @IsNotEmpty()
  content: string;

  @ApiPropertyOptional({
    description: 'Initial status',
    enum: PostStatus,
    default: PostStatus.DRAFT,
  })
  @IsOptional()
  @IsEnum(PostStatus)
  status?: PostStatus;

  @ApiPropertyOptional({ description: 'Schedule time in ISO format (UTC)' })
  @IsOptional()
  @IsISO8601()
  scheduledAt?: string;
}
