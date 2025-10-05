import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, IsEnum, IsISO8601 } from 'class-validator';
import { PostStatus } from '@prisma/client';

export class UpdatePostDto {
  @ApiPropertyOptional({ description: 'Updated content' })
  @IsOptional()
  @IsString()
  content?: string;

  @ApiPropertyOptional({ description: 'Move to another channel ID' })
  @IsOptional()
  @IsInt()
  channelId?: number;

  @ApiPropertyOptional({ description: 'Update status', enum: PostStatus })
  @IsOptional()
  @IsEnum(PostStatus)
  status?: PostStatus;

  @ApiPropertyOptional({ description: 'Update schedule time (ISO UTC)' })
  @IsOptional()
  @IsISO8601()
  scheduledAt?: string;
}


