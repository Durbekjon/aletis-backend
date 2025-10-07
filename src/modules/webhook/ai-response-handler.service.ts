import { Injectable, Logger } from '@nestjs/common';
import { OrdersService } from '@modules/orders/orders.service';
import { AiResponse } from '@core/gemini/gemini.service';
import { Customer } from '@prisma/client';

export interface ProcessedAiResponse {
  text: string;
  orderCreated?: boolean;
  orderId?: number;
  ordersFetched?: boolean;
  orderCancelled?: boolean;
}

@Injectable()
export class AiResponseHandlerService {
  private readonly logger = new Logger(AiResponseHandlerService.name);

  constructor(private readonly ordersService: OrdersService) {}

  /**
   * Process AI response and execute corresponding order actions
   */
  async processAiResponse(
    aiResponse: AiResponse,
    customer: Customer,
    organizationId: number,
  ): Promise<ProcessedAiResponse> {
    try {
      switch (aiResponse.intent) {
        case 'CREATE_ORDER':
          return await this.handleCreateOrderIntent(
            aiResponse,
            customer,
            organizationId,
          );

        case 'FETCH_ORDERS':
          return await this.handleFetchOrdersIntent(
            aiResponse,
            customer,
            organizationId,
          );

        case 'CANCEL_ORDER':
          return await this.handleCancelOrderIntent(
            aiResponse,
            customer,
            organizationId,
          );

        default:
          return {
            text: aiResponse.text,
          };
      }
    } catch (error) {
      this.logger.error(
        `Error processing AI response: ${error.message}`,
        error.stack,
      );
      return {
        text: aiResponse.text || "I'm sorry, I encountered an error processing your request. Please try again.",
      };
    }
  }

  /**
   * Handle CREATE_ORDER intent
   */
  private async handleCreateOrderIntent(
    aiResponse: AiResponse,
    customer: Customer,
    organizationId: number,
  ): Promise<ProcessedAiResponse> {
    if (!aiResponse.orderData) {
      this.logger.warn('CREATE_ORDER intent received but no order data provided');
      return {
        text: aiResponse.text || "I'd be happy to help you place an order! Could you please tell me what you'd like to order?",
      };
    }

    try {
      const order = await this.ordersService.createFromAIResponse(
        aiResponse.orderData,
        customer,
        organizationId,
      );

      const confirmationMessage = this.buildOrderConfirmationMessage(order);
      
      this.logger.log(`Order created via AI: ${order.id} for customer: ${customer.id}`);

      return {
        text: confirmationMessage,
        orderCreated: true,
        orderId: order.id,
      };
    } catch (error) {
      this.logger.error(`Failed to create order via AI: ${error.message}`, error.stack);
      return {
        text: "I'm sorry, I couldn't process your order right now. Please try again or contact our support team.",
      };
    }
  }

  /**
   * Handle FETCH_ORDERS intent
   */
  private async handleFetchOrdersIntent(
    aiResponse: AiResponse,
    customer: Customer,
    organizationId: number,
  ): Promise<ProcessedAiResponse> {
    try {
      const orders = await this.ordersService.getOrdersForCustomer(
        customer.id,
        organizationId,
        5, // Last 5 orders
      );

      const ordersMessage = this.buildOrdersListMessage(orders);
      
      this.logger.log(`Orders fetched via AI for customer: ${customer.id}`);

      return {
        text: ordersMessage,
        ordersFetched: true,
      };
    } catch (error) {
      this.logger.error(`Failed to fetch orders via AI: ${error.message}`, error.stack);
      return {
        text: "I'm having trouble retrieving your orders right now. Please try again later.",
      };
    }
  }

  /**
   * Handle CANCEL_ORDER intent
   */
  private async handleCancelOrderIntent(
    aiResponse: AiResponse,
    customer: Customer,
    organizationId: number,
  ): Promise<ProcessedAiResponse> {
    // Extract order ID from the AI response or order data
    const orderId = aiResponse.orderData?.orderId || this.extractOrderIdFromText(aiResponse.text);
    
    if (!orderId) {
      return {
        text: "I'd be happy to help you cancel an order! Could you please tell me which order you'd like to cancel? You can provide the order number.",
      };
    }

    try {
      const order = await this.ordersService.cancelOrder(
        orderId,
        customer.id,
        organizationId,
      );

      const cancellationMessage = this.buildOrderCancellationMessage(order);
      
      this.logger.log(`Order cancelled via AI: ${order.id} for customer: ${customer.id}`);

      return {
        text: cancellationMessage,
        orderCancelled: true,
        orderId: order.id,
      };
    } catch (error) {
      this.logger.error(`Failed to cancel order via AI: ${error.message}`, error.stack);
      
      if (error.message.includes('not found')) {
        return {
          text: "I couldn't find that order. Please check the order number and try again.",
        };
      }
      
      if (error.message.includes('Cannot cancel')) {
        return {
          text: "I'm sorry, but that order cannot be cancelled at this time. Please contact our support team for assistance.",
        };
      }

      return {
        text: "I'm sorry, I couldn't cancel your order right now. Please try again or contact our support team.",
      };
    }
  }

  /**
   * Build order confirmation message
   */
  private buildOrderConfirmationMessage(order: any): string {
    const items = order.details?.items || [];
    const itemsText = Array.isArray(items) ? items.join(', ') : items;
    
    return `✅ <b>Order Confirmed!</b>

📋 <b>Order #${order.id}</b>
🛍️ <b>Items:</b> ${itemsText || 'To be specified'}
📞 <b>Contact:</b> ${order.details?.phoneNumber || 'Not provided'}
📝 <b>Notes:</b> ${order.details?.notes || 'None'}

Your order has been received and is being processed. We'll contact you soon with more details!

Is there anything else I can help you with?`;
  }

  /**
   * Build orders list message
   */
  private buildOrdersListMessage(orders: any[]): string {
    if (orders.length === 0) {
      return `📋 <b>Your Orders</b>

You don't have any orders yet. Would you like to place your first order? I can help you find the perfect products!`;
    }

    let message = `📋 <b>Your Recent Orders</b>\n\n`;

    orders.forEach((order, index) => {
      const status = this.getStatusEmoji(order.status);
      const items = order.details?.items || 'No items specified';
      const createdAt = new Date(order.createdAt).toLocaleDateString();
      
      message += `${index + 1}. ${status} <b>Order #${order.id}</b>\n`;
      message += `   📅 ${createdAt}\n`;
      message += `   🛍️ ${items}\n`;
      message += `   💰 $${order.totalPrice || 0}\n\n`;
    });

    message += `Would you like to know more about any specific order or place a new one?`;

    return message;
  }

  /**
   * Build order cancellation message
   */
  private buildOrderCancellationMessage(order: any): string {
    return `❌ <b>Order Cancelled</b>

📋 <b>Order #${order.id}</b> has been successfully cancelled.

If you change your mind, you can always place a new order! Is there anything else I can help you with?`;
  }

  /**
   * Extract order ID from text (simple regex pattern)
   */
  private extractOrderIdFromText(text: string): number | null {
    const match = text.match(/order\s*#?(\d+)/i);
    return match ? parseInt(match[1], 10) : null;
  }

  /**
   * Get status emoji for order status
   */
  private getStatusEmoji(status: string): string {
    switch (status.toLowerCase()) {
      case 'new':
        return '🆕';
      case 'pending':
        return '⏳';
      case 'confirmed':
        return '✅';
      case 'shipped':
        return '🚚';
      case 'delivered':
        return '📦';
      case 'cancelled':
        return '❌';
      default:
        return '📋';
    }
  }
}
