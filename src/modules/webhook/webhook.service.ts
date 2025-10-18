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
    await this.messagesService._saveMessage(
      customer.id,
      webhookData.message?.text || '',
      'USER',
      bot.id,
    );
    const history = await this.messagesService._getCustomerLastMessages(
      customer.id,
      10,
    );
    console.log(history);
    const aiResponse = await this.processWithAI(
      webhookData.message?.text || '',
      history,
      bot,
      customer,
    );

    // Process AI response and handle any order intents
    const processedResponse = await this.aiResponseHandler.processAiResponse(
      aiResponse,
      customer,
      organizationId,
    );

    try {
      const res = await this.telegramService.sendRequest(
        decyptedToken,
        'sendMessage',
        {
          chat_id: webhookData.message?.chat.id,
          text: processedResponse.text,
          parse_mode: 'HTML',
        },
      );

      if (!res.ok) {
        this.logger.error(
          `Failed to send message to customer: ${res.description || 'Unknown error'}`,
        );
        // Don't throw here as it would break the webhook flow
        // Just log the error and continue
      }
    } catch (error) {
      this.logger.error(
        `Telegram API error when sending message: ${error.message}`,
      );
      // Don't throw here as it would break the webhook flow
    }
    await this.messagesService._saveMessage(
      customer.id,
      processedResponse.text,
      'BOT',
      bot.id,
    );
    return { status: 'ok' };
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
