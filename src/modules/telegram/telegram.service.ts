import { Injectable } from '@nestjs/common';
@Injectable()
export class TelegramService {
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

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Telegram API error: ${response.status} - ${errorText}`);
    }
    return response.json();
  }

  // async processUpdate(
  //   webhookData: TelegramWebhookDto,
  //   botId: number,
  //   organizationId: number,
  // ): Promise<void> {
  //   this.logger.log(`Processing update: ${webhookData.update_id}`);

  //   // Check for duplicate updates (idempotency)
  //   if (this.processedUpdates.has(webhookData.update_id)) {
  //     this.logger.log(
  //       `Update ${webhookData.update_id} already processed, skipping`,
  //     );
  //     return;
  //   }

  //   if (!webhookData.message) {
  //     return;
  //   }
  //   const client = webhookData.message?.from;
  //   let customer = await this.customersService._getCustomerByTelegramId(
  //     client.id.toString(),
  //     organizationId,
  //     botId,
  //   );
  //   if (!customer) {
  //     let newCustomerName = client.first_name;
  //     if (client.last_name) newCustomerName += ` ${client.last_name}`;
  //     customer = await this.customersService.createCustomer({
  //       telegramId: client.id.toString(),
  //       organizationId,
  //       botId,
  //       name: newCustomerName,
  //       username: client.username || null,
  //     });
  //   }
  //   // Mark update as being processed
  //   this.processedUpdates.add(webhookData.update_id);

  //   // // Clean up old update IDs to prevent memory leak (keep last 1000)
  //   if (this.processedUpdates.size > 1000) {
  //     const sortedIds = Array.from(this.processedUpdates).sort((a, b) => a - b);
  //     const toDelete = sortedIds.slice(0, sortedIds.length - 1000);
  //     toDelete.forEach((id) => this.processedUpdates.delete(id));
  //   }

  //   // // Only handle text messages for now
  //   if (!webhookData.message?.text) {
  //     this.logger.log('Ignoring non-text message');
  //     return;
  //   }

  //   const message = webhookData.message;
  //   const chatId = message.chat.id.toString();
  //   const userText = message.text;

  //   // // Check for channel connection command
  //   // if (userText === '/connect_flovo') {
  //   //   await this.handleChannelConnection(message);
  //   //   return;
  //   // }

  //   try {
  //     const bot = await this.botService._getBot(botId, organizationId);
  //     if (!bot) return;
  //     // Step 1.5: Check message timestamp to avoid processing old messages
  //     const messageDate = new Date(message.date * 1000); // Telegram sends Unix timestamp
  //     const currentTime = new Date();
  //     const timeDifference = currentTime.getTime() - messageDate.getTime();
  //     const maxAgeMinutes =
  //       this.configService.get<number>('MAX_MESSAGE_AGE_MINUTES') || 5; // Configurable, default 5 minutes

  //     if (timeDifference > maxAgeMinutes * 60 * 1000) {
  //       this.logger.log(
  //         `Ignoring old message from chat ${chatId}. Message age: ${Math.round(timeDifference / 1000 / 60)} minutes (max: ${maxAgeMinutes} minutes)`,
  //       );
  //       return;
  //     }

  //     // Additional check: Only process messages that arrived after the bot was last enabled
  //     // This prevents processing messages that arrived while the bot was disabled
  //     if (bot.updatedAt && messageDate < bot.updatedAt) {
  //       this.logger.log(
  //         `Ignoring message from chat ${chatId} that arrived before bot was enabled. Message: ${messageDate.toISOString()}, Bot enabled: ${bot.updatedAt.toISOString()}`,
  //       );
  //       return;
  //     }

  //     // Step 3: Save user message
  //     await this.saveMessage(customer.id, userText || '', 'USER');

  //     // Step 4: Get conversation history (last 10 messages)
  //     const history = await this.getConversationHistory(customer.id, 10);

  //     // Step 5: Process with AI and handle intents
  //     const aiResponse = await this.processWithAI(userText || '', history, bot);

  //     // Step 6: Save bot response
  //     await this.saveMessage(customer.id, aiResponse, 'BOT');

  //     // Step 7: Send reply via Telegram (placeholder for now)
  //     await this.sendTelegramReply(chatId, aiResponse);

  //     this.logger.log(`Successfully processed message from chat ${chatId}`);
  //   } catch (error) {
  //     this.logger.error(
  //       `Error processing update: ${error.message}`,
  //       error.stack,
  //     );
  //   }
  // }

  // private async findBotForChat(chatId: string): Promise<Bot | null> {
  //   // For MVP, we'll return the first available bot
  //   // TODO: Implement proper bot identification based on webhook URL or token
  //   return this.prisma.bot.findFirst({
  //     where: { isEnabled: true },
  //   });
  // }

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

  // private async sendChannelConnectionConfirmation(
  //   chatId: string,
  // ): Promise<void> {
  //   const confirmationMessage =
  //     '✅ Flovo has been successfully connected to this channel! You can now use the Autoposting feature from your dashboard.';
  //   await this.sendTelegramMessage(chatId, confirmationMessage);
  // }

  // private async sendChannelConnectionError(chatId: string): Promise<void> {
  //   const errorMessage =
  //     '❌ Failed to connect this channel to Flovo. Please make sure you are registered on Flovo and try again.';
  //   await this.sendTelegramMessage(chatId, errorMessage);
  // }
}