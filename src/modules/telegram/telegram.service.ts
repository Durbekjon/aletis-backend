import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { CustomersService } from '@/modules/customers/customers.service';
@Injectable()
export class TelegramService {
  constructor(private readonly customersService: CustomersService) {}
  async sendRequest(
    botToken: string,
    method: string,
    payload: Record<string, any>,
  ): Promise<any> {
    const url = `https://api.telegram.org/bot${botToken}/${method}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    // Normalize response so callers can handle specific Telegram error codes
    const rawText = await response.text();
    let parsed: any | undefined;
    try {
      parsed = rawText ? JSON.parse(rawText) : undefined;
    } catch {
      // non-JSON response
    }

    const normalized: any = {
      // ok should reflect HTTP ok AND Telegram ok when present
      ok: response.ok && (parsed?.ok ?? true),
      status: response.status,
      ...(parsed ?? {}),
    };

    if (!normalized.ok) {
      // Ensure error_code/description are populated for consistent handling
      if (!normalized.error_code) normalized.error_code = response.status;
      if (!normalized.description)
        normalized.description = rawText || 'Unknown error';
    }

    return normalized;
  }

  async handleStartCommand(chatId: string, botToken: string) {
    // Load language selection messages
    const selectText =
      'Please choose your language:\nIltimos, tilni tanlang:\nПожалуйста, выберите язык:';
    const reply_markup = {
      inline_keyboard: [
        [
          { text: '🇺🇿 Uzbek', callback_data: 'lang_uz' },
          { text: '🇷🇺 Russian', callback_data: 'lang_ru' },
          { text: '🇬🇧 English', callback_data: 'lang_en' },
        ],
      ],
    };
    await this.sendRequest(botToken, 'sendMessage', {
      chat_id: chatId,
      text: selectText,
      reply_markup,
    });
  }

  // Add handler for callback queries for language selection
  async handleLanguageSelect(
    chatId: string,
    messageId: number,
    lang: string,
    customerId: number,
    botToken: string,
  ) {
    try {
      console.log('[LangSelect] START', {
        customerId,
        lang,
        chatId,
        messageId,
      });
      let dbResult = null;
      try {
        dbResult = await this.customersService.setCustomerLang(
          customerId,
          lang,
        );
        console.log('[LangSelect] DB update success:', dbResult);
      } catch (err) {
        console.error('[LangSelect] DB update FAILED:', err);
      }
      console.log('[LangSelect] Pre-deleteMessage', { chatId, messageId });
      let deleteMsgRes = null;
      try {
        deleteMsgRes = await this.sendRequest(botToken, 'deleteMessage', {
          chat_id: chatId,
          message_id: messageId,
        });
        console.log('[LangSelect] deleteMessage result:', deleteMsgRes);
      } catch (e) {
        console.error('[LangSelect] deleteMessage failed:', e);
      }
      const localePath = path.resolve(
        __dirname,
        '../../../templates/',
        `${lang}.json`,
      );
      let greetings: any = { greeting: 'Welcome!' };
      let translationFound = false;
      try {
        if (fs.existsSync(localePath)) {
          greetings = JSON.parse(fs.readFileSync(localePath, 'utf8'));
          translationFound = true;
        }
        console.log(
          '[LangSelect] Translation found:',
          translationFound,
          localePath,
          greetings,
        );
      } catch (err) {
        console.error('[LangSelect] Translation file error:', err);
      }
      console.log('[LangSelect] Sending greeting...', {
        chatId,
        greeting: greetings.greeting,
      });
      let greetingRes = null;
      try {
        greetingRes = await this.sendRequest(botToken, 'sendMessage', {
          chat_id: chatId,
          text: greetings.greeting,
        });
        console.log('[LangSelect] sendMessage result:', greetingRes);
      } catch (e) {
        console.error('[LangSelect] sendMessage failed:', e);
      }
      console.log('[LangSelect] END');
    } catch (err) {
      console.error('[LangSelect] Total error:', err);
    }
  }
}
