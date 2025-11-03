import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { WebhookDto } from './dto/webhook.dto';
import { BotsService } from '@modules/bots/bots.service';
import { CustomersService } from '@modules/customers/customers.service';
import { Bot, Customer, Message } from '@prisma/client';
import { MessagesService } from '@modules/messages/messages.service';
import { ConfigService } from '@nestjs/config';
import { GeminiService } from '@core/gemini/gemini.service';
import { ProductsService } from '@modules/products/products.service';
import { TelegramService } from '@modules/telegram/telegram.service';
import { EncryptionService } from '@core/encryption/encryption.service';
import { OrdersService } from '@modules/orders/orders.service';
import { AiResponseHandlerService } from './ai-response-handler.service';
import {
  MessageBufferService,
  FlushResult,
} from '@core/message-buffer/message-buffer.service';

@Injectable()
export class WebhookService {
  private readonly processedUpdates = new Set<number>();
  private readonly logger = new Logger(WebhookService.name);

  constructor(
    private readonly botService: BotsService,
    private readonly customersService: CustomersService,
    private readonly messagesService: MessagesService,
    private readonly configService: ConfigService,
    private readonly geminiService: GeminiService,
    private readonly productsService: ProductsService,
    private readonly telegramService: TelegramService,
    private readonly encryptionService: EncryptionService,
    private readonly ordersService: OrdersService,
    private readonly aiResponseHandler: AiResponseHandlerService,
    private readonly messageBufferService: MessageBufferService,
  ) {}

  async handleWebhook(
    webhookData: WebhookDto,
    botId: number,
    organizationId: number,
  ) {
    // Prioritize callback_query (inline button) handling
    if (
      webhookData.callback_query &&
      webhookData.callback_query.data &&
      webhookData.callback_query.data.startsWith('lang_')
    ) {
      const { message, data, id: callbackQueryId } = webhookData.callback_query;
      const lang = data.replace('lang_', '');
      let customer: any = null;
      let chatId: string | undefined = undefined;
      let messageId: number | undefined = undefined;
      if (message && message.chat && message.chat.id) {
        chatId = message.chat.id.toString();
        messageId = message.message_id;
        try {
          customer = await this.customersService._getCustomerByTelegramId(
            chatId,
            organizationId,
            botId,
          );
        } catch (err) {
          console.error(
            '[Webhook] Customer lookup FAILED in callback_query',
            err,
          );
        }
      }
      // Find bot to fetch token
      const botObj = await this.botService._getBot(botId, organizationId);
      const decyptedToken = botObj
        ? this.encryptionService.decrypt(botObj.token)
        : '';
      if (!customer || !chatId || !messageId) {
        // Respond to callback_query so Telegram doesn't hang
        if (decyptedToken) {
          await this.telegramService.sendRequest(
            decyptedToken,
            'answerCallbackQuery',
            {
              callback_query_id: callbackQueryId,
              text: 'User not found for this action! Please try /start again.',
              show_alert: true,
            },
          );
        }
        return {
          status: 'error',
          error: 'Customer or message details not found in callback_query',
        };
      }
      // Must always respond promptly!
      await this.telegramService.sendRequest(
        decyptedToken,
        'answerCallbackQuery',
        {
          callback_query_id: callbackQueryId,
        },
      );
      await this.telegramService.handleLanguageSelect(
        chatId,
        messageId,
        lang,
        customer.id,
        decyptedToken,
      );
      return { status: 'lang_selected', lang };
    }

    // Normal message handler...
    const result = await this.validateWebhook(
      webhookData,
      botId,
      organizationId,
    );
    if (!result) {
      return { status: 'ok' };
    }
    const { bot, customer } = result;
    const decyptedToken = this.encryptionService.decrypt(bot.token);
    // Give every message/callback entry point its own validation
    let isValid = false;
    if (webhookData.message) {
      isValid = await this.validateMessage(webhookData, bot);
      if (!isValid) return;
    }

    // Handle Telegram language selection via callback_query (inline button)
    if (
      webhookData.callback_query &&
      webhookData.callback_query.data &&
      webhookData.callback_query.data.startsWith('lang_')
    ) {
      this.logger.verbose(
        `callback_query received: ${JSON.stringify(webhookData.callback_query)}`,
      );
      const { message, data } = webhookData.callback_query;
      const lang = data.replace('lang_', '');
      if (!message) {
        this.logger.error(
          'Missing message context for callback query',
          webhookData.callback_query,
        );
        return {
          status: 'error',
          error: 'Missing message context for callback query',
        };
      }
      this.logger.log(
        `Processing language selection callback for lang='${lang}', chatId=${message.chat.id}, messageId=${message.message_id}, customer=${customer.id}`,
      );
      await this.telegramService.handleLanguageSelect(
        message.chat.id.toString(),
        message.message_id,
        lang,
        customer.id,
        decyptedToken,
      );
      this.logger.log(
        `Language selection processed for lang='${lang}', customer=${customer.id}`,
      );
      return { status: 'lang_selected', lang };
    }

    // Get message content
    const messageContent = webhookData.message?.text || '';

    if (messageContent === '/start') {
      // Send onboarding language select
      await this.telegramService.handleStartCommand(
        customer.telegramId,
        decyptedToken,
      );
      return { status: 'onboarding' };
    }

    // Save individual message to database
    await this.messagesService._saveMessage(
      customer.id,
      messageContent,
      'USER',
      bot.id,
    );

    this.logger.log(
      `Message received from customer ${customer.id}: "${messageContent.substring(0, 50)}${messageContent.length > 50 ? '...' : ''}"`,
    );

    // Add message to buffer with callback for when it's flushed
    this.messageBufferService.addMessage(
      customer.id,
      bot.id,
      organizationId,
      messageContent,
      async (flushResult: FlushResult) => {
        await this.processBufferedMessages(
          flushResult,
          bot,
          customer,
          decyptedToken,
        );
      },
    );

    return { status: 'ok' };
  }

  /**
   * Process buffered messages after buffer flush
   * This is called by the MessageBufferService when the buffer is flushed
   *
   * @param flushResult - The result of flushing the buffer
   * @param bot - The bot instance
   * @param customer - The customer instance
   * @param decryptedToken - The decrypted bot token
   */
  private async processBufferedMessages(
    flushResult: FlushResult,
    bot: Bot,
    customer: Customer,
    decryptedToken: string,
  ): Promise<void> {
    try {
      this.logger.log(
        `Processing buffered messages for customer ${customer.id}: ${flushResult.messageCount} messages merged`,
      );

      // Get conversation history (last 10 messages)
      const history = await this.messagesService._getCustomerLastMessages(
        customer.id,
        10,
      );

      // Process merged message with AI
      const aiResponse = await this.processWithAI(
        flushResult.combinedMessage,
        history,
        bot,
        customer,
      );

      // Process AI response and handle any order intents
      const processedResponse = await this.aiResponseHandler.processAiResponse(
        aiResponse,
        customer,
        flushResult.organizationId,
        flushResult.combinedMessage, // Pass the original user message for language detection
      );

      // Send response to Telegram (single message)
      try {
        const images = (aiResponse as any).images as string[] | undefined;
        const baseUrl =
          this.configService.get<string>('BASE_URL') ||
          process.env.BASE_URL ||
          '';
        const toAbsolute = (url: string) => {
          // Already absolute
          if (/^https?:\/\//i.test(url)) return url;
          // Only prefix when pointing to public/* assets
          if (/^\/?public\//i.test(url)) {
            const left = baseUrl.replace(/\/+$/g, '');
            const right = url.replace(/^\/+/, '');
            return `${left}/${right}`;
          }
          // Leave other relative paths unchanged
          return url;
        };

        if (images && images.length > 0) {
          // If multiple images, use sendMediaGroup (max 10 images)
          if (images.length > 1) {
            const mediaGroup = images.slice(0, 10).map((imageUrl, index) => {
              const absoluteUrl = toAbsolute(imageUrl);
              return {
                type: 'photo',
                media: absoluteUrl,
                // Only add caption to the first image
                ...(index === 0 && {
                  caption: (() => {
                    const cleanedText = processedResponse.text
                      .replace(/\[INTENT:CREATE_ORDER\][\s\S]*$/g, '')
                      .replace(/\[INTENT:ORDER_CONFIRMATION\][\s\S]*$/g, '')
                      .replace(/\[INTENT:FETCH_ORDERS\][\s\S]*$/g, '')
                      .replace(/\[INTENT:CANCEL_ORDER\][\s\S]*$/g, '')
                      .trim();
                    return cleanedText.length > 1024
                      ? cleanedText.slice(0, 1010) + '...'
                      : cleanedText;
                  })(),
                  parse_mode: 'HTML',
                }),
              };
            });

            const res = await this.telegramService.sendRequest(
              decryptedToken,
              'sendMediaGroup',
              {
                chat_id: customer.telegramId,
                media: mediaGroup,
              },
            );

            if (!res.ok) {
              this.logger.error(
                `Failed to send media group to customer ${customer.id}: ${res.description || 'Unknown error'}`,
              );
            } else {
              this.logger.log(
                `AI media group sent to customer ${customer.id}: ${images.length} images with caption "${processedResponse.text.substring(0, 50)}${processedResponse.text.length > 50 ? '...' : ''}"`,
              );
            }
          } else {
            // Single image - use sendPhoto
            const firstPhoto = toAbsolute(images[0]);
            let caption = processedResponse.text
              .replace(/\[INTENT:CREATE_ORDER\][\s\S]*$/g, '')
              .replace(/\[INTENT:ORDER_CONFIRMATION\][\s\S]*$/g, '')
              .replace(/\[INTENT:FETCH_ORDERS\][\s\S]*$/g, '')
              .replace(/\[INTENT:CANCEL_ORDER\][\s\S]*$/g, '')
              .trim();
            if (caption.length > 1024) caption = caption.slice(0, 1010) + '...';

            const res = await this.telegramService.sendRequest(
              decryptedToken,
              'sendPhoto',
              {
                chat_id: customer.telegramId,
                photo: firstPhoto,
                caption,
                parse_mode: 'HTML',
              },
            );

            if (!res.ok) {
              this.logger.error(
                `Failed to send photo with caption to customer ${customer.id}: ${res.description || 'Unknown error'}`,
              );
            } else {
              this.logger.log(
                `AI photo+caption sent to customer ${customer.id}: "${processedResponse.text.substring(0, 50)}${processedResponse.text.length > 50 ? '...' : ''}"`,
              );
            }
          }
        } else {
          // Clean the response to remove any technical code that might have leaked through
          const cleanedText = processedResponse.text
            .replace(/\[INTENT:CREATE_ORDER\][\s\S]*$/g, '')
            .replace(/\[INTENT:ORDER_CONFIRMATION\][\s\S]*$/g, '')
            .replace(/\[INTENT:FETCH_ORDERS\][\s\S]*$/g, '')
            .replace(/\[INTENT:CANCEL_ORDER\][\s\S]*$/g, '')
            .trim();

          const htmlMessage = this.markdownToHtml(cleanedText);
          const res = await this.telegramService.sendRequest(
            decryptedToken,
            'sendMessage',
            {
              chat_id: customer.telegramId,
              text: htmlMessage,
              parse_mode: 'HTML',
            },
          );

          if (!res.ok) {
            this.logger.error(
              `Failed to send message to customer ${customer.id}: ${res.description || 'Unknown error'}`,
            );
          } else {
            this.logger.log(
              `AI response sent to customer ${customer.id}: "${processedResponse.text.substring(0, 50)}${processedResponse.text.length > 50 ? '...' : ''}"`,
            );
          }
        }
      } catch (error) {
        this.logger.error(
          `Telegram API error when sending message to customer ${customer.id}: ${error.message}`,
        );
      }

      // Save bot response to database
      await this.messagesService._saveMessage(
        customer.id,
        processedResponse.text,
        'BOT',
        bot.id,
      );
    } catch (error) {
      this.logger.error(
        `Error processing buffered messages for customer ${customer.id}: ${error.message}`,
        error.stack,
      );
    }
  }

  private markdownToHtml(text: string): string {
    return text
      .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>') // bold
      .replace(/_(.*?)_/g, '<i>$1</i>'); // italic
  }
  private async getCustomerFromWebhook(
    webhookData: WebhookDto,
    botId: number,
    organizationId: number,
  ): Promise<Customer | null> {
    const client = webhookData.message?.from;
    if (!client) {
      return null;
    }
    let customer = await this.customersService._getCustomerByTelegramId(
      client.id.toString(),
      organizationId,
      botId,
    );
    if (!customer) {
      let newCustomerName = client.first_name;
      if (client.last_name) newCustomerName += ` ${client.last_name}`;
      customer = await this.customersService.createCustomer({
        telegramId: client.id.toString(),
        organizationId,
        botId,
        name: newCustomerName,
        username: client.username || null,
      });
    }
    return customer;
  }

  private async validateWebhook(
    webhookData: WebhookDto,
    botId: number,
    organizationId: number,
  ): Promise<{ bot: Bot; customer: Customer } | null> {
    if (!webhookData.message && !webhookData.callback_query) {
      return null;
    }
    if (!webhookData.callback_query) {
      this.processedUpdates.add(webhookData.update_id);
    }

    const [bot, customer] = await Promise.all([
      this.botService._getBot(botId, organizationId),
      this.getCustomerFromWebhook(webhookData, botId, organizationId),
      this.cleanUpProcessedUpdates(),
    ]);
    if (!bot) {
      throw new NotFoundException('Bot not found');
    }
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }
    return { bot, customer };
  }

  private async validateMessage(
    webhookData: WebhookDto,
    bot: Bot,
  ): Promise<boolean> {
    const message = webhookData.message;
    const callbackQuery = webhookData.callback_query;
    if (!message && !callbackQuery) {
      return false;
    }
    if (message && !callbackQuery) {
      const messageDate = new Date(message.date * 1000); // Telegram sends Unix timestamp
      const currentTime = new Date();
      const timeDifference = currentTime.getTime() - messageDate.getTime();
      const maxAgeMinutes =
        this.configService.get<number>('MAX_MESSAGE_AGE_MINUTES') || 5; // Configurable, default 5 minutes

      if (timeDifference > maxAgeMinutes * 60 * 1000) {
        this.logger.log(
          `Ignoring old message from chat ${message.chat.id}. Message age: ${Math.round(timeDifference / 1000 / 60)} minutes (max: ${maxAgeMinutes} minutes)`,
        );
        return false;
      }

      if (bot.updatedAt && messageDate < bot.updatedAt) {
        this.logger.log(
          `Ignoring message from chat ${message.chat.id} that arrived before bot was enabled. Message: ${messageDate.toISOString()}, Bot enabled: ${bot.updatedAt.toISOString()}`,
        );
        return false;
      }
    } else if (callbackQuery && !message) {
      return true;
    } else {
      return false;
    }
    return true;
  }

  private async processWithAI(
    message: string,
    history: Message[],
    bot: Bot,
    customer: Customer,
  ) {
    // Get user's orders for context
    const userOrders = await this.ordersService.getOrdersForAI(
      bot.organizationId,
      customer.id,
    );
    const productContext = await this.productsService._getProductsForAI(
      bot.organizationId,
    );

    this.logger.log(`Product context: ${productContext}`);

    // Use customer.lang if set to force language; fallback is existing prompt logic (auto-detect)
    const aiResponse = await this.geminiService.generateResponse(
      message,
      history,
      productContext,
      userOrders,
      customer.lang || undefined, // new param
    );

    return aiResponse;
  }

  private async cleanUpProcessedUpdates() {
    if (this.processedUpdates.size > 1000) {
      const sortedIds = Array.from(this.processedUpdates).sort((a, b) => a - b);
      const toDelete = sortedIds.slice(0, sortedIds.length - 1000);
      toDelete.forEach((id) => this.processedUpdates.delete(id));
    }
  }
}
