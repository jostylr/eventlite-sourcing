import { initQueue } from "../lib/event-source.js";

/**
 * High-Performance Event Queue Configuration
 * Optimized for maximum write throughput in event sourcing systems
 */

// Configuration 1: Maximum Write Speed (Minimal Indexes)
// Best for: High-volume event ingestion, real-time systems
const maxWriteSpeedConfig = {
  dbName: "data/high-speed-events.sqlite",
  WAL: true, // Enable WAL mode for better write performance
  
  indexes: {
    // Keep only essential indexes for core functionality
    correlation_id: true,  // Required for transaction grouping
    causation_id: true,    // Required for event relationships
    
    // Disable all performance indexes for maximum write speed
    cmd: false,           // ❌ Skip if you don't query by command frequently
    user: false,          // ❌ Skip if you don't query by user frequently
    datetime: false,      // ❌ Skip if you don't do time-range queries
    version: false,       // ❌ Skip if you don't query by version
    correlation_cmd: false,    // ❌ Skip composite indexes (highest overhead)
    user_datetime: false,      // ❌ Skip composite indexes
  },
  
  cache: {
    enabled: false,       // Disable cache for writes, enable for reads
  }
};

// Configuration 2: Balanced Performance (Selective Indexes)
// Best for: Mixed read/write workloads, moderate query requirements
const balancedConfig = {
  dbName: "data/balanced-events.sqlite",
  WAL: true,
  
  indexes: {
    correlation_id: true,
    causation_id: true,
    cmd: true,            // ✅ Enable if you query by command type
    user: false,          // ❌ Only enable if user queries are critical
    datetime: true,       // ✅ Enable for time-range queries (common)
    version: false,       // ❌ Usually not needed unless doing migrations
    correlation_cmd: false,    // ❌ Skip expensive composite indexes
    user_datetime: false,
  },
  
  cache: {
    enabled: true,
    maxSize: 1000,
    ttl: 300000, // 5 minutes
  }
};

// Configuration 3: Query-Optimized (Full Indexes)
// Best for: Read-heavy workloads, complex analytics, reporting systems
const queryOptimizedConfig = {
  dbName: "data/query-optimized-events.sqlite",
  WAL: true,
  
  indexes: {
    correlation_id: true,
    causation_id: true,
    cmd: true,            // ✅ Enable for command-based queries
    user: true,           // ✅ Enable for user-based analytics
    datetime: true,       // ✅ Enable for time-series analysis
    version: true,        // ✅ Enable for migration scenarios
    correlation_cmd: true,     // ✅ Enable for complex correlation queries
    user_datetime: false,      // ❌ Still skip most expensive composite
  },
  
  cache: {
    enabled: true,
    maxSize: 5000,        // Larger cache for read optimization
    ttl: 600000,          // 10 minutes
  }
};

/**
 * Dynamic Configuration Based on Usage Patterns
 */
function createOptimalConfig(usagePattern) {
  const baseConfig = {
    WAL: true, // Always enable WAL for better performance
    cache: { enabled: true, maxSize: 1000, ttl: 300000 },
    indexes: {
      correlation_id: true,  // Always keep core functionality
      causation_id: true,
    }
  };

  switch (usagePattern) {
    case 'high-volume-ingestion':
      return {
        ...baseConfig,
        cache: { enabled: false }, // No cache overhead on writes
        indexes: {
          ...baseConfig.indexes,
          // All others false for maximum write speed
          cmd: false,
          user: false,
          datetime: false,
          version: false,
          correlation_cmd: false,
          user_datetime: false,
        }
      };

    case 'real-time-analytics':
      return {
        ...baseConfig,
        indexes: {
          ...baseConfig.indexes,
          cmd: true,      // Need command filtering
          datetime: true, // Need time-range queries
          user: false,    // Skip if not doing user analytics
          version: false,
          correlation_cmd: false,
          user_datetime: false,
        }
      };

    case 'comprehensive-reporting':
      return {
        ...baseConfig,
        cache: { enabled: true, maxSize: 5000, ttl: 600000 },
        indexes: {
          ...baseConfig.indexes,
          cmd: true,
          user: true,
          datetime: true,
          version: true,
          correlation_cmd: true,
          user_datetime: false, // Still skip the most expensive
        }
      };

    default:
      return balancedConfig;
  }
}

/**
 * Performance Best Practices for Event Sourcing
 */
const performanceTips = {
  writes: [
    "Use WAL mode (4x performance improvement)",
    "Minimize indexes for write-heavy workloads", 
    "Use bulk operations when possible (40x faster)",
    "Disable cache during bulk imports",
    "Consider async writes for non-critical events"
  ],
  
  reads: [
    "Enable query caching for frequently accessed data",
    "Add indexes for your specific query patterns",
    "Use pagination for large result sets",
    "Consider read replicas for analytics"
  ],
  
  indexStrategy: [
    "Start with minimal indexes (correlation_id, causation_id)",
    "Add indexes incrementally based on actual query patterns",
    "Monitor write performance after adding each index",
    "Composite indexes have the highest overhead - use sparingly",
    "cmd and datetime indexes are most commonly useful"
  ]
};

// Example usage
export function createHighPerformanceEventQueue(pattern = 'balanced') {
  const config = createOptimalConfig(pattern);
  return initQueue(config);
}

export {
  maxWriteSpeedConfig,
  balancedConfig,
  queryOptimizedConfig,
  performanceTips
};

// Usage examples:
// const fastQueue = initQueue(maxWriteSpeedConfig);     // ~900 events/sec
// const balancedQueue = initQueue(balancedConfig);      // ~400 events/sec  
// const queryQueue = initQueue(queryOptimizedConfig);   // ~220 events/sec