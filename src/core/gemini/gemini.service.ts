import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GenerativeModel, GoogleGenerativeAI } from '@google/generative-ai';
import { AiProvider, type Message } from '@prisma/client';
import { PrismaService } from '@/core/prisma/prisma.service';
import { AiKeyManagerService } from '@modules/ai-keys/ai-key-manager.service';
import { buildConversationPrompt } from './prompts/conversation.prompt';

export interface AiResponse {
  text: string;
  intent?: string;
  orderData?: any;
  shouldFetchOrders?: boolean;
  images?: string[];
  missingInfo?: string[];
  searchQuery?: string;
}

const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';
const MAX_KEY_ROTATIONS = 4;
const MAX_TRANSIENT_RETRIES = 3;

@Injectable()
export class GeminiService {
  private readonly logger = new Logger(GeminiService.name);
  private readonly modelName: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly aiKeyManager: AiKeyManagerService,
  ) {
    this.modelName =
      this.configService.get<string>('GEMINI_MODEL') ?? DEFAULT_GEMINI_MODEL;
  }

  /**
   * Acquire a key, execute the request, and rotate on quota errors. The inner
   * `MAX_TRANSIENT_RETRIES` loop covers flaky-network 429/503 against the same
   * key with exponential backoff; quota errors immediately move to the next key.
   */
  private async runWithModel<T>(
    fn: (model: GenerativeModel) => Promise<T>,
  ): Promise<T> {
    const triedDbKeyIds: number[] = [];
    let envTried = false;
    let lastError: unknown;

    for (let rotation = 0; rotation < MAX_KEY_ROTATIONS; rotation++) {
      const key = await this.aiKeyManager.acquire(AiProvider.GEMINI, {
        excludeIds: triedDbKeyIds,
        allowEnvFallback: !envTried,
      });
      if (key.id === null) envTried = true;

      const model = new GoogleGenerativeAI(key.apiKey).getGenerativeModel({
        model: this.modelName,
      });

      let rotateToNextKey = false;
      for (let attempt = 1; attempt <= MAX_TRANSIENT_RETRIES; attempt++) {
        try {
          return await fn(model);
        } catch (err) {
          lastError = err;
          const message = err instanceof Error ? err.message : String(err);
          if (this.isQuotaError(err)) {
            await this.aiKeyManager.markExhausted(key.id, message);
            if (key.id != null) triedDbKeyIds.push(key.id);
            rotateToNextKey = true;
            break;
          }
          if (
            this.isTransientGeminiError(err) &&
            attempt < MAX_TRANSIENT_RETRIES
          ) {
            const backoff = Math.min(2500, 500 * 2 ** (attempt - 1));
            this.logger.warn(
              `Gemini transient error (attempt ${attempt}/${MAX_TRANSIENT_RETRIES}): ${message}. Retrying in ${backoff}ms`,
            );
            await this.delay(backoff);
            continue;
          }
          await this.aiKeyManager.markError(key.id, message);
          throw err;
        }
      }
      if (!rotateToNextKey) break;
    }
    throw lastError ?? new Error('Gemini request failed: no key available');
  }

  /** Convenience wrapper for the common "generate text from a single prompt" path. */
  private async generateText(prompt: string): Promise<string> {
    return this.runWithModel(async (model) => {
      const result = await model.generateContent(prompt);
      return (await result.response).text();
    });
  }

  private isQuotaError(error: unknown): boolean {
    const status =
      (error as { status?: number; code?: number })?.status ??
      (error as { code?: number })?.code;
    const message =
      error instanceof Error ? error.message : String(error ?? '');
    return (
      status === 429 ||
      /quota|rate.?limit|RESOURCE_EXHAUSTED/i.test(message)
    );
  }

  async generateResponse(
    userText: string,
    conversationHistory: Message[],
    productContext?: string,
    userOrders?: any[],
    lang?: string,
  ): Promise<AiResponse> {
    const prompt = this.buildPrompt(
      userText,
      conversationHistory,
      productContext,
      userOrders,
      lang,
    );

    try {
      const text = await this.runWithModel(async (model) => {
        const result = await model.generateContent(prompt);
        return (await result.response).text();
      });
      const parsedResponse = await this.parseResponse(text);
      this.logger.log(
        `AI response generated: ${text.substring(0, 100)}${text.length > 100 ? '...' : ''}`,
      );
      return parsedResponse;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Error generating AI response: ${message}`);
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
      productContext ||
      'Product catalog is available via search. You do NOT have the full product list loaded. You MUST use [INTENT:SEARCH_PRODUCT] to find products.';
    const baseUrl = this.configService.get<string>('PUBLIC_BASE_URL') || '';

    const langInstruction =
      lang && ['uz', 'ru', 'en'].includes(lang)
        ? `IMPORTANT LANGUAGE RULE: ALWAYS reply in '${lang}'. Ignore any detection rules below.\n`
        : '';

    return buildConversationPrompt({
      userText,
      contextMessages,
      productInfo,
      baseUrl,
      langInstruction,
      userOrders,
    });
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

    // Look for search product intent marker
    const searchProductMatch = aiText.match(
      /\[INTENT:SEARCH_PRODUCT\]\s*(\{[\s\S]*?\})/,
    );
    if (searchProductMatch) {
      try {
        const searchData = JSON.parse(searchProductMatch[1]);
        const responseText = aiText
          .replace(/\[INTENT:SEARCH_PRODUCT\][\s\S]*/, '')
          .trim();

        this.logger.log(
          `SEARCH_PRODUCT intent detected: ${JSON.stringify(searchData)}`,
        );

        return {
          text: responseText || 'Let me search for that product.',
          intent: 'SEARCH_PRODUCT',
          searchQuery: searchData.searchQuery,
        };
      } catch (error) {
        this.logger.warn(
          'Failed to parse search product data from AI response',
        );
      }
    }

    return {
      text: aiText,
    };
  }

  private isTransientGeminiError(error: any): boolean {
    if (!error) {
      return false;
    }

    const status = error?.status ?? error?.code;
    const message = error?.message ?? String(error);

    if (status === 429 || status === 503) {
      return true;
    }

    return /429|503|rate limit|temporarily unavailable|overloaded/i.test(
      message,
    );
  }

  private async delay(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
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

      const confirmationMessage = (await this.generateText(prompt)).trim();

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

      const prompt = `Detect the language of the following text and return only the language code (uz, ru, en).

Text: "${text}"

Rules:
- If the text contains Cyrillic characters (а, б, в, г, д, е, ё, ж, з, и, й, к, л, м, н, о, п, р, с, т, у, ф, х, ц, ч, ш, щ, ъ, ы, ь, э, ю, я) → return "ru"
- If the text contains Latin characters with Uzbek-specific letters (oʻ, gʻ, sh, ch) or common Uzbek words → return "uz"
- If the text contains only basic Latin characters and English words → return "en"
- If unsure, return "uz" (default)

Return only the language code:`;

      const languageCode = (await this.generateText(prompt))
        .trim()
        .toLowerCase();

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

      const languageNames: Record<string, string> = {
        uz: 'Uzbek',
        ru: 'Russian',
        en: 'English',
      };

      const prompt = `Translate the following message to ${languageNames[targetLanguage] || 'Uzbek'}. Keep the HTML formatting and emojis intact:

${message}

Translated message:`;

      return (await this.generateText(prompt)).trim();
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

      return (await this.generateText(prompt)).trim();
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

      return (await this.generateText(prompt)).trim();
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
