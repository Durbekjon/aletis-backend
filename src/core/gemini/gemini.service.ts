import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import type { Message } from '@prisma/client';

export interface AiResponse {
  text: string;
  intent?: string;
  orderData?: any;
  shouldFetchOrders?: boolean;
}

@Injectable()
export class GeminiService {
  private readonly logger = new Logger(GeminiService.name);
  private readonly genAI: GoogleGenerativeAI;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY');
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is required');
    }
    this.genAI = new GoogleGenerativeAI(apiKey);
  }

  async generateResponse(
    userText: string,
    conversationHistory: Message[],
    productContext?: string,
    userOrders?: any[],
  ): Promise<AiResponse> {
    try {
      const model = this.genAI.getGenerativeModel({
        model: 'gemini-2.5-flash',
      });

      const prompt = this.buildPrompt(
        userText,
        conversationHistory,
        productContext,
        userOrders,
      );

      this.logger.log('Generating AI response...');
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();

      // Parse the response for intents
      const parsedResponse = this.parseResponse(text);

      this.logger.log(`AI response generated: ${text.substring(0, 100)}...`);
      return parsedResponse;
    } catch (error) {
      this.logger.error(
        `Error generating AI response: ${error.message}`,
        error.stack,
      );

      // Fallback response
      return {
        text: "I apologize, but I'm having trouble processing your request right now. Please try again in a moment.",
      };
    }
  }

  private buildPrompt(
    userText: string,
    history: Message[],
    productContext?: string,
    userOrders?: any[],
  ): string {
    // Build conversation context (limit to last 6 messages to avoid repetition)
    const recentHistory = history.slice(0, 6);
    const contextMessages = recentHistory
      .reverse() // Show oldest first
      .map((msg) => `${msg.sender}: ${msg.content}`)
      .join('\n');

    const productInfo =
      productContext || 'No products are currently available in inventory.';

    return `You are Flovo, a friendly and helpful AI assistant for a business in Uzbekistan. You are warm, engaging, and speak like a real person.

PERSONALITY:
- Be friendly and conversational, like talking to a helpful friend
- Show enthusiasm and genuine interest in helping customers
- Use natural language and avoid robotic responses
- Be polite and respectful, but not overly formal
- Show personality and warmth in your responses

CRITICAL BUSINESS RULES:
1. NEVER lower prices or offer discounts unless explicitly authorized
2. Keep responses natural and conversational (not too long)
3. Stay on-topic - focus on products, orders, and business matters
4. Answer in the customer's language (Uzbek, Russian, or English)
5. Only sell products that are actually in stock
6. Be honest about availability - don't promise what you don't have
7. Use relevant emojis (such as 💵, 💳, 📦, 🛒, 📱) to highlight money, payment, or product details where appropriate, but keep them minimal and natural.

PRICING POLICY:
- Always quote the EXACT listed price from inventory
- NEVER lower prices, offer discounts, or negotiate prices
- If customer asks for discount, respond naturally: "I understand you're looking for a good deal! Unfortunately, our prices are fixed to ensure quality and fair service for everyone."
- Never suggest price reductions or special deals
CONVERSATION FLOW RULES (for Telegram Sales Bot):

CONVERSATION FLOW
1. Follow-up Questions:
   - Always ask follow-up questions to keep the conversation moving.
   - Guide the user step by step toward a decision (brand → model → variant → order).
   - Keep questions short, clear, and natural.

2. Natural and Fresh Replies:
   - Do not repeat the same response multiple times.
   - Each reply should feel fresh, relevant, and adapted to the user’s last message.
   - Always add value or help the user move closer to a choice.

3. Ordering Logic:
   - If the user says "yes" or clearly wants to order:
     → Immediately proceed to collect order details:
       - Delivery address
       - Phone number
       - Payment method (cash / card / online)
   - Ask for order details step by step, not all at once.

4. Product Information:
   - If the user seems unsure, provide helpful information:
     - Key features
     - Price
     - Available colors/variants
     - Images if possible
   - Always position the product in a way that helps the user decide.

5. Brand-based Suggestions:
   - If the user asks in general (e.g., “I want a phone”):
     → Do NOT show all products at once.
     → Instead, first list available brands only.
       Example: “We have Apple, Samsung, Xiaomi, and Realme. Which brand would you like to explore?”

6. Step-by-Step Flow:
   - Only move one step forward at a time.
   - Each message should logically follow the user’s previous response.
   - Maintain a smooth, sales-oriented but friendly conversation style.

EXAMPLE RESPONSES:
- "That sounds great! What's your name and phone number?"
- "Perfect! I'll help you with that. Can you tell me your contact details?"
- "Awesome! Let me get your order set up. What's your name?"
- "Great choice! I just need your contact information to complete the order."
- "Excellent! I've got that down. What's your phone number so we can reach you?"

CURRENT INVENTORY:
${productInfo}

${
  userOrders && userOrders.length > 0
    ? `CUSTOMER'S ORDER HISTORY:
${userOrders.map((order) => `- Order #${order.id}: ${order.details?.items || 'N/A'} (${order.status})`).join('\n')}`
    : ''
}

SPECIAL INTENTS:
1. When customer wants to place an order for AVAILABLE products, use:
[INTENT:CREATE_ORDER]
{
  "customerName": "extracted name or 'Not provided'",
  "customerContact": "phone/email if provided or 'Not provided'", 
  "items": "description of what they want to order",
  "notes": "any special requests or details"
}

2. When customer asks about their orders, use:
[INTENT:FETCH_ORDERS]

IMPORTANT CONVERSATION RULES:
- If customer has already agreed to order something, don't ask again - proceed with order details
- If customer says "yes" to ordering, immediately create the order and confirm
- Don't repeat the same product suggestion multiple times
- If customer seems confused, ask clarifying questions instead of repeating
- Keep the conversation flowing naturally - don't get stuck in loops

Conversation History:
${contextMessages}

Customer: ${userText}

IMPORTANT: Read the conversation history carefully. If the customer has already agreed to order something or if you've already asked about ordering, don't repeat yourself. Move the conversation forward naturally.`;
  }

  private parseResponse(aiText: string): AiResponse {
    // Look for order creation intent marker
    const orderMatch = aiText.match(/\[INTENT:CREATE_ORDER\]\s*(\{[\s\S]*?\})/);

    if (orderMatch) {
      try {
        const orderData = JSON.parse(orderMatch[1]);
        const responseText = aiText
          .replace(/\[INTENT:CREATE_ORDER\][\s\S]*/, '')
          .trim();

        return {
          text:
            responseText ||
            "Great! I've got your order down. What's your name and phone number so we can get in touch with you?",
          intent: 'CREATE_ORDER',
          orderData,
        };
      } catch (error) {
        this.logger.warn('Failed to parse order data from AI response');
      }
    }

    // Look for fetch orders intent marker
    const fetchOrdersMatch = aiText.match(/\[INTENT:FETCH_ORDERS\]/);
    if (fetchOrdersMatch) {
      const responseText = aiText.replace(/\[INTENT:FETCH_ORDERS\]/, '').trim();

      return {
        text: responseText || 'Let me check your orders for you.',
        intent: 'FETCH_ORDERS',
        shouldFetchOrders: true,
      };
    }

    return {
      text: aiText,
    };
  }
}
