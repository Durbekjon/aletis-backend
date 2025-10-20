import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import type { Message } from '@prisma/client';

export interface AiResponse {
  text: string;
  intent?: string;
  orderData?: any;
  shouldFetchOrders?: boolean;
  images?: string[];
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
    const baseUrl = this.configService.get<string>('PUBLIC_BASE_URL') || '';

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
4. ALWAYS respond in the SAME language as the customer's message (Uzbek, Russian, or English)
5. Only sell products that are actually in stock
6. Be honest about availability - don't promise what you don't have
7. Use relevant emojis (such as 💵, 💳, 📦, 🛒, 📱) to highlight money, payment, or product details where appropriate, but keep them minimal and natural.

LANGUAGE DETECTION RULES:
- Detect the language of the customer's message automatically
- Respond in the EXACT same language as the customer wrote
- If customer writes in Uzbek → respond in Uzbek
- If customer writes in Russian → respond in Russian  
- If customer writes in English → respond in English
- If language cannot be detected, default to Uzbek
- Do NOT ask about language preference - detect and match automatically
- Keep the same tone (formal/casual) as the customer's message

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

PRODUCT IMAGE RULES:
- The server base URL for building absolute image URLs is: ${baseUrl}
- Product data may include image keys like "public/uploads/filename.jpg"
- When you need to return image URLs, construct absolute URLs by prefixing with the base URL if they are relative

PRODUCT ANSWER FORMAT (for product inquiries ONLY):
- Detect language automatically and respond in that language
- Return STRICT JSON (no markdown), with shape:
{
  "text": "Your reply in customer's language",
  "images": ["https://.../public/uploads/one.jpg", "https://.../public/uploads/two.jpg"]
}
- If no images are available, return only the "text" field
- Do NOT use markdown image syntax; only clean URLs

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

3. When customer wants to cancel an order, use:
[INTENT:CANCEL_ORDER]
{
  "orderId": "extracted order number or null if not specified"
}

4. When an order is successfully created, use:
[INTENT:ORDER_CONFIRMATION]
{
  "orderId": "order ID number",
  "items": "array of product names and quantities",
  "phoneNumber": "customer phone number",
  "notes": "delivery address, payment method, etc."
}

ORDER CONFIRMATION RULES:
When an order is successfully created, generate a confirmation message in the SAME language the customer used:

✅ Order confirmed successfully!

📋 Order #{{order.id}}
🛍️ Items: {{product names and quantities}}
📞 Contact: {{customer phone number}}
📝 Notes: {{notes (delivery address, payment method, etc.)}}

We'll contact you soon with more details.
Is there anything else I can help you with?

LANGUAGE LOCALIZATION EXAMPLES:

Uzbek:
Buyurtma muvaffaqiyatli tasdiqlandi ✅
📋 Buyurtma raqami: #{{order.id}}
🛍️ Mahsulotlar: {{product names and quantities}}
📞 Aloqa: {{customer phone number}}
📝 Izoh: {{notes}}
Tez orada siz bilan bog'lanamiz 😊
Yana nimadir kerakmi?

Russian:
Заказ успешно подтверждён ✅
📋 Номер заказа: #{{order.id}}
🛍️ Товары: {{product names and quantities}}
📞 Контакт: {{customer phone number}}
📝 Примечание: {{notes}}
Мы свяжемся с вами в ближайшее время!
Хотите что-нибудь ещё?

English:
Order confirmed successfully ✅
📋 Order #{{order.id}}
🛍️ Items: {{product names and quantities}}
📞 Contact: {{customer phone number}}
📝 Notes: {{notes}}
We'll contact you soon with more details.
Is there anything else I can help you with?

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
    // First, try to parse strict JSON for product inquiry outputs
    const extractJson = (text: string): any | null => {
      try {
        // fenced block
        const fenced = text.match(/```json\s*([\s\S]*?)```/i);
        if (fenced) {
          return JSON.parse(fenced[1].trim());
        }
        // pure JSON
        if (text.trim().startsWith('{')) {
          return JSON.parse(text.trim());
        }
      } catch (_) {
        return null;
      }
      return null;
    };

    const json = extractJson(aiText);
    if (json && typeof json.text === 'string') {
      const images = Array.isArray(json.images)
        ? json.images.filter((u: any) => typeof u === 'string')
        : undefined;
      return { text: json.text, images };
    }
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

    // Look for cancel order intent marker
    const cancelOrderMatch = aiText.match(
      /\[INTENT:CANCEL_ORDER\]\s*(\{[\s\S]*?\})/,
    );
    if (cancelOrderMatch) {
      try {
        const orderData = JSON.parse(cancelOrderMatch[1]);
        const responseText = aiText
          .replace(/\[INTENT:CANCEL_ORDER\][\s\S]*/, '')
          .trim();

        return {
          text:
            responseText ||
            'I can help you cancel an order. Which order would you like to cancel?',
          intent: 'CANCEL_ORDER',
          orderData,
        };
      } catch (error) {
        this.logger.warn('Failed to parse cancel order data from AI response');
      }
    }

    return {
      text: aiText,
    };
  }

  /**
   * Generate order confirmation message with automatic language detection
   */
  async generateOrderConfirmation(
    orderData: {
      orderId: number;
      items: string[];
      phoneNumber?: string;
      notes?: string;
    },
    customerMessage: string,
  ): Promise<string> {
    try {
      const model = this.genAI.getGenerativeModel({
        model: 'gemini-2.5-flash',
      });

      const prompt = `You are the Flovo AI assistant. Generate an order confirmation message in the SAME language as the customer's message.

CUSTOMER'S MESSAGE: "${customerMessage}"

ORDER DATA:
- Order ID: ${orderData.orderId}
- Items: ${orderData.items.join(', ')}
- Phone: ${orderData.phoneNumber || 'Not provided'}
- Notes: ${orderData.notes || 'None'}

INSTRUCTIONS:
1. Detect the language of the customer's message automatically
2. Generate a confirmation message in that EXACT same language
3. Use the format and examples provided below
4. Make it sound natural and friendly for that language

FORMAT TEMPLATE:
✅ [Order confirmed message in detected language]

📋 [Order number label]: #${orderData.orderId}
🛍️ [Items label]: ${orderData.items.join(', ')}
📞 [Contact label]: ${orderData.phoneNumber || 'Not provided'}
📝 [Notes label]: ${orderData.notes || 'None'}

[Follow-up message in detected language]
[Closing question in detected language]

LANGUAGE EXAMPLES:

Uzbek:
Buyurtma muvaffaqiyatli tasdiqlandi ✅
📋 Buyurtma raqami: #${orderData.orderId}
🛍️ Mahsulotlar: ${orderData.items.join(', ')}
📞 Aloqa: ${orderData.phoneNumber || 'Kiritilmagan'}
📝 Izoh: ${orderData.notes || "Yo'q"}
Tez orada siz bilan bog'lanamiz 😊
Yana nimadir kerakmi?

Russian:
Заказ успешно подтверждён ✅
📋 Номер заказа: #${orderData.orderId}
🛍️ Товары: ${orderData.items.join(', ')}
📞 Контакт: ${orderData.phoneNumber || 'Не указан'}
📝 Примечание: ${orderData.notes || 'Нет'}
Мы свяжемся с вами в ближайшее время!
Хотите что-нибудь ещё?

English:
Order confirmed successfully ✅
📋 Order #${orderData.orderId}
🛍️ Items: ${orderData.items.join(', ')}
📞 Contact: ${orderData.phoneNumber || 'Not provided'}
📝 Notes: ${orderData.notes || 'None'}
We'll contact you soon with more details.
Is there anything else I can help you with?

Generate the confirmation message now:`;

      const result = await model.generateContent(prompt);
      const response = await result.response;
      const confirmationMessage = response.text().trim();

      this.logger.log(
        `Order confirmation generated for order ${orderData.orderId}`,
      );
      return confirmationMessage;
    } catch (error) {
      this.logger.error(
        `Error generating order confirmation: ${error.message}`,
        error.stack,
      );

      // Fallback confirmation message in English
      return `Order confirmed successfully ✅

📋 Order #${orderData.orderId}
🛍️ Items: ${orderData.items.join(', ')}
📞 Contact: ${orderData.phoneNumber || 'Not provided'}
📝 Notes: ${orderData.notes || 'None'}

We'll contact you soon with more details.
Is there anything else I can help you with?`;
    }
  }
}
