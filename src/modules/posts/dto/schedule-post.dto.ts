import { ApiProperty } from '@nestjs/swagger';
import { IsISO8601 } from 'class-validator';

export class SchedulePostDto {
  @ApiProperty({ description: 'Schedule time in ISO format (UTC)' })
  @IsISO8601()
  scheduledAt: string;
}


