# Redis Caching Strategy for ProductsService

## Overview

This document outlines the comprehensive Redis caching strategy implemented for the `ProductsService` in the Flovo backend. The strategy prioritizes data correctness over raw performance while providing significant performance improvements through intelligent caching.

## Cache Key Patterns

### 1. Product Entity Cache
- **Pattern**: `product:{id}`
- **TTL**: 600 seconds (10 minutes)
- **Usage**: Individual product data caching

### 2. Product Details Cache
- **Pattern**: `product:{id}:details`
- **TTL**: 600 seconds (10 minutes)
- **Usage**: Product details with full field values and images

### 3. Product List Cache
- **Pattern**: `products:org:{orgId}:page:{page}:limit:{limit}:search:{search}:order:{order}`
- **TTL**: 300 seconds (5 minutes)
- **Usage**: Paginated product lists with search and sorting

### 4. Organization Product Cache
- **Pattern**: `org:{orgId}:products`
- **TTL**: 900 seconds (15 minutes)
- **Usage**: Organization-level product collections

### 5. Schema Product Cache
- **Pattern**: `schema:{schemaId}:products`
- **TTL**: 1200 seconds (20 minutes)
- **Usage**: Schema-based product lists

### 6. Product Lock Cache
- **Pattern**: `product:{id}:lock`
- **TTL**: 30 seconds
- **Usage**: Distributed locks for cache stampede protection

## TTL Strategy

| Cache Type | TTL | Reasoning |
|------------|-----|-----------|
| Product Data | 10 minutes | Product data changes infrequently |
| Product Details | 10 minutes | Details change infrequently |
| Product Lists | 5 minutes | List data changes more frequently |
| Organization Products | 15 minutes | Organization product list changes rarely |
| Schema Products | 20 minutes | Schema-based lists change very rarely |
| Locks | 30 seconds | Short timeout for stampede protection |

## Cache Implementation Details

### 1. Cache Helper Methods

```typescript
// Generic cache operations with error handling
private async getFromCache<T>(key: string): Promise<T | null>
private async setCache<T>(key: string, value: T, ttl: number): Promise<void>
private async getOrSetCache<T>(key: string, ttl: number, factory: () => Promise<T>, lockKey?: string): Promise<T>
```

### 2. Cache Stampede Protection

#### Double-Checked Locking Pattern
```typescript
// 1. Try to get from cache
const cached = await this.getFromCache<T>(key);
if (cached !== null) return cached;

// 2. Acquire lock to prevent concurrent cache building
const lockAcquired = await this.acquireLock(lockKey);
if (!lockAcquired) {
  // Wait and retry
  await this.sleep(100);
  const retryCached = await this.getFromCache<T>(key);
  if (retryCached !== null) return retryCached;
}

// 3. Build cache and release lock
try {
  const data = await factory();
  await this.setCache(key, data, ttl);
  return data;
} finally {
  await this.releaseLock(lockKey);
}
```

#### Distributed Lock Implementation
```typescript
// Use Redis SET with NX and PX for atomic lock acquisition
private async acquireLock(lockKey: string): Promise<boolean> {
  const result = await this.redis.set(lockKey, 'locked', this.TTL.LOCK);
  return result === 'OK';
}
```

### 3. Cache Invalidation Strategy

#### Product-Specific Invalidation
- **Pattern**: `product:{productId}*`
- **Triggers**: Product updates, deletions

#### Organization-Specific Invalidation
- **Patterns**: 
  - `products:org:{orgId}:*`
  - `org:{orgId}:products`
- **Triggers**: New product creation, product updates affecting organization

#### Schema-Specific Invalidation
- **Pattern**: `schema:{schemaId}:products`
- **Triggers**: Product creation/update/deletion affecting schema

### 4. Cached Methods

#### `getProducts()` - Paginated Product List
- **Cache Key**: `products:org:{orgId}:page:{page}:limit:{limit}:search:{search}:order:{order}`
- **Strategy**: Cache entire paginated response
- **Stampede Protection**: No lock (list queries less prone to stampede)
- **Invalidation**: On product create/update/delete

#### `getProductById()` - Product Details
- **Cache Key**: `product:{id}:details`
- **Strategy**: Cache product with full field values and images
- **Stampede Protection**: Uses distributed lock
- **Invalidation**: On product updates

## Cache Invalidation Triggers

### Create Operations
- `createProduct()` → Invalidate organization and schema product caches

### Update Operations
- `updateProduct()` → Invalidate product, organization, and schema caches

### Delete Operations
- `deleteProduct()` → Invalidate product, organization, and schema caches
- `bulkDeleteProducts()` → Invalidate multiple product caches and related caches

## Race Condition Prevention

### 1. Cache Stampede Protection
- **Problem**: Multiple requests hit cache miss simultaneously
- **Solution**: Distributed locks with double-checked locking
- **Fallback**: Graceful degradation to database queries

### 2. Concurrent Update Handling
- **Problem**: Cache invalidation during concurrent reads
- **Solution**: Cache-aside pattern with proper invalidation order
- **Strategy**: Invalidate cache before database updates

### 3. Data Consistency
- **Problem**: Stale data in cache after mutations
- **Solution**: Comprehensive cache invalidation on all mutations
- **Strategy**: Pattern-based invalidation for related caches

## Performance Optimizations

### 1. Efficient Cache Keys
- Hierarchical naming for easy pattern matching
- Consistent structure for bulk operations
- Search and pagination parameters included in keys

### 2. TTL Optimization
- Short TTL for frequently changing data (lists)
- Longer TTL for stable data (product details)
- Balance between freshness and performance

### 3. Bulk Operations
- Pattern-based invalidation for multiple keys
- Parallel cache operations where possible
- Efficient Redis operations

## Error Handling and Resilience

### 1. Cache Failures
- Cache failures are logged but don't break functionality
- Database operations continue even if cache fails
- Graceful degradation to database-only mode

### 2. Lock Failures
- Lock acquisition failures don't block operations
- Fallback to database queries if locks fail
- Automatic lock timeout prevents deadlocks

### 3. Network Issues
- Redis connection failures are handled gracefully
- Retry logic for transient failures
- Circuit breaker pattern for persistent failures

## Monitoring and Maintenance

### Cache Hit/Miss Tracking
- Monitor cache performance through Redis metrics
- Track cache hit rates for optimization
- Alert on high cache miss rates

### Memory Management
- TTL prevents indefinite cache growth
- Pattern-based cleanup for related caches
- Monitor Redis memory usage

### Error Recovery
- Cache failures don't affect core functionality
- Automatic fallback to database queries
- Health checks for Redis connectivity

## Best Practices Implemented

### 1. Data Consistency
- Cache invalidation on all mutations
- No stale data in cache
- Consistent cache keys across operations

### 2. Performance
- Minimal database queries through caching
- Efficient cache key patterns
- Appropriate TTL values

### 3. Maintainability
- Modular cache helper methods
- Clear separation of concerns
- Comprehensive error handling

### 4. Scalability
- Pattern-based invalidation scales with data
- Efficient Redis operations
- Minimal memory footprint

## Usage Examples

### Reading Cached Data
```typescript
// Automatically cached in getProducts()
const products = await productsService.getProducts(userId, paginationDto);

// Automatically cached in getProductById()
const product = await productsService.getProductById(productId, userId);
```

### Cache Invalidation
```typescript
// Automatically invalidated on product creation
await productsService.createProduct(userId, createProductDto);

// Automatically invalidated on product updates
await productsService.updateProduct(productId, userId, updateProductDto);

// Automatically invalidated on product deletion
await productsService.deleteProduct(productId, userId);
```

## Advanced Features

### 1. Cache Stampede Protection
- Distributed locks prevent multiple processes from building the same cache
- Double-checked locking ensures only one process builds cache
- Automatic lock timeout prevents deadlocks

### 2. Race Condition Handling
- Cache invalidation happens before database updates
- Proper ordering of operations prevents race conditions
- Consistent state maintained across all operations

### 3. Bulk Operations Support
- Efficient bulk cache invalidation
- Pattern-based cleanup for multiple related caches
- Optimized for high-volume operations

## Future Enhancements

### 1. Cache Warming
- Pre-populate frequently accessed data
- Background cache refresh for critical data
- Predictive cache loading

### 2. Advanced Invalidation
- Event-driven cache invalidation
- Selective cache updates instead of invalidation
- Smart cache refresh strategies

### 3. Monitoring
- Cache performance metrics
- Automated cache optimization
- Real-time cache health monitoring

## Conclusion

This Redis caching strategy provides:

- ✅ **Data Consistency**: No stale data through proper invalidation
- ✅ **Performance**: Reduced database queries through intelligent caching
- ✅ **Scalability**: Pattern-based operations scale with data growth
- ✅ **Maintainability**: Clean, modular cache implementation
- ✅ **Reliability**: Graceful error handling and fallback mechanisms
- ✅ **Race Condition Prevention**: Distributed locks and proper ordering
- ✅ **Cache Stampede Protection**: Double-checked locking pattern

The implementation ensures that the ProductsService maintains high performance while keeping data fresh and consistent across all operations, with robust protection against common caching pitfalls.
