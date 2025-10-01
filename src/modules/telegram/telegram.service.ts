import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { EncryptionService } from '../../core/encryption/encryption.service';
import { RetryService } from '../../core/retry/retry.service';
import { TelegramWebhookDto } from './dto/telegram.dto';
import { CustomersService } from '../customers/customers.service';
import { ConfigService } from '@nestjs/config';
import { BotsService } from '@modules/bots/bots.service';
import { Bot, Message } from '@prisma/client';
import { GeminiService } from '@core/gemini/gemini.service';
import { ProductsService } from '../products/products.service';

@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);
  private readonly processedUpdates = new Set<number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
    private readonly customersService: CustomersService,
    private readonly retryService: RetryService,
    private readonly configService: ConfigService,
    private readonly botService: BotsService,
    private readonly geminiService: GeminiService,
    private readonly productsService: ProductsService,
    // private readonly ordersService: OrdersService,
    // private readonly productsService: ProductsService,
    // private readonly channelsService: ChannelsService,
  ) {}

  async processUpdate(
    webhookData: TelegramWebhookDto,
    botId: number,
    organizationId: number,
  ): Promise<void> {
    this.logger.log(`Processing update: ${webhookData.update_id}`);

    // Check for duplicate updates (idempotency)
    if (this.processedUpdates.has(webhookData.update_id)) {
      this.logger.log(
        `Update ${webhookData.update_id} already processed, skipping`,
      );
      return;
    }

    if (!webhookData.message) {
      return;
    }
    const client = webhookData.message?.from;
    let customer = await this.customersService.getCustomerByTelegramId(
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
    // Mark update as being processed
    this.processedUpdates.add(webhookData.update_id);

    // // Clean up old update IDs to prevent memory leak (keep last 1000)
    if (this.processedUpdates.size > 1000) {
      const sortedIds = Array.from(this.processedUpdates).sort((a, b) => a - b);
      const toDelete = sortedIds.slice(0, sortedIds.length - 1000);
      toDelete.forEach((id) => this.processedUpdates.delete(id));
    }

    // // Only handle text messages for now
    if (!webhookData.message?.text) {
      this.logger.log('Ignoring non-text message');
      return;
    }

    const message = webhookData.message;
    const chatId = message.chat.id.toString();
    const userText = message.text;

    // // Check for channel connection command
    // if (userText === '/connect_flovo') {
    //   await this.handleChannelConnection(message);
    //   return;
    // }

    try {
      const bot = await this.botService._getBot(botId, organizationId);
      if (!bot) return;
      // Step 1.5: Check message timestamp to avoid processing old messages
      const messageDate = new Date(message.date * 1000); // Telegram sends Unix timestamp
      const currentTime = new Date();
      const timeDifference = currentTime.getTime() - messageDate.getTime();
      const maxAgeMinutes =
        this.configService.get<number>('MAX_MESSAGE_AGE_MINUTES') || 5; // Configurable, default 5 minutes

      if (timeDifference > maxAgeMinutes * 60 * 1000) {
        this.logger.log(
          `Ignoring old message from chat ${chatId}. Message age: ${Math.round(timeDifference / 1000 / 60)} minutes (max: ${maxAgeMinutes} minutes)`,
        );
        return;
      }

      // Additional check: Only process messages that arrived after the bot was last enabled
      // This prevents processing messages that arrived while the bot was disabled
      if (bot.updatedAt && messageDate < bot.updatedAt) {
        this.logger.log(
          `Ignoring message from chat ${chatId} that arrived before bot was enabled. Message: ${messageDate.toISOString()}, Bot enabled: ${bot.updatedAt.toISOString()}`,
        );
        return;
      }

      // Step 3: Save user message
      await this.saveMessage(customer.id, userText || '', 'USER');

      // Step 4: Get conversation history (last 10 messages)
      const history = await this.getConversationHistory(customer.id, 10);

      // Step 5: Process with AI and handle intents
      const aiResponse = await this.processWithAI(userText || '', history, bot);

      // Step 6: Save bot response
      await this.saveMessage(customer.id, aiResponse, 'BOT');

      // Step 7: Send reply via Telegram (placeholder for now)
      await this.sendTelegramReply(chatId, aiResponse);

      this.logger.log(`Successfully processed message from chat ${chatId}`);
    } catch (error) {
      this.logger.error(
        `Error processing update: ${error.message}`,
        error.stack,
      );
    }
  }

  // private async findBotForChat(chatId: string): Promise<Bot | null> {
  //   // For MVP, we'll return the first available bot
  //   // TODO: Implement proper bot identification based on webhook URL or token
  //   return this.prisma.bot.findFirst({
  //     where: { isEnabled: true },
  //   });
  // }

  private async saveMessage(
    customerId: number,
    content: string,
    sender: 'USER' | 'BOT',
  ): Promise<Message> {
    return this.prisma.message.create({
      data: {
        customerId,
        content,
        sender,
      },
    });
  }

  private async getConversationHistory(
    customerId: number,
    limit: number = 10,
  ): Promise<Message[]> {
    return this.prisma.message.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  private async processWithAI(
    userText: string,
    history: Message[],
    bot: Bot,
  ): Promise<string> {
    this.logger.log(`Processing AI request for: "${userText}"`);

    // Get current product inventory for this user
    const productContext = await this.productsService._getProductsForAI(
      bot.organizationId, //todo
    );

    // Get user's orders for context
    // const userOrders = await this.ordersService.getOrdersByUser(
    //   bot.organizationId,
    // ); //todo

    const aiResponse = await this.geminiService.generateResponse(
      userText,
      history,
      productContext,
      [],
    );

    // Handle order creation intent
    // if (aiResponse.intent === 'CREATE_ORDER' && aiResponse.orderData) {
    //   await this.handleOrderIntent(aiResponse.orderData, bot.organizationId);
    // }

    // // Handle order fetching intent
    // if (aiResponse.intent === 'FETCH_ORDERS' && aiResponse.shouldFetchOrders) {
    //   return await this.handleFetchOrdersIntent(bot.organizationId);
    // }

    return aiResponse.text;
  }

  // private async handleOrderIntent(
  //   orderData: any,
  //   userId: number,
  // ): Promise<void> {
  //   this.logger.log(`Processing order intent for user ${userId}:`, orderData);

  //   try {
  //     const order = await this.ordersService.createOrderFromIntent(
  //       userId,
  //       orderData,
  //     );
  //     this.logger.log(`Order created successfully: ${order.id}`);
  //   } catch (error) {
  //     this.logger.error(
  //       `Failed to create order: ${error.message}`,
  //       error.stack,
  //     );
  //   }
  // }

  // private async handleFetchOrdersIntent(userId: number): Promise<string> {
  //   this.logger.log(`Fetching orders for user ${userId}`);

  //   try {
  //     const orders = await this.ordersService.getOrdersByUser(userId);

  //     if (orders.length === 0) {
  //       return "You haven't placed any orders with us yet. Ready to make your first purchase? I'd be happy to help you find something great!";
  //     }

  //     // Format orders for display
  //     const ordersList = orders
  //       .slice(0, 5) // Show last 5 orders
  //       .map((order) => {
  //         const status = order.status.toLowerCase();
  //         const date = new Date(order.createdAt).toLocaleDateString();
  //         const details = order.details as any;
  //         const items = details?.items || 'N/A';
  //         return `• Order #${order.id}: ${items} (${status}) - ${date}`;
  //       })
  //       .join('\n');

  //     const response = `Here are your recent orders:\n\n${ordersList}`;

  //     if (orders.length > 5) {
  //       return (
  //         response +
  //         `\n\n...and ${orders.length - 5} more orders. Is there anything specific you'd like to know about any of these?`
  //       );
  //     }

  //     return response + `\n\nIs there anything else I can help you with today?`;
  //   } catch (error) {
  //     this.logger.error(
  //       `Failed to fetch orders: ${error.message}`,
  //       error.stack,
  //     );
  //     return "Oops! I'm having trouble accessing your orders right now. Can you try asking again in a moment?";
  //   }
  // }

  private async sendTelegramReply(chatId: string, text: string): Promise<void> {
    try {
      // Get the bot token from the first enabled bot (for MVP)
      // In production, we'd get the specific bot token for this conversation
      const bot = await this.prisma.bot.findFirst({
        where: { isEnabled: true },
      });

      if (!bot) {
        this.logger.error('No enabled bot found for sending reply');
        return;
      }

      // Decrypt the bot token
      const botToken = this.encryption.decrypt(bot.token);

      // Send message via Telegram Bot API with retry logic
      await this.retryService.executeWithRetry(
        async () => {
          const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
          const response = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              chat_id: chatId,
              text: text,
              parse_mode: 'HTML', // Enable HTML formatting
            }),
          });

          if (!response.ok) {
            const errorData = await response.text();
            throw new Error(
              `Telegram API error: ${response.status} - ${errorData}`,
            );
          }

          const result = await response.json();
          this.logger.log(
            `Message sent successfully to chat ${chatId}, message_id: ${result.result?.message_id}`,
          );
          return result;
        },
        {
          maxAttempts: 3,
          baseDelay: 1000,
          maxDelay: 5000,
        },
      );
    } catch (error) {
      this.logger.error(
        `Failed to send Telegram reply to chat ${chatId} after retries: ${error.message}`,
        error.stack,
      );
    }
  }

  // private async handleChannelConnection(message: any): Promise<void> {
  //   this.logger.log(
  //     `Handling channel connection command from chat ${message.chat.id}`,
  //   );

  //   try {
  //     // Verify that this is a channel
  //     if (message.chat.type !== 'channel') {
  //       this.logger.log(
  //         `Ignoring /connect_flovo command from non-channel: ${message.chat.type}`,
  //       );
  //       return;
  //     }

  //     // Extract required data
  //     const channelId = BigInt(message.chat.id);
  //     const channelTitle = message.chat.title || 'Unknown Channel';
  //     const telegramUserId = message.from.id;

  //     this.logger.log(
  //       `Channel connection attempt: channelId=${channelId}, title=${channelTitle}, userId=${telegramUserId}`,
  //     );

  //     // Find the user in our system by Telegram ID
  //     const user = await this.prisma.user.findFirst();

  //     if (!user) {
  //       this.logger.log(
  //         `No registered user found with Telegram ID ${telegramUserId}`,
  //       );
  //       return;
  //     }

  //     // Connect the channel
  //     await this.channelsService.connectChannel(
  //       user.id,
  //       channelId,
  //       channelTitle,
  //     );

  //     // Send confirmation message to the channel
  //     await this.sendChannelConnectionConfirmation(channelId.toString());

  //     this.logger.log(
  //       `Successfully connected channel ${channelId} to user ${user.id}`,
  //     );
  //   } catch (error) {
  //     this.logger.error(
  //       `Error handling channel connection: ${error.message}`,
  //       error.stack,
  //     );

  //     // Try to send error message to channel if possible
  //     try {
  //       await this.sendChannelConnectionError(message.chat.id.toString());
  //     } catch (sendError) {
  //       this.logger.error(
  //         `Failed to send error message to channel: ${sendError.message}`,
  //       );
  //     }
  //   }
  // }

  private async sendChannelConnectionConfirmation(
    chatId: string,
  ): Promise<void> {
    const confirmationMessage =
      '✅ Flovo has been successfully connected to this channel! You can now use the Autoposting feature from your dashboard.';
    await this.sendTelegramMessage(chatId, confirmationMessage);
  }

  // private async sendChannelConnectionError(chatId: string): Promise<void> {
  //   const errorMessage =
  //     '❌ Failed to connect this channel to Flovo. Please make sure you are registered on Flovo and try again.';
  //   await this.sendTelegramMessage(chatId, errorMessage);
  // }

  private async sendTelegramMessage(
    chatId: string,
    text: string,
  ): Promise<void> {
    try {
      // Get the bot token from the first enabled bot (for MVP)
      const bot = await this.prisma.bot.findFirst({
        where: { isEnabled: true },
      });

      if (!bot) {
        this.logger.error('No enabled bot found for sending message');
        return;
      }

      // Decrypt the bot token
      const botToken = this.encryption.decrypt(bot.token);
      // Send message via Telegram Bot API
      await this.retryService.executeWithRetry(
        async () => {
          const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
          const response = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              chat_id: chatId,
              text: text,
              parse_mode: 'HTML',
            }),
          });

          if (!response.ok) {
            const errorData = await response.text();
            throw new Error(
              `Telegram API error: ${response.status} - ${errorData}`,
            );
          }

          const result = await response.json();
          this.logger.log(
            `Message sent successfully to chat ${chatId}, message_id: ${result.result?.message_id}`,
          );
          return result;
        },
        {
          maxAttempts: 3,
          baseDelay: 1000,
          maxDelay: 5000,
        },
      );
    } catch (error) {
      this.logger.error(
        `Failed to send Telegram message to chat ${chatId}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }
}
