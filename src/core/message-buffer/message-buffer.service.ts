import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Represents a buffered message with its content and timestamp
 */
interface BufferedMessage {
  content: string;
  timestamp: Date;
}

/**
 * Represents the state of a customer's message buffer
 */
interface BufferState {
  messages: BufferedMessage[];
  flushTimeout: NodeJS.Timeout | null;
  lastMessageTime: Date;
  currentDelay: number;
  customerId: number;
  botId: number;
  organizationId: number;
}

/**
 * Result of flushing a buffer
 */
export interface FlushResult {
  combinedMessage: string;
  messageCount: number;
  customerId: number;
  botId: number;
  organizationId: number;
}

/**
 * Callback type for when a buffer is flushed
 */
export type FlushCallback = (result: FlushResult) => Promise<void>;

/**
 * MessageBufferService - Handles intelligent buffering and merging of customer messages
 *
 * This service implements an adaptive message buffering system that:
 * - Buffers multiple short messages from the same customer
 * - Merges them into a single coherent message
 * - Uses adaptive delays based on message frequency
 * - Prevents spam while maintaining natural conversation flow
 *
 * Algorithm:
 * 1. When a message arrives, add it to the customer's buffer
 * 2. If there's already a pending flush, extend the delay
 * 3. Otherwise, schedule a flush with base delay
 * 4. On flush, merge all messages and trigger the callback
 * 5. Clear the buffer after processing
 */
@Injectable()
export class MessageBufferService {
  private readonly logger = new Logger(MessageBufferService.name);

  // In-memory buffer storage: customerId -> BufferState
  private readonly buffers = new Map<number, BufferState>();

  // Configuration
  private readonly baseDelay: number;
  private readonly maxDelay: number;
  private readonly delayIncrement: number;

  constructor(private readonly configService: ConfigService) {
    // Load configuration with sensible defaults
    this.baseDelay =
      this.configService.get<number>('MESSAGE_BUFFER_DELAY_BASE') || 2000; // 2 seconds
    this.maxDelay =
      this.configService.get<number>('MESSAGE_BUFFER_DELAY_MAX') || 5000; // 5 seconds
    this.delayIncrement =
      this.configService.get<number>('MESSAGE_BUFFER_DELAY_INCREMENT') || 1000; // 1 second

    this.logger.log(
      `MessageBufferService initialized with baseDelay=${this.baseDelay}ms, maxDelay=${this.maxDelay}ms, delayIncrement=${this.delayIncrement}ms`,
    );
  }

  /**
   * Add a message to the buffer for a specific customer
   *
   * @param customerId - The customer ID
   * @param botId - The bot ID
   * @param organizationId - The organization ID
   * @param content - The message content
   * @param onFlush - Callback to execute when buffer is flushed
   */
  addMessage(
    customerId: number,
    botId: number,
    organizationId: number,
    content: string,
    onFlush: FlushCallback,
  ): void {
    const now = new Date();

    // Get or create buffer state for this customer
    let bufferState = this.buffers.get(customerId);

    if (!bufferState) {
      // Create new buffer state
      bufferState = {
        messages: [],
        flushTimeout: null,
        lastMessageTime: now,
        currentDelay: this.baseDelay,
        customerId,
        botId,
        organizationId,
      };
      this.buffers.set(customerId, bufferState);
    }

    // Add message to buffer
    bufferState.messages.push({
      content: content.trim(),
      timestamp: now,
    });

    this.logger.debug(
      `Message buffered for customer ${customerId}. Buffer size: ${bufferState.messages.length}, current delay: ${bufferState.currentDelay}ms`,
    );

    // Check if there's already a pending flush
    if (bufferState.flushTimeout) {
      // Clear existing timeout
      clearTimeout(bufferState.flushTimeout);
      bufferState.flushTimeout = null;

      // Extend delay (adaptive behavior)
      bufferState.currentDelay = Math.min(
        bufferState.currentDelay + this.delayIncrement,
        this.maxDelay,
      );

      this.logger.debug(
        `Extended delay for customer ${customerId} to ${bufferState.currentDelay}ms`,
      );
    } else {
      // Start with base delay
      bufferState.currentDelay = this.baseDelay;
    }

    // Update last message time
    bufferState.lastMessageTime = now;

    // Schedule flush
    this.scheduleFlush(customerId, bufferState.currentDelay, onFlush);
  }

  /**
   * Schedule a buffer flush after the specified delay
   *
   * @param customerId - The customer ID
   * @param delay - Delay in milliseconds
   * @param onFlush - Callback to execute when buffer is flushed
   */
  private scheduleFlush(
    customerId: number,
    delay: number,
    onFlush: FlushCallback,
  ): void {
    const bufferState = this.buffers.get(customerId);

    if (!bufferState) {
      this.logger.warn(`No buffer state found for customer ${customerId}`);
      return;
    }

    // Set timeout for flush
    bufferState.flushTimeout = setTimeout(async () => {
      try {
        await this.flushBuffer(customerId, onFlush);
      } catch (error) {
        this.logger.error(
          `Error flushing buffer for customer ${customerId}: ${error.message}`,
          error.stack,
        );
      }
    }, delay);

    this.logger.debug(
      `Scheduled flush for customer ${customerId} in ${delay}ms`,
    );
  }

  /**
   * Flush the buffer for a specific customer
   * Merges all messages and triggers the callback
   *
   * @param customerId - The customer ID
   * @param onFlush - Callback to execute with merged message
   */
  private async flushBuffer(
    customerId: number,
    onFlush: FlushCallback,
  ): Promise<void> {
    const bufferState = this.buffers.get(customerId);

    if (!bufferState) {
      this.logger.warn(
        `No buffer state found for customer ${customerId} during flush`,
      );
      return;
    }

    if (bufferState.messages.length === 0) {
      this.logger.warn(
        `Buffer for customer ${customerId} is empty during flush`,
      );
      this.clearBuffer(customerId);
      return;
    }

    // Merge messages
    const combinedMessage = this.mergeMessages(bufferState.messages);

    this.logger.log(
      `Flushing buffer for customer ${customerId}: ${bufferState.messages.length} messages merged into "${combinedMessage.substring(0, 50)}${combinedMessage.length > 50 ? '...' : ''}"`,
    );

    // Create flush result
    const flushResult: FlushResult = {
      combinedMessage,
      messageCount: bufferState.messages.length,
      customerId: bufferState.customerId,
      botId: bufferState.botId,
      organizationId: bufferState.organizationId,
    };

    // Execute callback
    await onFlush(flushResult);

    // Clear buffer
    this.clearBuffer(customerId);
  }

  /**
   * Merge multiple messages into a single coherent string
   *
   * @param messages - Array of buffered messages
   * @returns Combined message string
   */
  private mergeMessages(messages: BufferedMessage[]): string {
    if (messages.length === 0) {
      return '';
    }

    if (messages.length === 1) {
      return messages[0].content;
    }

    // Combine all messages with spaces
    const combined = messages.map((m) => m.content).join(' ');

    // Clean up the combined message
    return this.cleanMessage(combined);
  }

  /**
   * Clean up a merged message by removing duplicates and filler words
   *
   * @param message - The message to clean
   * @returns Cleaned message
   */
  private cleanMessage(message: string): string {
    let cleaned = message;

    // Remove excessive whitespace
    cleaned = cleaned.replace(/\s+/g, ' ').trim();

    // Remove common filler words at the start/end (optional enhancement)
    const fillerWords = ['ok', 'yes', 'hmm', 'uh', 'um', 'ah'];
    const words = cleaned.toLowerCase().split(' ');

    // Remove consecutive filler words
    const filteredWords: string[] = [];
    let lastWord = '';

    for (const word of words) {
      if (fillerWords.includes(word)) {
        // Skip if it's the same filler word repeated
        if (word !== lastWord) {
          filteredWords.push(word);
          lastWord = word;
        }
      } else {
        filteredWords.push(word);
        lastWord = '';
      }
    }

    // Reconstruct the message
    cleaned = filteredWords.join(' ');

    return cleaned.trim();
  }

  /**
   * Clear the buffer for a specific customer
   *
   * @param customerId - The customer ID
   */
  clearBuffer(customerId: number): void {
    const bufferState = this.buffers.get(customerId);

    if (bufferState) {
      // Clear timeout if exists
      if (bufferState.flushTimeout) {
        clearTimeout(bufferState.flushTimeout);
      }

      // Remove from map
      this.buffers.delete(customerId);

      this.logger.debug(`Buffer cleared for customer ${customerId}`);
    }
  }

  /**
   * Manually flush a buffer (useful for testing or forced flush)
   *
   * @param customerId - The customer ID
   * @param onFlush - Callback to execute with merged message
   */
  async forceFlush(customerId: number, onFlush: FlushCallback): Promise<void> {
    const bufferState = this.buffers.get(customerId);

    if (!bufferState) {
      this.logger.warn(
        `No buffer state found for customer ${customerId} during force flush`,
      );
      return;
    }

    // Clear existing timeout
    if (bufferState.flushTimeout) {
      clearTimeout(bufferState.flushTimeout);
      bufferState.flushTimeout = null;
    }

    // Flush immediately
    await this.flushBuffer(customerId, onFlush);
  }

  /**
   * Get current buffer state for a customer (useful for debugging)
   *
   * @param customerId - The customer ID
   * @returns Buffer state or null if not found
   */
  getBufferState(customerId: number): BufferState | null {
    return this.buffers.get(customerId) || null;
  }

  /**
   * Get statistics about all buffers (useful for monitoring)
   *
   * @returns Statistics object
   */
  getStatistics(): {
    totalBuffers: number;
    totalMessages: number;
    buffers: Array<{
      customerId: number;
      messageCount: number;
      currentDelay: number;
    }>;
  } {
    const buffers = Array.from(this.buffers.values());

    return {
      totalBuffers: buffers.length,
      totalMessages: buffers.reduce((sum, b) => sum + b.messages.length, 0),
      buffers: buffers.map((b) => ({
        customerId: b.customerId,
        messageCount: b.messages.length,
        currentDelay: b.currentDelay,
      })),
    };
  }

  /**
   * Clear all buffers (useful for cleanup or testing)
   */
  clearAllBuffers(): void {
    this.buffers.forEach((_, customerId) => {
      this.clearBuffer(customerId);
    });

    this.logger.log('All buffers cleared');
  }
}
