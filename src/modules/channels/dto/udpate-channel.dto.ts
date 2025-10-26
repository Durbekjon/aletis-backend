import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsString, MinLength } from 'class-validator';

export class UpdateChannelDto {
  @ApiProperty({
    description: 'ID of the bot associated with the channel',
    example: 5,
    type: Number,
  })
  @IsInt()
  botId: number;

  @ApiPropertyOptional({
    description: 'Username of the channel (if applicable)',
    example: 'my_channel_username',
    type: String,
  })
  @IsString()
  @MinLength(5)
  username: string;
}
