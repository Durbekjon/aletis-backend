import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { CustomersService } from '@/modules/customers/customers.service';
import { FileService } from '@/modules/file/file.service';
import { RetryService } from '@/core/retry/retry.service';

export const TELEGRAM_NETWORK_ERROR = 'NETWORK_ERROR';
@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);
  private readonly requestTimeoutMs = 8000;
  private readonly maxAttempts = 3;

  constructor(
    private readonly customersService: CustomersService,
    private readonly fileService: FileService,
    private readonly retryService: RetryService,
  ) {}
  async sendRequest(
    botToken: string,
    method: string,
    payload: Record<string, any>,
  ): Promise<any> {
    const url = `https://api.telegram.org/bot${botToken}/${method}`;
    const summarizePayload = () => {
      if (payload?.chat_id) {
        return `{ chat_id: ${payload.chat_id}, method: ${method} }`;
      }
      if (payload?.callback_query_id) {
        return `{ callback_query_id: ${payload.callback_query_id}, method: ${method} }`;
      }
      return `{ method: ${method} }`;
    };

    const performRequest = async () => {
      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        this.requestTimeoutMs,
      );

      try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
          signal: controller.signal,
    });

    const rawText = await response.text();
    let parsed: any | undefined;
    try {
      parsed = rawText ? JSON.parse(rawText) : undefined;
    } catch {
      // non-JSON response
    }

    const normalized: any = {
      ok: response.ok && (parsed?.ok ?? true),
      status: response.status,
      ...(parsed ?? {}),
    };

    if (!normalized.ok) {
          if (!normalized.error_code) {
            normalized.error_code = parsed?.error_code ?? response.status;
          }
          if (!normalized.description) {
            normalized.description =
              parsed?.description ??
              rawText ??
              response.statusText ??
              'Unknown error';
          }
        }

        const shouldRetry =
          (!normalized.ok &&
            (normalized.error_code === 429 ||
              normalized.status >= 500 ||
              normalized.error_code >= 500)) ||
          response.status >= 500;

        if (shouldRetry) {
          const retryError = new Error(
            `Telegram API ${method} failed with ${normalized.error_code}: ${normalized.description}`,
          );
          (retryError as any).retryable = true;
          throw retryError;
    }

    return normalized;
      } catch (error) {
        if ((error as any).name === 'AbortError') {
          const timeoutError = new Error(
            `Telegram API ${method} request timed out after ${this.requestTimeoutMs}ms`,
          );
          (timeoutError as any).retryable = true;
          throw timeoutError;
        }

        if (error instanceof TypeError || (error as any).code === 'ETIMEDOUT') {
          const networkError = new Error(
            `Telegram API ${method} network failure: ${error.message}`,
          );
          (networkError as any).retryable = true;
          throw networkError;
        }

        throw error;
      } finally {
        clearTimeout(timeout);
      }
    };

    try {
      return await this.retryService.executeWithRetry(performRequest, {
        maxAttempts: this.maxAttempts,
        baseDelay: 1000,
        maxDelay: 4000,
        backoffMultiplier: 2,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to reach Telegram API';
      this.logger.error(
        `[Telegram] Request ${method} failed after retries ${summarizePayload()}: ${message}`,
      );
      return {
        ok: false,
        status: 503,
        error_code: TELEGRAM_NETWORK_ERROR,
        description: message,
      };
    }
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
      let dbResult = null;
      try {
        dbResult = await this.customersService.setCustomerLang(
          customerId,
          lang,
        );
      } catch (err) {
        console.error('[LangSelect] DB update FAILED:', err);
      }
      let deleteMsgRes = null;
      try {
        deleteMsgRes = await this.sendRequest(botToken, 'deleteMessage', {
          chat_id: chatId,
          message_id: messageId,
        });
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
      } catch (err) {
        console.error('[LangSelect] Translation file error:', err);
      }
      let greetingRes = null;
      try {
        greetingRes = await this.sendRequest(botToken, 'sendMessage', {
          chat_id: chatId,
          text: greetings.greeting,
        });
      } catch (e) {
        console.error('[LangSelect] sendMessage failed:', e);
      }
    } catch (err) {
      console.error('[LangSelect] Total error:', err);
    }
  }

  /**
   * Fetches bot logo from Telegram API
   * Flow: getMe → getUserProfilePhotos → getFile → download file
   */
  async getBotLogo(
    botToken: string,
    organizationId: number,
  ): Promise<{ buffer: Buffer; mimeType: string; originalName: string } | null> {
    this.logger.log(`[getBotLogo] Starting for organizationId=${organizationId}`);
    try {
      // Step 1: Get bot info
      this.logger.log(`[getBotLogo] Step 1: Calling getMe API`);
      const botInfo = await this.sendRequest(botToken, 'getMe', {});
      if (!botInfo.ok || !botInfo.result) {
        this.logger.warn(`[getBotLogo] Step 1 FAILED: getMe returned ok=${botInfo.ok}, result=${!!botInfo.result}`);
        return null;
      }

      const botUserId = botInfo.result.id;
      this.logger.log(`[getBotLogo] Step 1 SUCCESS: Bot userId=${botUserId}`);

      // Step 2: Get user profile photos
      this.logger.log(`[getBotLogo] Step 2: Calling getUserProfilePhotos for userId=${botUserId}`);
      const photosResponse = await this.sendRequest(botToken, 'getUserProfilePhotos', {
        user_id: botUserId,
        limit: 1,
      });

      if (
        !photosResponse.ok ||
        !photosResponse.result ||
        !photosResponse.result.photos ||
        photosResponse.result.photos.length === 0
      ) {
        this.logger.warn(`[getBotLogo] Step 2 FAILED: ok=${photosResponse.ok}, hasResult=${!!photosResponse.result}, photosCount=${photosResponse.result?.photos?.length || 0}`);
        return null;
      }

      // Get the largest photo (last in the sizes array)
      const photos = photosResponse.result.photos[0];
      if (!photos || photos.length === 0) {
        this.logger.warn(`[getBotLogo] Step 2 FAILED: No photo sizes found in first photo`);
        return null;
      }

      const largestPhoto = photos[photos.length - 1];
      const fileId = largestPhoto.file_id;
      this.logger.log(`[getBotLogo] Step 2 SUCCESS: Found photo with fileId=${fileId}`);

      // Step 3: Get file path
      this.logger.log(`[getBotLogo] Step 3: Calling getFile for fileId=${fileId}`);
      const fileResponse = await this.sendRequest(botToken, 'getFile', {
        file_id: fileId,
      });

      if (!fileResponse.ok || !fileResponse.result) {
        this.logger.warn(`[getBotLogo] Step 3 FAILED: ok=${fileResponse.ok}, hasResult=${!!fileResponse.result}`);
        return null;
      }

      const filePath = fileResponse.result.file_path;
      if (!filePath) {
        this.logger.warn(`[getBotLogo] Step 3 FAILED: file_path is null or undefined`);
        return null;
      }
      this.logger.log(`[getBotLogo] Step 3 SUCCESS: file_path=${filePath}`);

      // Step 4: Download file from Telegram
      this.logger.log(`[getBotLogo] Step 4: Downloading file from Telegram`);
      const fileUrl = `https://api.telegram.org/file/bot${botToken}/${filePath}`;
      const fileResponse2 = await fetch(fileUrl);

      if (!fileResponse2.ok) {
        this.logger.warn(`[getBotLogo] Step 4 FAILED: HTTP ${fileResponse2.status} ${fileResponse2.statusText}`);
        return null;
      }

      const buffer = Buffer.from(await fileResponse2.arrayBuffer());
      const extension = path.extname(filePath).toLowerCase() || '.jpg';
      const mimeType =
        extension === '.jpg' || extension === '.jpeg'
          ? 'image/jpeg'
          : extension === '.png'
            ? 'image/png'
            : extension === '.webp'
              ? 'image/webp'
              : 'image/jpeg';

      this.logger.log(`[getBotLogo] Step 4 SUCCESS: Downloaded ${buffer.length} bytes, mimeType=${mimeType}, extension=${extension}`);
      return {
        buffer,
        mimeType,
        originalName: `bot_logo${extension}`,
      };
    } catch (error) {
      this.logger.error(`[getBotLogo] ERROR: ${error.message}`, error.stack);
      return null;
    }
  }

  /**
   * Fetches channel logo from Telegram API
   * Flow: getChat → getFile (if chat photo exists) → download file
   */
  async getChannelLogo(
    botToken: string,
    chatId: string,
    organizationId: number,
  ): Promise<{ buffer: Buffer; mimeType: string; originalName: string } | null> {
    this.logger.log(`[getChannelLogo] Starting for chatId=${chatId}, organizationId=${organizationId}`);
    try {
      // Step 1: Get chat info
      this.logger.log(`[getChannelLogo] Step 1: Calling getChat for chatId=${chatId}`);
      const chatInfo = await this.sendRequest(botToken, 'getChat', {
        chat_id: chatId,
      });

      if (!chatInfo.ok || !chatInfo.result) {
        this.logger.warn(`[getChannelLogo] Step 1 FAILED: getChat returned ok=${chatInfo.ok}, result=${!!chatInfo.result}`);
        return null;
      }

      this.logger.log(`[getChannelLogo] Step 1 SUCCESS: Chat info retrieved, hasPhoto=${!!chatInfo.result.photo}`);

      // Check if chat has a photo
      if (!chatInfo.result.photo) {
        this.logger.warn(`[getChannelLogo] Step 1 FAILED: Channel has no photo property`);
        return null;
      }

      const chatPhoto = chatInfo.result.photo;

      // Get the largest photo (big_file_id or small_file_id - use big_file_id)
      const fileId = chatPhoto.big_file_id || chatPhoto.small_file_id;
      if (!fileId) {
        this.logger.warn(`[getChannelLogo] Step 1 FAILED: No file_id found in photo (big_file_id=${chatPhoto.big_file_id}, small_file_id=${chatPhoto.small_file_id})`);
        return null;
      }
      this.logger.log(`[getChannelLogo] Step 1 SUCCESS: Found fileId=${fileId} (big=${!!chatPhoto.big_file_id}, small=${!!chatPhoto.small_file_id})`);

      // Step 2: Get file path
      this.logger.log(`[getChannelLogo] Step 2: Calling getFile for fileId=${fileId}`);
      const fileResponse = await this.sendRequest(botToken, 'getFile', {
        file_id: fileId,
      });

      if (!fileResponse.ok || !fileResponse.result) {
        this.logger.warn(`[getChannelLogo] Step 2 FAILED: ok=${fileResponse.ok}, hasResult=${!!fileResponse.result}`);
        return null;
      }

      const filePath = fileResponse.result.file_path;
      if (!filePath) {
        this.logger.warn(`[getChannelLogo] Step 2 FAILED: file_path is null or undefined`);
        return null;
      }
      this.logger.log(`[getChannelLogo] Step 2 SUCCESS: file_path=${filePath}`);

      // Step 3: Download file from Telegram
      this.logger.log(`[getChannelLogo] Step 3: Downloading file from Telegram`);
      const fileUrl = `https://api.telegram.org/file/bot${botToken}/${filePath}`;
      const fileResponse2 = await fetch(fileUrl);

      if (!fileResponse2.ok) {
        this.logger.warn(`[getChannelLogo] Step 3 FAILED: HTTP ${fileResponse2.status} ${fileResponse2.statusText}`);
        return null;
      }

      const buffer = Buffer.from(await fileResponse2.arrayBuffer());
      const extension = path.extname(filePath).toLowerCase() || '.jpg';
      const mimeType =
        extension === '.jpg' || extension === '.jpeg'
          ? 'image/jpeg'
          : extension === '.png'
            ? 'image/png'
            : extension === '.webp'
              ? 'image/webp'
              : 'image/jpeg';

      this.logger.log(`[getChannelLogo] Step 3 SUCCESS: Downloaded ${buffer.length} bytes, mimeType=${mimeType}, extension=${extension}`);
      return {
        buffer,
        mimeType,
        originalName: `channel_logo${extension}`,
      };
    } catch (error) {
      this.logger.error(`[getChannelLogo] ERROR: ${error.message}`, error.stack);
      return null;
    }
  }
}
