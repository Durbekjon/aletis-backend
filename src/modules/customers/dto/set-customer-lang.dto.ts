import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNotEmpty } from 'class-validator';

export const SUPPORTED_CUSTOMER_LANGS = ['uz', 'ru', 'en'] as const;
export type SupportedCustomerLang = (typeof SUPPORTED_CUSTOMER_LANGS)[number];

export class SetCustomerLangDto {
  @ApiProperty({ enum: SUPPORTED_CUSTOMER_LANGS, example: 'uz' })
  @IsNotEmpty()
  @IsIn(SUPPORTED_CUSTOMER_LANGS as unknown as string[])
  lang: SupportedCustomerLang;
}
