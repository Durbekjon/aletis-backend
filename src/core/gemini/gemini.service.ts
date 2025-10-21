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
- Always quote the EXACT listed price from inventory WITH currency (e.g., "12 USD", "120,000 UZS")
- Use the product's currency field - if not available, default to "USD"
- NEVER lower prices, offer discounts, or negotiate prices
- If customer asks for discount, respond naturally: "I understand you're looking for a good deal! Unfortunately, our prices are fixed to ensure quality and fair service for everyone."
- Never suggest price reductions or special deals
- Always include currency when mentioning prices: "This product costs 12 USD" or "Bu mahsulot 120,000 UZS"
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

IMPORTANT: When customers want to order products, use the exact Product ID (numeric) from the inventory list above, NOT the product name. For example, if a product shows "Product ID: 123 | Name: Laptop", use productId: 123, not "Laptop".

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

ORDER CREATION PROCESS:
When a customer wants to place an order, follow these steps:

1. FIRST: Respond naturally to the customer with confirmation (e.g., "Great! I'll process your order...")
2. THEN: Add the order data in this EXACT format at the end of your response:

[INTENT:CREATE_ORDER]
{
  "customerName": "extracted name or 'Not provided'",
  "customerContact": "phone/email if provided or 'Not provided'", 
  "items": [
    {
      "productId": "MUST be the exact numeric product ID from inventory (integer, not product name)",
      "quantity": "number of items (integer)",
      "price": "price per unit from inventory (number)"
    }
  ],
  "notes": "any special requests or details"
}

CRITICAL RULES:
- Use exact numeric product ID from inventory, NOT product name
- The [INTENT:CREATE_ORDER] section will be automatically removed before sending to customer
- Only the natural response text will be shown to the customer
- The order data will be processed by the system automatically
- DO NOT include order confirmation messages (like "Buyurtma muvaffaqiyatli tasdiqlandi") in your response
- The system will generate the confirmation message automatically after processing the order

2. When customer asks about their orders, use:
[INTENT:FETCH_ORDERS]

3. When customer wants to cancel an order, use:
[INTENT:CANCEL_ORDER]
{
  "orderId": "extracted order number or null if not specified"
}


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
    // Look for order creation intent marker - handle multiline JSON
    let orderMatch = aiText.match(/\[INTENT:CREATE_ORDER\]\s*(\{[\s\S]*?\})/);

    // If first regex doesn't work, try a more flexible approach
    if (!orderMatch) {
      const intentIndex = aiText.indexOf('[INTENT:CREATE_ORDER]');
      if (intentIndex !== -1) {
        const afterIntent = aiText.substring(intentIndex);
        const jsonStart = afterIntent.indexOf('{');
        if (jsonStart !== -1) {
          const jsonPart = afterIntent.substring(jsonStart);
          // Find the matching closing brace
          let braceCount = 0;
          let jsonEnd = -1;
          for (let i = 0; i < jsonPart.length; i++) {
            if (jsonPart[i] === '{') braceCount++;
            if (jsonPart[i] === '}') braceCount--;
            if (braceCount === 0) {
              jsonEnd = i;
              break;
            }
          }
          if (jsonEnd !== -1) {
            const jsonString = jsonPart.substring(0, jsonEnd + 1);
            orderMatch = ['', jsonString]; // Mock the match array
          }
        }
      }
    }

    // If still no match, try to find and complete incomplete JSON
    if (!orderMatch) {
      const intentIndex = aiText.indexOf('[INTENT:CREATE_ORDER]');
      if (intentIndex !== -1) {
        const afterIntent = aiText.substring(intentIndex);
        const jsonStart = afterIntent.indexOf('{');
        if (jsonStart !== -1) {
          const jsonPart = afterIntent.substring(jsonStart);
          // Try to complete the JSON by adding missing closing brackets/braces
          let completedJson = jsonPart;

          // Count braces and brackets to see what's missing
          let braceCount = 0;
          let bracketCount = 0;
          for (let i = 0; i < jsonPart.length; i++) {
            if (jsonPart[i] === '{') braceCount++;
            if (jsonPart[i] === '}') braceCount--;
            if (jsonPart[i] === '[') bracketCount++;
            if (jsonPart[i] === ']') bracketCount--;
          }

          // Add missing closing brackets first, then braces
          while (bracketCount > 0) {
            completedJson += ']';
            bracketCount--;
          }
          while (braceCount > 0) {
            completedJson += '}';
            braceCount--;
          }

          this.logger.log(
            `Attempting to complete incomplete JSON. Original: "${jsonPart}"`,
          );
          this.logger.log(`Completed JSON: "${completedJson}"`);

          orderMatch = ['', completedJson];
        }
      }
    }

    if (orderMatch) {
      try {
        this.logger.log(
          `Found CREATE_ORDER intent, JSON string: "${orderMatch[1]}"`,
        );
        const orderData = JSON.parse(orderMatch[1]);
        this.logger.log(
          `Successfully parsed order data: ${JSON.stringify(orderData)}`,
        );

        // Extract only the text BEFORE the intent marker
        const responseText = aiText.split(/\[INTENT:CREATE_ORDER\]/)[0].trim();

        // Remove any order confirmation messages that might be in the response
        const cleanedText = responseText
          .replace(/Buyurtma muvaffaqiyatli tasdiqlandi.*$/s, '')
          .replace(/Order confirmed successfully.*$/s, '')
          .replace(/Заказ успешно подтверждён.*$/s, '')
          .replace(/📋 Buyurtma raqami.*$/s, '')
          .replace(/📋 Order #.*$/s, '')
          .replace(/📋 Номер заказа.*$/s, '')
          .replace(/🛍️ Mahsulotlar.*$/s, '')
          .replace(/🛍️ Items.*$/s, '')
          .replace(/🛍️ Товары.*$/s, '')
          .replace(/💰 Jami.*$/s, '')
          .replace(/💰 Total.*$/s, '')
          .replace(/💰 Итого.*$/s, '')
          .replace(/📞 Aloqa.*$/s, '')
          .replace(/📞 Contact.*$/s, '')
          .replace(/📞 Контакт.*$/s, '')
          .replace(/📝 Izoh.*$/s, '')
          .replace(/📝 Notes.*$/s, '')
          .replace(/📝 Примечание.*$/s, '')
          .replace(/Tez orada siz bilan bog'lanamiz.*$/s, '')
          .replace(/We'll contact you soon.*$/s, '')
          .replace(/Мы свяжемся с вами.*$/s, '')
          .replace(/Yana nimadir kerakmi\?.*$/s, '')
          .replace(/Is there anything else.*$/s, '')
          .replace(/Хотите что-нибудь ещё\?.*$/s, '')
          .replace(/Ha, albatta!.*$/s, '')
          .replace(/Hammasi joyida!.*$/s, '')
          .replace(/rasmiylashtirildi.*$/s, '')
          .trim();

        this.logger.log(`Cleaned response text: "${cleanedText}"`);
        this.logger.log(`Order data: ${JSON.stringify(orderData)}`);

        return {
          text:
            cleanedText ||
            "Great! I've got your order down. What's your name and phone number so we can get in touch with you?",
          intent: 'CREATE_ORDER',
          orderData,
        };
      } catch (error) {
        this.logger.warn(
          `Failed to parse order data from AI response: ${error.message}`,
        );
        this.logger.warn(`Raw JSON string: "${orderMatch[1]}"`);

        // Even if parsing fails, we should still try to create an order with default data
        // Extract basic info from the incomplete JSON
        const jsonString = orderMatch[1];
        const customerContactMatch = jsonString.match(
          /"customerContact":\s*"([^"]+)"/,
        );
        const productIdMatch = jsonString.match(/"productId":\s*(\d+)/);
        const quantityMatch = jsonString.match(/"quantity":\s*(\d+)/);
        const priceMatch = jsonString.match(/"price":\s*(\d+)/);

        const orderData = {
          customerName: 'Not provided',
          customerContact: customerContactMatch
            ? customerContactMatch[1]
            : 'Not provided',
          items: [
            {
              productId: productIdMatch ? parseInt(productIdMatch[1]) : 1,
              quantity: quantityMatch ? parseInt(quantityMatch[1]) : 1,
              price: priceMatch ? parseInt(priceMatch[1]) : 1300,
            },
          ],
          notes: '',
        };

        this.logger.log(
          `Creating order with fallback data: ${JSON.stringify(orderData)}`,
        );

        // Extract only the text BEFORE the intent marker
        const responseText = aiText.split(/\[INTENT:CREATE_ORDER\]/)[0].trim();

        return {
          text: responseText || "Great! I'll process your order.",
          intent: 'CREATE_ORDER',
          orderData,
        };
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

    // Look for order confirmation intent marker (AI is incorrectly using this)
    const orderConfirmationMatch = aiText.match(
      /\[INTENT:ORDER_CONFIRMATION\]\s*(\{[\s\S]*?\})/,
    );
    if (orderConfirmationMatch) {
      try {
        const confirmationData = JSON.parse(orderConfirmationMatch[1]);

        // Convert ORDER_CONFIRMATION to CREATE_ORDER format
        const orderData = {
          customerName: 'Not provided',
          customerContact: confirmationData.phoneNumber || 'Not provided',
          items: Array.isArray(confirmationData.items)
            ? confirmationData.items.map((item: string) => {
                // Try to extract product info from item string like "LAPTOP (1 dona)"
                const match = item.match(/(\w+)\s*\((\d+)\s*dona?\)/);
                if (match) {
                  // For now, use default values - this should be improved to lookup actual product
                  return {
                    productId: 1, // TODO: Lookup actual product ID by name
                    quantity: parseInt(match[2]) || 1,
                    price: 1300, // TODO: Get actual price from product lookup
                  };
                }
                return {
                  productId: 1,
                  quantity: 1,
                  price: 1300,
                };
              })
            : [
                {
                  productId: 1,
                  quantity: 1,
                  price: 1300,
                },
              ],
          notes: confirmationData.notes || '',
        };

        // Extract only the text BEFORE the intent marker
        const responseText = aiText
          .split(/\[INTENT:ORDER_CONFIRMATION\]/)[0]
          .trim();

        this.logger.log(
          `Converted ORDER_CONFIRMATION to CREATE_ORDER: ${JSON.stringify(orderData)}`,
        );

        return {
          text: responseText || "Great! I'll process your order.",
          intent: 'CREATE_ORDER',
          orderData,
        };
      } catch (error) {
        this.logger.warn(
          'Failed to parse order confirmation data from AI response',
        );
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
      totalPrice?: number;
      currency?: string;
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
- Total Price: ${orderData.totalPrice || 'Not calculated'}
- Currency: ${orderData.currency || 'USD'}

INSTRUCTIONS:
1. Detect the language of the customer's message automatically
2. Generate a confirmation message in that EXACT same language
3. Use the format and examples provided below
4. Make it sound natural and friendly for that language

FORMAT TEMPLATE:
✅ [Order confirmed message in detected language]

📋 [Order number label]: #${orderData.orderId}
🛍️ [Items label]: ${orderData.items.join(', ')}
💰 [Total label]: ${orderData.totalPrice || 'Not calculated'} ${orderData.currency || 'USD'}
📞 [Contact label]: ${orderData.phoneNumber || 'Not provided'}
📝 [Notes label]: ${orderData.notes || 'None'}

[Follow-up message in detected language]
[Closing question in detected language]

LANGUAGE EXAMPLES:

Uzbek:
Buyurtma muvaffaqiyatli tasdiqlandi ✅
📋 Buyurtma raqami: #${orderData.orderId}
🛍️ Mahsulotlar: ${orderData.items.join(', ')}
💰 Jami: ${orderData.totalPrice || 'Hisoblanmagan'} ${orderData.currency || 'USD'}
📞 Aloqa: ${orderData.phoneNumber || 'Kiritilmagan'}
📝 Izoh: ${orderData.notes || "Yo'q"}
Tez orada siz bilan bog'lanamiz 😊
Yana nimadir kerakmi?

Russian:
Заказ успешно подтверждён ✅
📋 Номер заказа: #${orderData.orderId}
🛍️ Товары: ${orderData.items.join(', ')}
💰 Итого: ${orderData.totalPrice || 'Не рассчитано'} ${orderData.currency || 'USD'}
📞 Контакт: ${orderData.phoneNumber || 'Не указан'}
📝 Примечание: ${orderData.notes || 'Нет'}
Мы свяжемся с вами в ближайшее время!
Хотите что-нибудь ещё?

English:
Order confirmed successfully ✅
📋 Order #${orderData.orderId}
🛍️ Items: ${orderData.items.join(', ')}
💰 Total: ${orderData.totalPrice || 'Not calculated'} ${orderData.currency || 'USD'}
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

  /**
   * Detect the language of a given text
   */
  async detectLanguage(text: string): Promise<string> {
    try {
      const model = this.genAI.getGenerativeModel({
        model: 'gemini-1.5-flash',
      });

      const prompt = `Detect the language of the following text and return only the language code (uz, ru, en):

Text: "${text}"

Return only the language code:`;

      const result = await model.generateContent(prompt);
      const response = await result.response;
      const languageCode = response.text().trim().toLowerCase();

      // Validate and return supported language codes
      if (['uz', 'ru', 'en'].includes(languageCode)) {
        return languageCode;
      }

      // Default to Uzbek if detection fails
      return 'uz';
    } catch (error) {
      this.logger.warn(`Language detection failed: ${error.message}`);
      return 'uz'; // Default to Uzbek
    }
  }

  /**
   * Translate a message to the specified language
   */
  async translateMessage(
    message: string,
    targetLanguage: string,
  ): Promise<string> {
    try {
      // If target language is English, return as is
      if (targetLanguage === 'en') {
        return message;
      }

      const model = this.genAI.getGenerativeModel({
        model: 'gemini-1.5-flash',
      });

      const languageNames: Record<string, string> = {
        uz: 'Uzbek',
        ru: 'Russian',
        en: 'English',
      };

      const prompt = `Translate the following message to ${languageNames[targetLanguage] || 'Uzbek'}. Keep the HTML formatting and emojis intact:

${message}

Translated message:`;

      const result = await model.generateContent(prompt);
      const response = await result.response;
      return response.text().trim();
    } catch (error) {
      this.logger.warn(`Translation failed: ${error.message}`);
      return message; // Return original message if translation fails
    }
  }

  /**
   * Generate orders list response in customer's language
   */
  async generateOrdersListResponse(
    orders: any[],
    userMessage: string,
  ): Promise<string> {
    try {
      const model = this.genAI.getGenerativeModel({
        model: 'gemini-1.5-flash',
      });

      const ordersData = orders.map((order, index) => {
        const status = this.getStatusEmoji(order.status);
        const items = order.items || 'No items specified';
        const createdAt = new Date(order.createdAt).toLocaleDateString();
        return {
          number: index + 1,
          id: order.id,
          status,
          date: createdAt,
          items,
          totalPrice: order.totalPrice || 0,
        };
      });

      const prompt = `You are Flovo, a friendly AI assistant. The customer asked: "${userMessage}"

CUSTOMER ORDERS DATA:
${JSON.stringify(ordersData, null, 2)}

INSTRUCTIONS:
1. Respond in the EXACT same language as the customer's message
2. If customer wrote in Uzbek → respond in Uzbek
3. If customer wrote in Russian → respond in Russian  
4. If customer wrote in English → respond in English
5. If no orders exist, say "You don't have any orders yet" in their language
6. If orders exist, list them nicely with emojis
7. Keep the same tone (formal/casual) as the customer's message
8. Use appropriate emojis for orders, dates, items, prices
9. End with a helpful question about what they'd like to do next

Generate a natural, friendly response:`;

      const result = await model.generateContent(prompt);
      const response = await result.response;
      return response.text().trim();
    } catch (error) {
      this.logger.warn(
        `Failed to generate orders list response: ${error.message}`,
      );

      // Fallback to simple response
      if (orders.length === 0) {
        return "You don't have any orders yet. Would you like to place your first order?";
      }

      let message = 'Your Recent Orders:\n\n';
      orders.forEach((order, index) => {
        const status = this.getStatusEmoji(order.status);
        const items = order.items || 'No items specified';
        const createdAt = new Date(order.createdAt).toLocaleDateString();
        message += `${index + 1}. ${status} Order #${order.id}\n`;
        message += `   📅 ${createdAt}\n`;
        message += `   🛍️ ${items}\n`;
        message += `   💰 $${order.totalPrice || 0}\n\n`;
      });
      message +=
        'Would you like to know more about any specific order or place a new one?';
      return message;
    }
  }

  /**
   * Generate order cancellation response in customer's language
   */
  async generateOrderCancellationResponse(
    order: any,
    userMessage: string,
  ): Promise<string> {
    try {
      const model = this.genAI.getGenerativeModel({
        model: 'gemini-1.5-flash',
      });

      const prompt = `You are Flovo, a friendly AI assistant. The customer asked: "${userMessage}"

ORDER CANCELLED:
- Order ID: ${order.id}
- Status: ${order.status}
- Total: $${order.totalPrice || 0}

INSTRUCTIONS:
1. Respond in the EXACT same language as the customer's message
2. If customer wrote in Uzbek → respond in Uzbek
3. If customer wrote in Russian → respond in Russian  
4. If customer wrote in English → respond in English
5. Confirm the order has been cancelled
6. Be friendly and helpful
7. Use appropriate emojis
8. Ask if they need help with anything else

Generate a natural, friendly response:`;

      const result = await model.generateContent(prompt);
      const response = await result.response;
      return response.text().trim();
    } catch (error) {
      this.logger.warn(
        `Failed to generate cancellation response: ${error.message}`,
      );

      // Fallback response
      return `❌ Order Cancelled

📋 Order #${order.id} has been successfully cancelled.

If you change your mind, you can always place a new order! Is there anything else I can help you with?`;
    }
  }

  /**
   * Get status emoji for order status
   */
  private getStatusEmoji(status: string): string {
    const statusEmojis: Record<string, string> = {
      NEW: '🆕',
      PENDING: '⏳',
      CONFIRMED: '✅',
      SHIPPED: '🚚',
      DELIVERED: '📦',
      CANCELLED: '❌',
      REFUNDED: '💰',
    };
    return statusEmojis[status] || '📋';
  }
}
