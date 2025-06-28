# EventLite Sourcing Performance Guide

This guide provides comprehensive recommendations for optimizing EventLite Sourcing performance, with detailed analysis of write performance impacts and configuration strategies.

## Table of Contents

- [Performance Overview](#performance-overview)
- [Write Performance Analysis](#write-performance-analysis)
- [Index Configuration Strategy](#index-configuration-strategy)
- [Performance Optimization Techniques](#performance-optimization-techniques)
- [Configuration Examples](#configuration-examples)
- [Monitoring and Benchmarking](#monitoring-and-benchmarking)
- [Best Practices](#best-practices)

## Performance Overview

EventLite Sourcing prioritizes write performance for event logs while providing configurable query optimization. The system supports three main performance profiles:

| Profile | Use Case | Write Speed | Query Speed | Index Count |
|---------|----------|-------------|-------------|-------------|
| **High-Volume Ingestion** | Real-time event streams | ~900 events/sec | Basic | 2 indexes |
| **Balanced Workload** | Mixed read/write | ~400 events/sec | Good | 4-5 indexes |
| **Query-Optimized** | Analytics/Reporting | ~220 events/sec | Excellent | 8 indexes |

## Write Performance Analysis

### Index Impact Testing

Performance testing with 1,000 events revealed the following write performance characteristics:

```
Configuration               Events/sec    Overhead    Index Count
─────────────────────────────────────────────────────────────────
Minimal indexes (baseline)      245         0%            2
Query-optimized                  230        -6%            5  
All indexes                      221       -10%            8
```

### Key Performance Factors

#### 1. Database Indexes
Each additional index adds approximately 1-2% write overhead:
- **Core indexes** (correlation_id, causation_id): Essential for functionality
- **Query indexes** (cmd, user, datetime): Moderate overhead, high query value
- **Composite indexes** (correlation_cmd, user_datetime): Highest overhead

#### 2. WAL Mode
SQLite Write-Ahead Logging provides significant performance benefits:
```
Mode                Events/sec    Improvement
────────────────────────────────────────────
Default mode            245           -
WAL enabled             902         +267%
```

#### 3. Bulk Operations
Bulk operations dramatically improve throughput:
```
Operation Type          Events/sec    Improvement
────────────────────────────────────────────────
Individual writes          245           -
Bulk writes               9,560       +3,800%
```

## Index Configuration Strategy

### Available Indexes

EventLite Sourcing provides 8 configurable indexes:

```javascript
const indexConfig = {
  // Core indexes (recommended to keep)
  correlation_id: true,     // Event transaction grouping
  causation_id: true,       // Event relationship tracking
  
  // Query performance indexes (selective)
  cmd: false,               // Command-based filtering
  user: false,              // User-based queries
  datetime: false,          // Time-range queries
  version: false,           // Version-based filtering
  
  // Composite indexes (highest overhead)
  correlation_cmd: false,   // Correlation + command queries
  user_datetime: false,     // User + time range queries
};
```

### Index Selection Guidelines

#### Essential Indexes (Always Enable)
- **correlation_id**: Required for transaction grouping
- **causation_id**: Required for event relationship tracking

#### Performance Indexes (Enable Based on Usage)
- **cmd**: Enable if you frequently filter by command type
- **datetime**: Enable if you perform time-range queries
- **user**: Enable if you analyze events by user
- **version**: Enable only if you use event migrations

#### Composite Indexes (Use Sparingly)
- **correlation_cmd**: Only if you frequently query correlation + command
- **user_datetime**: Only if you frequently query user + time range

## Performance Optimization Techniques

### 1. Write Optimization

#### Enable WAL Mode
```javascript
const eventQueue = initQueue({
  WAL: true,  // 4x performance improvement
  dbName: "data/events.sqlite"
});
```

#### Use Bulk Operations
```javascript
// Instead of individual writes
events.forEach(event => eventQueue.store(event, model, callbacks));

// Use bulk operations (40x faster)
eventQueue.storeBulk(events, model, callbacks);
```

#### Minimal Index Configuration
```javascript
const highSpeedConfig = {
  indexes: {
    correlation_id: true,
    causation_id: true,
    // All others: false
  }
};
```

### 2. Query Optimization

#### Enable Query Caching
```javascript
const eventQueue = initQueue({
  cache: {
    enabled: true,
    maxSize: 5000,      // Larger cache for read-heavy workloads
    ttl: 600000,        // 10 minutes
  }
});
```

#### Use Pagination for Large Results
```javascript
// Instead of loading all results
const allEvents = eventQueue.getByCorrelationId(correlationId);

// Use pagination
const page = eventQueue.getByCorrelationIdPaginated(correlationId, {
  limit: 100,
  offset: 0
});
```

#### Streaming for Large Datasets
```javascript
// Memory-efficient processing of large datasets
for await (const batch of eventQueue.streamEvents({ batchSize: 1000 })) {
  await processBatch(batch);
}
```

### 3. Cache Management

#### Cache Strategy by Workload
```javascript
// Write-heavy: Disable cache during writes
const writeOptimized = { cache: { enabled: false } };

// Read-heavy: Large cache with long TTL
const readOptimized = { 
  cache: { 
    enabled: true, 
    maxSize: 10000, 
    ttl: 1800000  // 30 minutes
  } 
};

// Balanced: Moderate cache settings
const balanced = { 
  cache: { 
    enabled: true, 
    maxSize: 1000, 
    ttl: 300000   // 5 minutes
  } 
};
```

## Configuration Examples

### 1. High-Volume Ingestion (Maximum Write Speed)

**Use Case**: Real-time event streams, IoT data, high-frequency trading

```javascript
import { initQueue } from 'eventlite-sourcing';

const highVolumeConfig = {
  dbName: "data/high-volume-events.sqlite",
  WAL: true,
  
  indexes: {
    correlation_id: true,
    causation_id: true,
    cmd: false,
    user: false,
    datetime: false,
    version: false,
    correlation_cmd: false,
    user_datetime: false,
  },
  
  cache: { enabled: false }  // No cache overhead on writes
};

const eventQueue = initQueue(highVolumeConfig);
// Expected: ~900 events/sec
```

### 2. Balanced Workload (Mixed Read/Write)

**Use Case**: Web applications, moderate analytics, general purpose

```javascript
const balancedConfig = {
  dbName: "data/balanced-events.sqlite",
  WAL: true,
  
  indexes: {
    correlation_id: true,
    causation_id: true,
    cmd: true,            // Enable for command filtering
    user: false,          // Skip unless user queries are common
    datetime: true,       // Enable for time-range queries
    version: false,       // Skip unless doing migrations
    correlation_cmd: false,
    user_datetime: false,
  },
  
  cache: {
    enabled: true,
    maxSize: 1000,
    ttl: 300000,          // 5 minutes
  }
};

const eventQueue = initQueue(balancedConfig);
// Expected: ~400 events/sec
```

### 3. Query-Optimized (Maximum Query Performance)

**Use Case**: Analytics, reporting, complex queries, read-heavy workloads

```javascript
const queryOptimizedConfig = {
  dbName: "data/query-optimized-events.sqlite",
  WAL: true,
  
  indexes: {
    correlation_id: true,
    causation_id: true,
    cmd: true,
    user: true,
    datetime: true,
    version: true,
    correlation_cmd: true,    // Enable for complex correlation queries
    user_datetime: false,     // Still skip most expensive composite
  },
  
  cache: {
    enabled: true,
    maxSize: 5000,           // Larger cache
    ttl: 600000,             // 10 minutes
  }
};

const eventQueue = initQueue(queryOptimizedConfig);
// Expected: ~220 events/sec, excellent query performance
```

### 4. Dynamic Configuration

```javascript
function createOptimalEventQueue(workloadType) {
  const baseConfig = {
    WAL: true,
    indexes: {
      correlation_id: true,
      causation_id: true,
    }
  };

  switch (workloadType) {
    case 'high-volume-ingestion':
      return initQueue({
        ...baseConfig,
        cache: { enabled: false },
        indexes: { ...baseConfig.indexes }  // Only core indexes
      });

    case 'real-time-analytics':
      return initQueue({
        ...baseConfig,
        cache: { enabled: true, maxSize: 1000, ttl: 300000 },
        indexes: {
          ...baseConfig.indexes,
          cmd: true,
          datetime: true,
        }
      });

    case 'comprehensive-reporting':
      return initQueue({
        ...baseConfig,
        cache: { enabled: true, maxSize: 5000, ttl: 600000 },
        indexes: {
          ...baseConfig.indexes,
          cmd: true,
          user: true,
          datetime: true,
          version: true,
          correlation_cmd: true,
        }
      });

    default:
      return initQueue(balancedConfig);
  }
}
```

## Monitoring and Benchmarking

### Performance Testing

```javascript
import { performance } from 'perf_hooks';

async function benchmarkWrites(eventQueue, model, eventCount = 1000) {
  const events = Array.from({ length: eventCount }, (_, i) => ({
    cmd: "testEvent",
    data: { id: i, timestamp: Date.now() },
    user: `user${i % 10}`,
  }));

  const startTime = performance.now();
  
  for (const event of events) {
    await eventQueue.store(event, model, eventCallbacks.void);
  }
  
  const endTime = performance.now();
  const duration = endTime - startTime;
  const eventsPerSecond = (eventCount / duration) * 1000;

  return {
    duration,
    eventsPerSecond,
    avgTimePerEvent: duration / eventCount,
  };
}
```

### Cache Performance Monitoring

```javascript
// Monitor cache effectiveness
const stats = eventQueue.getCacheStats();
console.log({
  enabled: stats.enabled,
  hitRate: stats.hits / (stats.hits + stats.misses),
  size: stats.size,
  maxSize: stats.maxSize,
});
```

### Query Performance Analysis

```javascript
// Time expensive queries
console.time('correlation-query');
const events = eventQueue.getByCorrelationIdPaginated(correlationId, {
  limit: 100,
  offset: 0
});
console.timeEnd('correlation-query');

// Monitor pagination effectiveness
console.log({
  totalEvents: events.totalCount,
  pageSize: events.events.length,
  hasMore: events.hasMore,
  nextOffset: events.nextOffset,
});
```

## Best Practices

### 1. Index Strategy

#### Start Minimal
```javascript
// Begin with core indexes only
const initialConfig = {
  indexes: {
    correlation_id: true,
    causation_id: true,
    // All others: false
  }
};
```

#### Add Incrementally
1. Monitor actual query patterns
2. Add indexes for frequent query types
3. Measure write performance impact after each addition
4. Remove unused indexes

#### Index Priority Order
1. `correlation_id`, `causation_id` (always keep)
2. `datetime` (most commonly useful)
3. `cmd` (useful for filtering by event type)
4. `user` (only if user-based queries are frequent)
5. `version` (only for migration scenarios)
6. Composite indexes (use very sparingly)

### 2. Write Optimization

#### Batch Processing
```javascript
// Collect events in batches
const eventBatch = [];
events.forEach(event => {
  eventBatch.push(event);
  
  if (eventBatch.length >= 100) {
    eventQueue.storeBulk(eventBatch, model, callbacks);
    eventBatch.length = 0;  // Clear batch
  }
});

// Process remaining events
if (eventBatch.length > 0) {
  eventQueue.storeBulk(eventBatch, model, callbacks);
}
```

#### Asynchronous Processing
```javascript
// For non-critical events, consider async processing
async function storeEventAsync(event, model, callbacks) {
  return new Promise(resolve => {
    setImmediate(() => {
      eventQueue.store(event, model, callbacks);
      resolve();
    });
  });
}
```

### 3. Query Optimization

#### Use Appropriate Query Methods
```javascript
// For large result sets
const page = eventQueue.getByCorrelationIdPaginated(correlationId);

// For cached frequent queries
const cachedEvent = eventQueue.retrieveByIDCached(eventId);

// For memory-efficient large datasets
for await (const batch of eventQueue.streamEvents()) {
  await processEventsInBatch(batch);
}
```

#### Cache Management
```javascript
// Clear cache during bulk operations
eventQueue.clearCache();
eventQueue.storeBulk(largeEventArray, model, callbacks);

// Warm cache for frequent queries
frequentlyAccessedIds.forEach(id => {
  eventQueue.retrieveByIDCached(id);
});
```

### 4. Configuration Management

#### Environment-Based Configuration
```javascript
const getEventQueueConfig = () => {
  const env = process.env.NODE_ENV;
  
  switch (env) {
    case 'production':
      return {
        WAL: true,
        indexes: productionIndexes,
        cache: { enabled: true, maxSize: 5000, ttl: 600000 }
      };
      
    case 'development':
      return {
        WAL: true,
        indexes: developmentIndexes,
        cache: { enabled: true, maxSize: 100, ttl: 60000 }
      };
      
    case 'test':
      return {
        WAL: false,  // Faster cleanup in tests
        indexes: minimalIndexes,
        cache: { enabled: false }
      };
  }
};
```

#### Performance Monitoring
```javascript
// Log performance metrics
setInterval(() => {
  const stats = eventQueue.getCacheStats();
  console.log('EventQueue Performance:', {
    cacheSize: stats.size,
    cacheEnabled: stats.enabled,
    timestamp: new Date().toISOString(),
  });
}, 60000);  // Every minute
```

## Troubleshooting Performance Issues

### Slow Writes
1. **Check index count**: Disable unnecessary indexes
2. **Enable WAL mode**: Can provide 4x improvement
3. **Use bulk operations**: 40x faster than individual writes
4. **Disable cache during bulk imports**

### Slow Queries
1. **Add relevant indexes**: Based on query patterns
2. **Enable query caching**: For frequently accessed data
3. **Use pagination**: For large result sets
4. **Consider read replicas**: For heavy analytics workloads

### Memory Issues
1. **Use streaming**: For large dataset processing
2. **Reduce cache size**: Lower maxSize setting
3. **Implement pagination**: Instead of loading all results
4. **Clear cache periodically**: During bulk operations

### Index Bloat
1. **Audit index usage**: Remove unused indexes
2. **Avoid composite indexes**: Unless absolutely necessary
3. **Monitor write performance**: After index changes
4. **Use EXPLAIN QUERY PLAN**: To verify index usage

## Conclusion

EventLite Sourcing provides flexible performance tuning through configurable indexes, caching strategies, and optimization techniques. The key is to:

1. **Start with minimal configuration** for maximum write speed
2. **Add indexes incrementally** based on actual query patterns
3. **Monitor performance** after each configuration change
4. **Use appropriate techniques** (bulk operations, WAL mode, caching) for your workload

By following these guidelines, you can achieve optimal performance for your specific event sourcing requirements while maintaining the flexibility to adapt as your needs evolve.