import { Injectable, Logger } from '@nestjs/common';
import { OrdersService } from '@modules/orders/orders.service';
import { AiResponse, GeminiService } from '@core/gemini/gemini.service';
import { Customer, Order } from '@prisma/client';

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

  constructor(
    private readonly ordersService: OrdersService,
    private readonly geminiService: GeminiService,
  ) {}

  /**
   * Process AI response and execute corresponding order actions
   */
  async processAiResponse(
    aiResponse: AiResponse,
    customer: Customer,
    organizationId: number,
    originalUserMessage?: string,
  ): Promise<ProcessedAiResponse> {
    try {
      switch (aiResponse.intent) {
        case 'CREATE_ORDER':
          return await this.handleCreateOrderIntent(
            aiResponse,
            customer,
            organizationId,
            originalUserMessage,
          );

        case 'FETCH_ORDERS':
          return await this.handleFetchOrdersIntent(
            aiResponse,
            customer,
            organizationId,
            originalUserMessage,
          );

        case 'CANCEL_ORDER':
          return await this.handleCancelOrderIntent(
            aiResponse,
            customer,
            organizationId,
            originalUserMessage,
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
        text:
          aiResponse.text ||
          "I'm sorry, I encountered an error processing your request. Please try again.",
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
    originalUserMessage?: string,
  ): Promise<ProcessedAiResponse> {
    if (!aiResponse.orderData) {
      this.logger.warn(
        'CREATE_ORDER intent received but no order data provided',
      );
      return {
        text:
          aiResponse.text ||
          "I'd be happy to help you place an order! Could you please tell me what you'd like to order?",
      };
    }

    try {
      this.logger.log(
        `Creating order with data: ${JSON.stringify(aiResponse.orderData)}`,
      );
      const order = await this.ordersService.createFromAIResponse(
        aiResponse.orderData,
        customer,
        organizationId,
      );
      this.logger.log(`Order created successfully: ${order.id}`);

      // Convert items to product names for confirmation message
      let itemNames: string[] = [];
      this.logger.log(
        `Order details items: ${JSON.stringify(order.details?.items)}`,
      );
      this.logger.log(`Order orderItems: ${JSON.stringify(order.orderItems)}`);

      // Use the new OrderItem structure
      if (order.orderItems && Array.isArray(order.orderItems)) {
        itemNames = order.orderItems.map((orderItem: any) => {
          const productName = orderItem.product?.name || 'Unknown Product';
          const quantity = orderItem.quantity || 1;
          return `${productName} (${quantity} qty)`;
        });
        this.logger.log(
          `Using orderItems product names: ${itemNames.join(', ')}`,
        );
      } else if (Array.isArray(order.details?.items)) {
        // Fallback to old structure if orderItems not available
        if (
          order.details.items.length > 0 &&
          typeof order.details.items[0] === 'object'
        ) {
          itemNames = order.details.items.map(
            (item: any) =>
              `Product ID ${item.productId} (${item.quantity} qty)`,
          );
          this.logger.log(
            `Using fallback product names: ${itemNames.join(', ')}`,
          );
        } else {
          itemNames = order.details.items;
          this.logger.log(`Using items as strings: ${itemNames.join(', ')}`);
        }
      } else if (order.details?.items) {
        itemNames = [order.details.items];
        this.logger.log(`Using single item: ${itemNames.join(', ')}`);
      } else {
        itemNames = ['To be specified'];
        this.logger.log(`Using default item name: ${itemNames.join(', ')}`);
      }

      // Generate confirmation message using Gemini with automatic language detection
      const confirmationMessage =
        await this.geminiService.generateOrderConfirmation(
          {
            orderId: order.id,
            items: itemNames,
            phoneNumber: order.details?.phoneNumber,
            notes: order.details?.notes,
            totalPrice: order.totalPrice,
            currency: 'USD', // Default currency, can be enhanced to get from products
          },
          originalUserMessage || '',
        );

      this.logger.log(
        `Order created via AI: ${order.id} for customer: ${customer.id}`,
      );

      return {
        text: confirmationMessage,
        orderCreated: true,
        orderId: order.id,
      };
    } catch (error) {
      this.logger.error(
        `Failed to create order via AI: ${error.message}`,
        error.stack,
      );

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
    originalUserMessage?: string,
  ): Promise<ProcessedAiResponse> {
    try {
      const orders = await this.ordersService.getOrdersForCustomer(
        customer.id,
        organizationId,
        5, // Last 5 orders
      );

      // Generate AI response for orders list in customer's language
      const ordersMessage = await this.geminiService.generateOrdersListResponse(
        orders,
        originalUserMessage || 'Show my orders',
      );

      this.logger.log(`Orders fetched via AI for customer: ${customer.id}`);

      return {
        text: ordersMessage,
        ordersFetched: true,
      };
    } catch (error) {
      this.logger.error(
        `Failed to fetch orders via AI: ${error.message}`,
        error.stack,
      );

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
    originalUserMessage?: string,
  ): Promise<ProcessedAiResponse> {
    // Extract order ID from the AI response or order data
    const orderId =
      aiResponse.orderData?.orderId ||
      this.extractOrderIdFromText(aiResponse.text);

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

      // Generate AI response for order cancellation in customer's language
      const cancellationMessage =
        await this.geminiService.generateOrderCancellationResponse(
          order,
          originalUserMessage || 'Cancel my order',
        );

      this.logger.log(
        `Order cancelled via AI: ${order.id} for customer: ${customer.id}`,
      );

      return {
        text: cancellationMessage,
        orderCancelled: true,
        orderId: order.id,
      };
    } catch (error) {
      this.logger.error(
        `Failed to cancel order via AI: ${error.message}`,
        error.stack,
      );

      let errorMessage: string;

      if (error.message.includes('not found')) {
        errorMessage =
          "I couldn't find that order. Please check the order number and try again.";
      } else if (error.message.includes('Cannot cancel')) {
        errorMessage =
          "I'm sorry, but that order cannot be cancelled at this time. Please contact our support team for assistance.";
      } else {
        errorMessage =
          "I'm sorry, I couldn't cancel your order right now. Please try again or contact our support team.";
      }

      return {
        text: errorMessage,
      };
    }
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
