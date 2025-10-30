import { TelegramMessageDto } from '@modules/telegram/dto/telegram.dto';
import { Type } from 'class-transformer';
import {
  IsNumber,
  IsOptional,
  ValidateNested,
  IsString,
} from 'class-validator';
import { TelegramUserDto } from '@modules/telegram/dto/telegram.dto';

export class TelegramCallbackQueryDto {
  @IsString()
  id!: string;
  @ValidateNested()
  @Type(() => TelegramUserDto)
  from!: TelegramUserDto;
  @IsOptional()
  @ValidateNested()
  @Type(() => TelegramMessageDto)
  message?: TelegramMessageDto;
  @IsString()
  data!: string; // e.g. 'lang_en', 'lang_uz'
}

export class WebhookDto {
  @IsNumber()
  update_id!: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => TelegramMessageDto)
  message?: TelegramMessageDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => TelegramCallbackQueryDto)
  callback_query?: TelegramCallbackQueryDto;
}
