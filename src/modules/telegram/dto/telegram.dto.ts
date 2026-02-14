import {
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class TelegramUserDto {
  @IsNumber()
  id!: number;

  @IsOptional()
  @IsString()
  first_name: string;

  @IsOptional()
  @IsString()
  last_name?: string;

  @IsOptional()
  @IsString()
  username?: string;

  @IsOptional()
  @IsString()
  language_code?: string;
}

export class TelegramChatDto {
  @IsNumber()
  id!: number;

  @IsString()
  type!: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  username?: string;

  @IsOptional()
  @IsString()
  first_name?: string;

  @IsOptional()
  @IsString()
  last_name?: string;
}

export class TelegramPhotoSizeDto {
  @IsString()
  file_id!: string;

  @IsString()
  file_unique_id!: string;

  @IsNumber()
  width!: number;

  @IsNumber()
  height!: number;

  @IsOptional()
  @IsNumber()
  file_size?: number;
}

export class TelegramMessageDto {
  @IsNumber()
  message_id!: number;

  @ValidateNested()
  @Type(() => TelegramUserDto)
  from!: TelegramUserDto;

  @ValidateNested()
  @Type(() => TelegramChatDto)
  chat!: TelegramChatDto;

  @IsNumber()
  date!: number;

  @IsOptional()
  @IsString()
  text?: string;

  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => TelegramPhotoSizeDto)
  photo?: TelegramPhotoSizeDto[];

  @IsOptional()
  @IsString()
  caption?: string;
}

export class TelegramWebhookDto {
  @IsNumber()
  update_id!: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => TelegramMessageDto)
  message?: TelegramMessageDto;
}

export class LangSelectDto {
  lang: string;
}
