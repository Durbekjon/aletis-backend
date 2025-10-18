# Bot Statistics Implementation Summary

## Overview
Successfully implemented bot statistics functionality for the Flovo backend system. The implementation includes database schema updates, service logic, and API endpoints that provide comprehensive bot analytics.

## Changes Made

### 1. Database Schema Updates (Already Present)
- **Bot Model**: Added `activatedAt` and `deactivatedAt` fields
  - `activatedAt`: Timestamp when bot was activated (set when status changes to ACTIVE)
  - `deactivatedAt`: Timestamp when bot was deactivated (set when status changes to INACTIVE)
  
- **Message Model**: Added `botId` relation
  - Foreign key to Bot table for efficient querying
  - Index on `(botId, createdAt)` for performance

### 2. DTOs (Updated)
**File**: `src/modules/bots/dto/bot-response.dto.ts`

#### BotStatisticsResponseDto
```typescript
{
  totalMessages: number;      // Total messages for the bot
  activeChats: number;        // Unique customers active in last 24 hours
  uptime: string;             // Human-readable uptime (e.g., "5 hours 30 minutes")
  lastActive: string | null;  // ISO timestamp of last bot message or null
}
```

#### BotResponseDto
- Added `statistics: BotStatisticsResponseDto` field
- Includes all bot information plus calculated statistics

### 3. Service Layer Updates
**File**: `src/modules/bots/bots.service.ts`

#### New Method: `calculateBotStatistics(botId: number)`
Calculates comprehensive bot statistics:

**Algorithm**:
1. **Total Messages**: Count all messages where `botId` matches
2. **Active Chats**: Count unique customers who sent/received messages in last 24 hours
   - Query messages with `createdAt >= 24 hours ago`
   - Get distinct `customerId` values
   - Return count
3. **Uptime Calculation**:
   - If ACTIVE: `now - activatedAt`
   - If INACTIVE: `deactivatedAt - activatedAt` (total runtime)
   - Format as human-readable string (hours + minutes)
4. **Last Active**: Latest message where `sender = 'BOT'`
   - Query messages with `sender = 'BOT'`
   - Order by `createdAt DESC`
   - Return ISO string or null

**Performance Optimizations**:
- Uses indexed queries on `(botId, createdAt)`
- Selects only required fields
- Efficient distinct query for active chats

#### Updated Methods:

**startBot()**:
```typescript
// Now sets activatedAt when bot is activated
data: { 
  status: BotStatus.ACTIVE,
  activatedAt: new Date(),
}
```

**stopBot()**:
```typescript
// Now sets deactivatedAt when bot is stopped
data: { 
  status: BotStatus.INACTIVE,
  deactivatedAt: new Date(),
}
```

**getBots()**:
- Returns paginated list of bots
- Each bot includes calculated statistics
- Uses `Promise.all()` for parallel statistics calculation

**getBotDetails()**:
- Returns single bot with statistics
- Includes all bot details plus real-time statistics

### 4. Controller Updates
**File**: `src/modules/bots/bots.controller.ts`

#### Updated Endpoints:

**GET /v1/bots**
- Returns paginated list with statistics
- Response type: `BotPaginatedResponseDto`
- Each item includes `statistics` field

**GET /v1/bots/:id**
- Returns bot details with statistics
- Response type: `BotResponseDto`
- Includes real-time calculated statistics

### 5. Swagger Documentation
All endpoints properly documented with:
- Response types
- Example values
- Field descriptions
- Nullable fields marked appropriately

## API Response Examples

### GET /v1/bots
```json
{
  "items": [
    {
      "id": 1,
      "telegramId": "123456789",
      "name": "My Shop Bot",
      "username": "myshopbot",
      "organizationId": 1,
      "status": "ACTIVE",
      "isDefault": true,
      "createdAt": "2025-01-18T10:00:00.000Z",
      "updatedAt": "2025-01-18T12:00:00.000Z",
      "statistics": {
        "totalMessages": 150,
        "activeChats": 12,
        "uptime": "5 hours 30 minutes",
        "lastActive": "2025-01-18T17:30:00.000Z"
      }
    }
  ],
  "total": 1,
  "page": 1,
  "limit": 20,
  "totalPages": 1,
  "hasNext": false,
  "hasPrevious": false
}
```

### GET /v1/bots/:id
```json
{
  "id": 1,
  "telegramId": "123456789",
  "name": "My Shop Bot",
  "username": "myshopbot",
  "organizationId": 1,
  "status": "ACTIVE",
  "isDefault": true,
  "createdAt": "2025-01-18T10:00:00.000Z",
  "updatedAt": "2025-01-18T12:00:00.000Z",
  "statistics": {
    "totalMessages": 150,
    "activeChats": 12,
    "uptime": "5 hours 30 minutes",
    "lastActive": "2025-01-18T17:30:00.000Z"
  }
}
```

## Database Queries Used

### 1. Total Messages
```sql
SELECT COUNT(*) FROM messages WHERE botId = ?
```

### 2. Active Chats (Last 24 Hours)
```sql
SELECT DISTINCT customerId 
FROM messages 
WHERE botId = ? 
  AND createdAt >= NOW() - INTERVAL '24 hours'
```

### 3. Last Bot Message
```sql
SELECT createdAt 
FROM messages 
WHERE botId = ? 
  AND sender = 'BOT' 
ORDER BY createdAt DESC 
LIMIT 1
```

### 4. Bot Status Check
```sql
SELECT status, activatedAt, deactivatedAt 
FROM bots 
WHERE id = ?
```

## Performance Considerations

### Indexes Used
- `messages(botId, createdAt)` - Composite index for efficient queries
- `messages(sender)` - Used implicitly for last active query
- `bots(id)` - Primary key for bot lookup

### Query Optimization
- Statistics calculated on-demand (not cached)
- Parallel calculation for multiple bots using `Promise.all()`
- Minimal data transfer (only required fields selected)
- Efficient distinct query for active chats

### Scalability
- For high-volume systems, consider:
  - Caching statistics with TTL (e.g., 5 minutes)
  - Background job to pre-calculate statistics
  - Materialized views for complex aggregations
  - Redis for real-time counters

## Testing Recommendations

### Unit Tests
1. Test `calculateBotStatistics()` with various scenarios:
   - Bot with no messages
   - Bot with messages but no bot messages
   - Active bot with recent messages
   - Inactive bot with historical data
   - Bot with 0 active chats

2. Test uptime calculation:
   - Active bot (current uptime)
   - Inactive bot (total uptime)
   - Bot never activated (0 hours)

### Integration Tests
1. Test GET /v1/bots endpoint:
   - Verify statistics included in response
   - Test pagination with statistics
   - Test search functionality

2. Test GET /v1/bots/:id endpoint:
   - Verify statistics included
   - Test with non-existent bot
   - Test authorization

3. Test bot activation/deactivation:
   - Verify activatedAt set on start
   - Verify deactivatedAt set on stop
   - Verify statistics reflect new status

### E2E Tests
1. Complete bot lifecycle:
   - Create bot
   - Verify statistics (0 messages, 0 active chats)
   - Start bot
   - Send messages via webhook
   - Verify updated statistics
   - Stop bot
   - Verify final statistics

## Security Considerations

1. **Authorization**: All endpoints protected with JWT authentication
2. **Organization Isolation**: Statistics only calculated for user's organization
3. **Data Privacy**: No sensitive data exposed in statistics
4. **Input Validation**: Bot ID validated as integer

## Future Enhancements

1. **Caching**: Implement Redis caching for frequently accessed statistics
2. **Webhooks**: Real-time statistics updates via webhooks
3. **Analytics Dashboard**: Historical statistics and trends
4. **Export**: CSV/PDF export of bot statistics
5. **Alerts**: Notifications for inactive bots or unusual activity
6. **Advanced Metrics**:
   - Response time
   - Message success rate
   - Customer retention rate
   - Peak activity times

## Migration Notes

The database schema was already updated with:
- `activatedAt` and `deactivatedAt` fields in Bot model
- `botId` relation in Message model
- Proper indexes for performance

No additional migrations needed.

## Code Quality

✅ **Type Safety**: Full TypeScript typing with proper DTOs
✅ **Error Handling**: Comprehensive error handling with proper HTTP status codes
✅ **Documentation**: Swagger/OpenAPI documentation for all endpoints
✅ **Performance**: Optimized queries with proper indexes
✅ **Maintainability**: Clean, readable code following NestJS best practices
✅ **Testing**: Ready for unit and integration tests

## Summary

Successfully implemented a production-grade bot statistics system that:
- Provides real-time analytics for each bot
- Tracks message volume and engagement
- Calculates uptime and last activity
- Integrates seamlessly with existing bot management
- Follows NestJS and Prisma best practices
- Includes comprehensive Swagger documentation
- Ready for production deployment

