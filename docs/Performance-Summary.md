# Performance & Scalability Features Summary

## Overview

EventLite Sourcing now includes comprehensive performance and scalability enhancements designed to optimize both write throughput and query performance based on your specific use case.

## Key Performance Improvements

### 🚀 Write Performance
- **10% overhead** for additional indexes (245 → 221 events/sec)
- **4x improvement** with WAL mode (245 → 902 events/sec)
- **40x improvement** with bulk operations (245 → 9,560 events/sec)

### 📊 Query Performance
- **LRU caching** with configurable TTL and size limits
- **Pagination support** for all major query operations
- **Streaming capabilities** for memory-efficient large dataset processing
- **8 configurable indexes** for optimal query speed

### ⚙️ Configurable Performance Profiles

| Profile | Write Speed | Use Case | Indexes |
|---------|-------------|----------|---------|
| **High-Volume** | ~900 events/sec | Real-time ingestion | 2 core |
| **Balanced** | ~400 events/sec | Mixed workloads | 4-5 selective |
| **Query-Optimized** | ~220 events/sec | Analytics/reporting | 8 full |

## New Features

### Database Indexing
```javascript
const eventQueue = initQueue({
  indexes: {
    correlation_id: true,    // Core functionality
    causation_id: true,      // Core functionality
    cmd: false,              // Query optimization
    user: false,             // Query optimization
    datetime: false,         // Query optimization
    version: false,          // Query optimization
    correlation_cmd: false,  // Composite queries
    user_datetime: false,    // Composite queries
  }
});
```

### Query Caching
```javascript
// Cached versions of expensive operations
const event = eventQueue.retrieveByIDCached(id);
const transaction = eventQueue.getTransactionCached(correlationId);

// Cache management
const stats = eventQueue.getCacheStats();
eventQueue.clearCache();
```

### Pagination
```javascript
const page = eventQueue.getByCorrelationIdPaginated(correlationId, {
  limit: 100,
  offset: 0
});
// Returns: { events, totalCount, hasMore, nextOffset }
```

### Streaming
```javascript
for await (const batch of eventQueue.streamEvents({ batchSize: 1000 })) {
  await processBatch(batch);
}
```

### Bulk Operations
```javascript
// High-performance bulk inserts
const results = eventQueue.storeBulk(events, model, callbacks);

// Bulk export/import utilities
const bulkOps = new BulkOperations(eventQueue);
await bulkOps.exportToJSONL('events.jsonl');
await bulkOps.importFromJSONL('events.jsonl');
```

### Background Jobs
```javascript
const jobQueue = new BackgroundJobQueue();
const eventJobProcessor = new EventJobProcessor(eventQueue, jobQueue);

// Register job workers
jobQueue.registerWorker('sendEmail', async (data) => {
  await sendEmail(data.recipient, data.message);
});

// Trigger jobs from events
eventJobProcessor.onEvent('userRegistered', 'sendEmail', (eventRow) => ({
  recipient: eventRow.data.email,
  message: 'Welcome!'
}));
```

## Quick Start

### Maximum Write Speed
```javascript
import { initQueue } from 'eventlite-sourcing';

const fastQueue = initQueue({
  WAL: true,
  indexes: {
    correlation_id: true,
    causation_id: true,
    // All others: false
  },
  cache: { enabled: false }
});
// ~900 events/sec
```

### Balanced Performance
```javascript
const balancedQueue = initQueue({
  WAL: true,
  indexes: {
    correlation_id: true,
    causation_id: true,
    cmd: true,
    datetime: true,
    // Others: false
  },
  cache: { enabled: true, maxSize: 1000, ttl: 300000 }
});
// ~400 events/sec
```

### Query Optimized
```javascript
const queryQueue = initQueue({
  WAL: true,
  indexes: {
    correlation_id: true,
    causation_id: true,
    cmd: true,
    user: true,
    datetime: true,
    version: true,
    correlation_cmd: true,
    // user_datetime: false (still skip most expensive)
  },
  cache: { enabled: true, maxSize: 5000, ttl: 600000 }
});
// ~220 events/sec, excellent query performance
```

## Documentation

- **[Performance Guide](./Performance-Guide.md)** - Comprehensive performance optimization guide
- **[High-Performance Config Examples](../examples/high-performance-config.js)** - Ready-to-use configurations
- **[Performance Tests](../tests/write-performance.test.js)** - Benchmarking utilities

## Best Practices

1. **Start minimal** - Use only core indexes initially
2. **Enable WAL mode** - 4x performance improvement
3. **Use bulk operations** - 40x faster for batch processing  
4. **Add indexes incrementally** - Based on actual query patterns
5. **Monitor performance** - Test after each configuration change
6. **Choose appropriate profile** - Based on your workload characteristics

## Migration from Previous Versions

The new performance features are backward compatible. Existing code will continue to work with default optimized settings. To take advantage of new features:

1. Update to the latest version
2. Choose an appropriate performance profile
3. Configure indexes based on your query patterns
4. Enable caching for read-heavy workloads
5. Use bulk operations for large data imports

For detailed migration instructions and performance tuning, see the [Performance Guide](./Performance-Guide.md).