import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class ConnectBotDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d+:[A-Za-z0-9_-]{35}$/, {
    message:
      'Invalid bot token format. Expected format: 123456789:ABC-DEF1234ghIkl-zyx57W2v1u123ew11',
  })
  token!: string;
}
