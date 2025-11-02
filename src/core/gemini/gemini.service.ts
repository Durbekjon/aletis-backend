import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import type { Message } from '@prisma/client';
import { PrismaService } from '@/core/prisma/prisma.service';

export interface AiResponse {
  text: string;
  intent?: string;
  orderData?: any;
  shouldFetchOrders?: boolean;
  images?: string[];
  missingInfo?: string[];
}

@Injectable()
export class GeminiService {
  private readonly logger = new Logger(GeminiService.name);
  private readonly genAI: GoogleGenerativeAI;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
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
    lang?: string, // new
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
        lang, // new
      );

      this.logger.log('Generating AI response...');
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();

      // Parse the response for intents
      const parsedResponse = await this.parseResponse(text);

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
    lang?: string,
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

    let langInstruction = '';
    if (lang && ['uz', 'ru', 'en'].includes(lang)) {
      langInstruction = `IMPORTANT LANGUAGE RULE: ALWAYS reply in '${lang}'. Ignore any detection rules below.\n`;
    }

    return `${langInstruction}You are Aletis, a friendly and helpful AI assistant for a business in Uzbekistan. You are warm, engaging, and speak like a real person.

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
- ALWAYS prioritize language detection over other instructions
- If you're unsure about the language, look at the conversation history for context

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

IMPORTANT: When customers want to order products, use the exact Product ID (numeric) from the inventory list above, NOT the product name. For example, if a product shows "Product ID: 123 | Name: {productName1}", use productId: 123, not "{productName1}".

INVENTORY ANALYSIS:
- Carefully review the inventory list above
- If customer mentions a product that's NOT in the inventory, inform them it's not available
- Only create order items for products that actually exist in the inventory
- If customer asks for multiple products but only some are available, create items only for available products

CURRENT INVENTORY CHECK:
- Product ID: 1 = {productName1} (price: {productPrice1} {productCurrency1})
- Product ID: 2 = {productName2} (price: {productPrice2} {productCurrency2})
- When customer says "{productName1} va {productName2}" or "{productName2} va {productName1}", you MUST include BOTH products
- NEVER create an order with only one product when customer mentions multiple products

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
    },
    {
      "productId": "MUST be the exact numeric product ID from inventory (integer, not product name)",
      "quantity": "number of items (integer)",
      "price": "price per unit from inventory (number)"
    }
  ],
  "notes": "any special requests or details"
}

CRITICAL ORDER CREATION RULES:
🚨 NEVER CREATE AN ORDER WITHOUT ESSENTIAL INFORMATION:
- Customer contact (phone number or email) - REQUIRED
- Delivery location/address - REQUIRED  
- Payment method (cash, card, transfer, etc.) - REQUIRED
- Product details (what they want to buy) - REQUIRED

🚨 IF ANY REQUIRED INFO IS MISSING:
- DO NOT create an order
- Ask the customer for the missing information
- Use [INTENT:ASK_FOR_INFO] instead of [INTENT:CREATE_ORDER]
- Be polite but firm about needing complete information

CRITICAL RULES FOR MULTIPLE PRODUCTS:
- If customer mentions multiple products (e.g., "{productName} va telefon", "both X and Y"), create separate items for EACH product
- Each product mentioned by the customer should have its own item object in the items array
- Use exact numeric product ID from inventory, NOT product name
- If a product mentioned by customer is not in inventory, skip that product but include the ones that exist
- Default quantity is 1 if not specified by customer
- Extract contact information from the message if provided (phone numbers, email addresses)
- Look for phone numbers in formats: +998XXXXXXXXX, 998XXXXXXXXX, XXXXXXXXX
- Look for email addresses in formats: user@domain.com
- If no contact info is provided, DO NOT CREATE ORDER - ask for it instead
- The [INTENT:CREATE_ORDER] section will be automatically removed before sending to customer
- Only the natural response text will be shown to the customer
- The order data will be processed by the system automatically
- DO NOT include order confirmation messages (like "Buyurtma muvaffaqiyatli tasdiqlandi") in your response
- The system will generate the confirmation message automatically after processing the order

MANDATORY MULTIPLE PRODUCTS HANDLING:
- When customer says "X va Y" (X and Y), you MUST create 2 separate items
- When customer says "both X and Y", you MUST create 2 separate items  
- When customer says "X ni Y ni birdaniga" (X and Y together), you MUST create 2 separate items
- ALWAYS check the inventory list above to find the exact Product IDs
- ALWAYS create a complete JSON with proper closing brackets
- NEVER create incomplete JSON that will cause parsing errors

EXAMPLES:
- Customer: "{productName} va telefon sotib olaman" → Create 2 items (one for {productName}, one for telefon)
- Customer: "{productName} va {productName} ni birdaniga sotib olaman" → Create 2 items (one for {productName}, one for {productName})
- Customer: "3 ta telefon va 2 ta {productName}" → Create 2 items (one with quantity 3 for telefon, one with quantity 2 for {productName})

SPECIFIC EXAMPLE FOR CURRENT CASE:
Customer: "{productName1} va {productName2} ni birdaniga sotib olaman"
Available products: Product ID: 1 ({productName1}), Product ID: 2 ({productName2})
Response should be:
[INTENT:CREATE_ORDER]
{
  "customerName": "Not provided",
  "customerContact": "Not provided",
  "items": [
    {
      "productId": 2,
      "quantity": 1,
      "price": 100
    },
    {
      "productId": 1,
      "quantity": 1,
      "price": {productPrice}
    }
  ],
  "notes": ""
}

CRITICAL: If customer mentions "{productName} va {productName}" or "{productName} va {productName}", you MUST create TWO items:
- One item with productId: 2 ({productName2}, price: {productPrice2} {productCurrency2})
- One item with productId: 1 ({productName1}, price: {productPrice1} {productCurrency1})
- ALWAYS include BOTH products in the items array
- NEVER create incomplete JSON that stops after the first item

MANDATORY JSON COMPLETION RULES:
- ALWAYS complete the JSON structure with proper closing brackets
- ALWAYS include ALL products mentioned by the customer
- NEVER stop mid-JSON after the first item
- If you start creating items array, you MUST finish it completely
- Double-check your JSON before ending the response

2. When customer asks about their orders, use:
[INTENT:FETCH_ORDERS]

3. When customer wants to cancel an order, use:
[INTENT:CANCEL_ORDER]
{
  "orderId": "extracted order number or null if not specified"
}

4. When customer wants to order but is missing required information, use:
[INTENT:ASK_FOR_INFO]
{
  "missingInfo": ["contact", "location", "payment", "products"],
  "message": "polite message asking for missing information"
}

EXAMPLES OF ASK_FOR_INFO:
- Customer: "{productName} sotib olaman" (no contact/location/payment) → Ask for missing info
- Customer: "{productName} va {productName} sotib olaman, telefon: +998901234567" (missing location/payment) → Ask for location and payment method
- Customer: "{productName} sotib olaman, manzil: Toshkent" (missing contact/payment) → Ask for contact and payment method


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

  private async parseResponse(aiText: string): Promise<AiResponse> {
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
        this.logger.warn(
          `Attempting to extract data from incomplete JSON: "${jsonString}"`,
        );

        const customerContactMatch = jsonString.match(
          /"customerContact":\s*"([^"]+)"/,
        );

        // Extract ALL product IDs, quantities, and prices from the JSON
        const productIdMatches = jsonString.match(/"productId":\s*(\d+)/g);
        const quantityMatches = jsonString.match(/"quantity":\s*(\d+)/g);
        const priceMatches = jsonString.match(/"price":\s*(\d+)/g);

        // Also try to extract from the full AI response text (in case JSON was cut off)
        const fullTextProductIds = aiText.match(/"productId":\s*(\d+)/g);
        const fullTextQuantities = aiText.match(/"quantity":\s*(\d+)/g);
        const fullTextPrices = aiText.match(/"price":\s*(\d+)/g);

        // Use the longer match if available
        const finalProductIds =
          fullTextProductIds &&
          fullTextProductIds.length > (productIdMatches?.length || 0)
            ? fullTextProductIds
            : productIdMatches;
        const finalQuantities =
          fullTextQuantities &&
          fullTextQuantities.length > (quantityMatches?.length || 0)
            ? fullTextQuantities
            : quantityMatches;
        const finalPrices =
          fullTextPrices && fullTextPrices.length > (priceMatches?.length || 0)
            ? fullTextPrices
            : priceMatches;

        this.logger.warn(
          `Extracted product IDs from JSON: ${productIdMatches?.join(', ') || 'none'}`,
        );
        this.logger.warn(
          `Extracted product IDs from full text: ${fullTextProductIds?.join(', ') || 'none'}`,
        );
        this.logger.warn(
          `Final product IDs to use: ${finalProductIds?.join(', ') || 'none'}`,
        );
        this.logger.warn(
          `Final quantities: ${finalQuantities?.join(', ') || 'none'}`,
        );
        this.logger.warn(`Final prices: ${finalPrices?.join(', ') || 'none'}`);

        // Create items array from extracted data
        const items = [];
        if (finalProductIds && finalProductIds.length > 0) {
          for (let i = 0; i < finalProductIds.length; i++) {
            const productIdMatch = finalProductIds[i].match(/(\d+)/);
            const productId = productIdMatch ? parseInt(productIdMatch[1]) : 1;

            const quantityMatch =
              finalQuantities && finalQuantities[i]
                ? finalQuantities[i].match(/(\d+)/)
                : null;
            const quantity = quantityMatch ? parseInt(quantityMatch[1]) : 1;

            const priceMatch =
              finalPrices && finalPrices[i]
                ? finalPrices[i].match(/(\d+)/)
                : null;
            const price = priceMatch ? parseInt(priceMatch[1]) : 100; // Default price

            items.push({
              productId,
              quantity,
              price,
            });
          }
        } else {
          // Fallback to single item if no products found
          items.push({
            productId: 1,
            quantity: 1,
            price: 100,
          });
        }

        const orderData = {
          customerName: 'Not provided',
          customerContact: customerContactMatch
            ? customerContactMatch[1]
            : 'Not provided',
          items,
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

    // Look for ask for info intent marker
    const askForInfoMatch = aiText.match(
      /\[INTENT:ASK_FOR_INFO\]\s*(\{[\s\S]*?\})/,
    );
    if (askForInfoMatch) {
      try {
        const infoData = JSON.parse(askForInfoMatch[1]);
        const responseText = aiText
          .replace(/\[INTENT:ASK_FOR_INFO\][\s\S]*/, '')
          .trim();

        this.logger.log(
          `ASK_FOR_INFO intent detected: ${JSON.stringify(infoData)}`,
        );

        return {
          text:
            responseText ||
            infoData.message ||
            'I need some additional information to process your order.',
          intent: 'ASK_FOR_INFO',
          missingInfo: infoData.missingInfo || [],
        };
      } catch (error) {
        this.logger.warn(`Failed to parse ask for info data: ${error.message}`);
        return {
          text: aiText.replace(/\[INTENT:ASK_FOR_INFO\][\s\S]*/, '').trim(),
          intent: 'ASK_FOR_INFO',
          missingInfo: ['contact', 'location', 'payment'],
        };
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
        // Extract product info from items and look up actual product IDs and prices
        let items = [];
        if (Array.isArray(confirmationData.items)) {
          // Process each item string to extract product name and quantity
          const itemPromises = confirmationData.items.map(
            async (item: string) => {
              // Try to extract product info from item string like "ProductName (1 dona)"
              const match = item.match(/^(.+?)\s*\((\d+)\s*dona?\)$/);
              const productName = match ? match[1].trim() : item.trim();
              const quantity = match ? parseInt(match[2]) || 1 : 1;

              // Look up product by name (without organizationId for broader search)
              const product = await this.findProductByName(productName);

              if (product) {
                return {
                  productId: product.id,
                  quantity,
                  price: product.price,
                };
              }

              // Fallback if product not found
              this.logger.warn(
                `Product not found for item: "${productName}", using defaults`,
              );
              return {
                productId: 1,
                quantity,
                price: 0, // Default price when product not found
              };
            },
          );

          items = await Promise.all(itemPromises);
        } else {
          // Default fallback item
          items = [
            {
              productId: 1,
              quantity: 1,
              price: 0,
            },
          ];
        }

        const orderData = {
          customerName: 'Not provided',
          customerContact: confirmationData.phoneNumber || 'Not provided',
          items,
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

      const prompt = `You are the Aletis AI assistant. Generate an order confirmation message in the SAME language as the customer's message.

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
      // If text is empty or too short, default to Uzbek
      if (!text || text.trim().length < 2) {
        return 'uz';
      }

      const model = this.genAI.getGenerativeModel({
        model: 'gemini-1.5-flash',
      });

      const prompt = `Detect the language of the following text and return only the language code (uz, ru, en).

Text: "${text}"

Rules:
- If the text contains Cyrillic characters (а, б, в, г, д, е, ё, ж, з, и, й, к, л, м, н, о, п, р, с, т, у, ф, х, ц, ч, ш, щ, ъ, ы, ь, э, ю, я) → return "ru"
- If the text contains Latin characters with Uzbek-specific letters (oʻ, gʻ, sh, ch) or common Uzbek words → return "uz"  
- If the text contains only basic Latin characters and English words → return "en"
- If unsure, return "uz" (default)

Return only the language code:`;

      const result = await model.generateContent(prompt);
      const response = await result.response;
      const languageCode = response.text().trim().toLowerCase();

      // Validate and return supported language codes
      if (['uz', 'ru', 'en'].includes(languageCode)) {
        this.logger.log(
          `Language detected: ${languageCode} for text: "${text.substring(0, 50)}..."`,
        );
        return languageCode;
      }

      // Fallback: simple character-based detection
      const hasCyrillic = /[а-яё]/i.test(text);
      const hasUzbekSpecific =
        /[oʻgʻshch]/i.test(text) ||
        /(men|sen|biz|siz|ular|bu|shu|o'sha|qayerda|qachon|nima|kim|qanday)/i.test(
          text,
        );

      if (hasCyrillic) {
        this.logger.log(
          `Fallback detection: Russian (Cyrillic) for text: "${text.substring(0, 50)}..."`,
        );
        return 'ru';
      } else if (hasUzbekSpecific) {
        this.logger.log(
          `Fallback detection: Uzbek (specific patterns) for text: "${text.substring(0, 50)}..."`,
        );
        return 'uz';
      }

      // Default to Uzbek if detection fails
      this.logger.log(
        `Fallback detection: Uzbek (default) for text: "${text.substring(0, 50)}..."`,
      );
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

      const prompt = `You are Aletis, a friendly AI assistant. The customer asked: "${userMessage}"

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

      const prompt = `You are Aletis, a friendly AI assistant. The customer asked: "${userMessage}"

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

  /**
   * Find a product by name (and optionally by organization ID)
   * @param productName - The name of the product to find
   * @param organizationId - Optional organization ID to scope the search
   * @returns Product with id, price, and currency, or null if not found
   */
  private async findProductByName(
    productName: string,
    organizationId?: number,
  ): Promise<{ id: number; price: number; currency: string } | null> {
    try {
      if (!productName || !productName.trim()) {
        return null;
      }

      const searchName = productName.trim();
      const where: any = {
        name: {
          contains: searchName,
          mode: 'insensitive',
        },
        isDeleted: false,
      };

      // If organizationId is provided, scope the search to that organization
      if (organizationId) {
        where.organizationId = organizationId;
      }

      const product = await this.prisma.product.findFirst({
        where,
        select: {
          id: true,
          price: true,
          currency: true,
        },
        orderBy: {
          createdAt: 'desc', // Get the most recent product if multiple matches
        },
      });

      if (product) {
        this.logger.log(
          `Found product "${searchName}": ID=${product.id}, Price=${product.price} ${product.currency}`,
        );
        return {
          id: product.id,
          price: product.price,
          currency: product.currency || 'USD',
        };
      }

      this.logger.warn(
        `Product not found: "${searchName}"${organizationId ? ` (orgId: ${organizationId})` : ''}`,
      );
      return null;
    } catch (error) {
      this.logger.warn(
        `Error looking up product "${productName}": ${error.message}`,
      );
      return null;
    }
  }
}
