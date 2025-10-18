# Message Buffering & Merging System Implementation

## 🎯 Overview

This document describes the implementation of an intelligent message buffering and merging system for the Flovo AI Telegram bot backend. The system intelligently buffers multiple short messages from customers and merges them into a single coherent message before sending to the AI service.

## 🧠 Problem Statement

When customers interact with Telegram bots, they often send multiple short messages in quick succession:
- "Hi"
- "Do you have Nike shoes?"
- "How much?"
- "What colors?"

Without buffering, each message triggers a separate AI request, resulting in:
- ❌ Multiple AI API calls (costly)
- ❌ Fragmented responses
- ❌ Poor user experience
- ❌ Context loss between messages

## ✅ Solution

The MessageBufferService implements an adaptive buffering system that:
- ✅ Buffers messages from the same customer
- ✅ Merges them into a single coherent message
- ✅ Uses adaptive delays based on message frequency
- ✅ Sends one AI request instead of multiple
- ✅ Maintains natural conversation flow

## 🏗️ Architecture

### Components

```
┌─────────────────────────────────────────────────────────────┐
│                    Telegram Webhook                          │
│                  (Customer sends message)                    │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                    WebhookService                            │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  1. Validate webhook                                  │   │
│  │  2. Save message to database                          │   │
│  │  3. Add to MessageBufferService                       │   │
│  └──────────────────────────────────────────────────────┘   │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│              MessageBufferService                            │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Buffer State Management:                             │   │
│  │  - Map<customerId, BufferState>                      │   │
│  │  - Adaptive delay scheduling                         │   │
│  │  - Message merging logic                             │   │
│  └──────────────────────────────────────────────────────┘   │
└────────────────────┬────────────────────────────────────────┘
                     │
                     │ (after delay)
                     ▼
┌─────────────────────────────────────────────────────────────┐
│              WebhookService.processBufferedMessages()        │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  1. Get conversation history                         │   │
│  │  2. Send merged message to AI                        │   │
│  │  3. Process AI response                              │   │
│  │  4. Send response to Telegram                        │   │
│  │  5. Save bot response to database                    │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### Data Flow

```
Customer sends: "Hi"
  ↓
WebhookService.handleWebhook()
  ↓
MessageBufferService.addMessage()
  ↓
Buffer: ["Hi"]
  ↓
Schedule flush in 2s

Customer sends: "Do you have Nike?" (within 2s)
  ↓
MessageBufferService.addMessage()
  ↓
Buffer: ["Hi", "Do you have Nike?"]
  ↓
Clear previous timeout
  ↓
Extend delay to 3s (2s + 1s increment)

Customer sends: "How much?" (within 3s)
  ↓
MessageBufferService.addMessage()
  ↓
Buffer: ["Hi", "Do you have Nike?", "How much?"]
  ↓
Clear previous timeout
  ↓
Extend delay to 4s (3s + 1s increment)

(No more messages for 4s)
  ↓
Timeout fires
  ↓
MessageBufferService.flushBuffer()
  ↓
Merge: "Hi Do you have Nike? How much?"
  ↓
WebhookService.processBufferedMessages()
  ↓
Send to AI: "Hi Do you have Nike? How much?"
  ↓
AI Response: "Hello! Yes, we have Nike shoes. They range from $80-$150..."
  ↓
Send response to customer
```

## 📊 Algorithm Details

### Adaptive Delay Calculation

```typescript
// Base delay: 2 seconds
const baseDelay = 2000; // ms

// When a new message arrives:
if (hasPendingFlush) {
  // Extend delay by increment
  currentDelay = Math.min(
    currentDelay + delayIncrement,  // +1s each message
    maxDelay                        // Cap at 5s
  );
} else {
  // Start with base delay
  currentDelay = baseDelay;
}

// Schedule flush
setTimeout(() => flushBuffer(), currentDelay);
```

### Message Merging Logic

```typescript
// Combine all messages
const combined = messages.map(m => m.content).join(' ');

// Clean up
const cleaned = combined
  .replace(/\s+/g, ' ')  // Remove excessive whitespace
  .trim();

// Optional: Remove filler words
const fillerWords = ['ok', 'yes', 'hmm', 'uh', 'um', 'ah'];
// Remove consecutive duplicate filler words
```

### Example Scenarios

#### Scenario 1: Rapid Messages
```
Time 0s:  "Hi"
Time 0.5s: "Do you have Nike?"
Time 1s:   "How much?"
Time 1.5s: "What colors?"

Result:
- Buffer: ["Hi", "Do you have Nike?", "How much?", "What colors?"]
- Merged: "Hi Do you have Nike? How much? What colors?"
- Delay: 5s (max reached)
- AI Request: 1
```

#### Scenario 2: Slow Messages
```
Time 0s:  "Hi"
Time 3s:  "Do you have Nike?"

Result:
- Buffer: ["Hi"]
- Merged: "Hi"
- Delay: 2s
- AI Request: 1 (sent at 2s)

Then:
- Buffer: ["Do you have Nike?"]
- Merged: "Do you have Nike?"
- Delay: 2s
- AI Request: 1 (sent at 5s)
```

#### Scenario 3: Single Message
```
Time 0s:  "Hello, I'm looking for running shoes"

Result:
- Buffer: ["Hello, I'm looking for running shoes"]
- Merged: "Hello, I'm looking for running shoes"
- Delay: 2s
- AI Request: 1
```

## 🔧 Configuration

### Environment Variables

Add these to your `.env` file:

```env
# Message Buffering Configuration
MESSAGE_BUFFER_DELAY_BASE=2000          # Base delay in ms (default: 2s)
MESSAGE_BUFFER_DELAY_MAX=5000           # Maximum delay in ms (default: 5s)
MESSAGE_BUFFER_DELAY_INCREMENT=1000     # Increment per message in ms (default: 1s)
```

### Recommended Values

| Use Case | Base Delay | Max Delay | Increment |
|----------|-----------|-----------|-----------|
| **Fast-paced chat** (support) | 1500ms | 4000ms | 500ms |
| **Normal chat** (default) | 2000ms | 5000ms | 1000ms |
| **Slow chat** (formal) | 3000ms | 7000ms | 1500ms |

## 📝 API Reference

### MessageBufferService

#### `addMessage(customerId, botId, organizationId, content, onFlush)`

Add a message to the buffer for a specific customer.

**Parameters:**
- `customerId: number` - The customer ID
- `botId: number` - The bot ID
- `organizationId: number` - The organization ID
- `content: string` - The message content
- `onFlush: FlushCallback` - Callback to execute when buffer is flushed

**Example:**
```typescript
messageBufferService.addMessage(
  customerId,
  botId,
  organizationId,
  "Hi, do you have Nike shoes?",
  async (flushResult) => {
    console.log(`Processing ${flushResult.messageCount} messages`);
    console.log(`Merged: ${flushResult.combinedMessage}`);
  }
);
```

#### `forceFlush(customerId, onFlush)`

Manually flush a buffer immediately (useful for testing).

**Parameters:**
- `customerId: number` - The customer ID
- `onFlush: FlushCallback` - Callback to execute with merged message

**Example:**
```typescript
await messageBufferService.forceFlush(customerId, async (result) => {
  // Process immediately
});
```

#### `getBufferState(customerId)`

Get current buffer state for a customer (useful for debugging).

**Parameters:**
- `customerId: number` - The customer ID

**Returns:** `BufferState | null`

**Example:**
```typescript
const state = messageBufferService.getBufferState(customerId);
console.log(`Messages in buffer: ${state?.messages.length}`);
console.log(`Current delay: ${state?.currentDelay}ms`);
```

#### `getStatistics()`

Get statistics about all active buffers.

**Returns:**
```typescript
{
  totalBuffers: number;
  totalMessages: number;
  buffers: Array<{
    customerId: number;
    messageCount: number;
    currentDelay: number;
  }>;
}
```

**Example:**
```typescript
const stats = messageBufferService.getStatistics();
console.log(`Active buffers: ${stats.totalBuffers}`);
console.log(`Total messages buffered: ${stats.totalMessages}`);
```

#### `clearBuffer(customerId)`

Clear the buffer for a specific customer.

**Parameters:**
- `customerId: number` - The customer ID

#### `clearAllBuffers()`

Clear all buffers (useful for cleanup).

## 🧪 Testing

### Unit Test Example

```typescript
describe('MessageBufferService', () => {
  let service: MessageBufferService;
  let flushCallback: jest.Mock;

  beforeEach(() => {
    service = new MessageBufferService(mockConfigService);
    flushCallback = jest.fn();
  });

  it('should buffer multiple messages and merge them', async () => {
    // Add first message
    service.addMessage(1, 1, 1, 'Hi', flushCallback);
    
    // Add second message quickly
    await new Promise(resolve => setTimeout(resolve, 500));
    service.addMessage(1, 1, 1, 'Do you have Nike?', flushCallback);
    
    // Add third message
    await new Promise(resolve => setTimeout(resolve, 500));
    service.addMessage(1, 1, 1, 'How much?', flushCallback);
    
    // Wait for flush
    await new Promise(resolve => setTimeout(resolve, 3500));
    
    // Verify callback was called once
    expect(flushCallback).toHaveBeenCalledTimes(1);
    
    // Verify merged message
    const callArgs = flushCallback.mock.calls[0][0];
    expect(callArgs.combinedMessage).toBe('Hi Do you have Nike? How much?');
    expect(callArgs.messageCount).toBe(3);
  });

  it('should extend delay on rapid messages', () => {
    service.addMessage(1, 1, 1, 'Message 1', flushCallback);
    
    // Check base delay
    let state = service.getBufferState(1);
    expect(state?.currentDelay).toBe(2000);
    
    // Add second message
    service.addMessage(1, 1, 1, 'Message 2', flushCallback);
    state = service.getBufferState(1);
    expect(state?.currentDelay).toBe(3000); // 2000 + 1000
    
    // Add third message
    service.addMessage(1, 1, 1, 'Message 3', flushCallback);
    state = service.getBufferState(1);
    expect(state?.currentDelay).toBe(4000); // 3000 + 1000
    
    // Add fourth message (should cap at max)
    service.addMessage(1, 1, 1, 'Message 4', flushCallback);
    state = service.getBufferState(1);
    expect(state?.currentDelay).toBe(5000); // Capped at max
  });

  it('should handle single message', async () => {
    service.addMessage(1, 1, 1, 'Single message', flushCallback);
    
    // Wait for flush
    await new Promise(resolve => setTimeout(resolve, 2500));
    
    expect(flushCallback).toHaveBeenCalledTimes(1);
    const callArgs = flushCallback.mock.calls[0][0];
    expect(callArgs.combinedMessage).toBe('Single message');
    expect(callArgs.messageCount).toBe(1);
  });
});
```

### Integration Test Example

```typescript
describe('WebhookService with MessageBuffer', () => {
  it('should buffer rapid messages and send single AI response', async () => {
    // Simulate 3 rapid messages
    await webhookService.handleWebhook({
      update_id: 1,
      message: { text: 'Hi', chat: { id: 123 }, from: { id: 456, first_name: 'Test' } }
    }, botId, orgId);
    
    await new Promise(resolve => setTimeout(resolve, 500));
    await webhookService.handleWebhook({
      update_id: 2,
      message: { text: 'Do you have Nike?', chat: { id: 123 }, from: { id: 456, first_name: 'Test' } }
    }, botId, orgId);
    
    await new Promise(resolve => setTimeout(resolve, 500));
    await webhookService.handleWebhook({
      update_id: 3,
      message: { text: 'How much?', chat: { id: 123 }, from: { id: 456, first_name: 'Test' } }
    }, botId, orgId);
    
    // Wait for buffer flush
    await new Promise(resolve => setTimeout(resolve, 3500));
    
    // Verify only one AI request was made
    expect(mockGeminiService.generateResponse).toHaveBeenCalledTimes(1);
    
    // Verify merged message was sent to AI
    const aiCall = mockGeminiService.generateResponse.mock.calls[0];
    expect(aiCall[0]).toBe('Hi Do you have Nike? How much?');
  });
});
```

## 📊 Performance Metrics

### Before Buffering
```
Customer sends 3 messages in 2 seconds:
- AI Requests: 3
- Average Response Time: 1.5s per request
- Total Time: 4.5s
- Cost: 3x AI API calls
```

### After Buffering
```
Customer sends 3 messages in 2 seconds:
- AI Requests: 1
- Average Response Time: 1.5s
- Total Time: 3.5s (2s buffer + 1.5s AI)
- Cost: 1x AI API call (66% reduction)
```

### Savings
- **API Calls**: 66% reduction
- **Cost**: 66% reduction
- **Response Quality**: Improved (context preserved)
- **User Experience**: Better (single coherent response)

## 🔍 Monitoring & Debugging

### Logs to Watch

```
[MessageBufferService] Message buffered for customer 123. Buffer size: 1, current delay: 2000ms
[MessageBufferService] Extended delay for customer 123 to 3000ms
[MessageBufferService] Flushing buffer for customer 123: 3 messages merged into "Hi Do you have Nike? How much?"
[WebhookService] Processing buffered messages for customer 123: 3 messages merged
[WebhookService] AI response sent to customer 123: "Hello! Yes, we have Nike shoes..."
```

### Buffer Statistics Endpoint (Future Enhancement)

```typescript
@Get('buffer/stats')
async getBufferStats() {
  return this.messageBufferService.getStatistics();
}
```

Response:
```json
{
  "totalBuffers": 5,
  "totalMessages": 12,
  "buffers": [
    {
      "customerId": 123,
      "messageCount": 3,
      "currentDelay": 3000
    },
    {
      "customerId": 456,
      "messageCount": 1,
      "currentDelay": 2000
    }
  ]
}
```

## 🚀 Future Enhancements

### 1. Redis Persistence
Store buffer state in Redis for multi-instance deployments:
```typescript
// Store buffer state
await redis.set(`buffer:${customerId}`, JSON.stringify(bufferState), 'EX', 60);

// Retrieve buffer state
const state = await redis.get(`buffer:${customerId}`);
```

### 2. Smart Message Classification
Classify messages to determine if buffering is appropriate:
```typescript
// Don't buffer long messages
if (message.length > 100) {
  processImmediately();
} else {
  addToBuffer();
}
```

### 3. Context-Aware Buffering
Use conversation context to determine optimal buffer delay:
```typescript
// If customer is asking questions, buffer
// If customer is answering, process immediately
if (isQuestion(message)) {
  addToBuffer();
} else {
  processImmediately();
}
```

### 4. Buffer Analytics
Track buffer effectiveness:
```typescript
{
  messagesBuffered: 1500,
  messagesMerged: 450,
  averageMergeSize: 3.3,
  averageDelay: 2.8s,
  aiRequestsSaved: 1050
}
```

## 🐛 Troubleshooting

### Issue: Messages not being buffered

**Check:**
1. Is MessageBufferService injected in WebhookService?
2. Are environment variables set correctly?
3. Check logs for buffer initialization

### Issue: Buffer not flushing

**Check:**
1. Are timeouts being cleared properly?
2. Check for errors in flush callback
3. Verify buffer state with `getBufferState()`

### Issue: Messages being duplicated

**Check:**
1. Ensure buffer is cleared after flush
2. Verify no double processing in webhook handler
3. Check for race conditions

## 📚 References

- [NestJS Dependency Injection](https://docs.nestjs.com/providers)
- [Node.js Timers](https://nodejs.org/api/timers.html)
- [Telegram Bot API](https://core.telegram.org/bots/api)
- [Google Gemini API](https://ai.google.dev/docs)

## 📄 License

This implementation is part of the Flovo backend system.

---

**Author**: Senior Backend Engineer  
**Date**: January 2025  
**Version**: 1.0.0

