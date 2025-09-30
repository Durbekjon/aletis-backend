import { ApiProperty } from "@nestjs/swagger";
import { IsString, IsNotEmpty } from "class-validator";

export class CreateBotDto {
  @ApiProperty({
    description: 'The token of the bot',
    example: '8189802940:AAGAu-_rFoJEGYJZSdCfWhNRHxtybKCyd3A',
  })
  @IsString()
  @IsNotEmpty()
  token: string;
}