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
    const result = await this.validateWebhook(
      webhookData,
      botId,
      organizationId,
    );
    console.log(result);
    if (!result) {
      return { status: 'ok' };
    }
    const { bot, customer } = result;
    const decyptedToken = this.encryptionService.decrypt(bot.token);
    const isValid = await this.validateMessage(webhookData, bot);
    if (!isValid) return;

    // Get message content
    const messageContent = webhookData.message?.text || '';

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
      );

      // Send response to Telegram
      try {
        const res = await this.telegramService.sendRequest(
          decryptedToken,
          'sendMessage',
          {
            chat_id: customer.telegramId,
            text: processedResponse.text,
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
    if (this.processedUpdates.has(webhookData.update_id)) {
      return null;
    }
    if (!webhookData.message) {
      return null;
    }
    this.processedUpdates.add(webhookData.update_id);

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
    if (!message) {
      return false;
    }
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

    const aiResponse = await this.geminiService.generateResponse(
      message,
      history,
      productContext,
      userOrders,
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
