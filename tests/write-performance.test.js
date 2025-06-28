import { test, expect, beforeEach, afterEach } from "bun:test";
import { initQueue, eventCallbacks } from "../lib/event-source.js";
import { modelSetup } from "../lib/model.js";
import { unlinkSync, existsSync } from "fs";

const testDbPath = "data/test-write-performance.sqlite";

beforeEach(() => {
  if (existsSync(testDbPath)) {
    unlinkSync(testDbPath);
  }
});

afterEach(() => {
  if (existsSync(testDbPath)) {
    unlinkSync(testDbPath);
  }
});

// Simple model for testing
const createTestModel = (dbPath) => modelSetup({
  dbName: dbPath,
  tables: (db) => {
    db.exec("CREATE TABLE IF NOT EXISTS testEvents (id INTEGER PRIMARY KEY, data TEXT)");
  },
  queries: (db) => ({
    logEvent: db.prepare("INSERT INTO testEvents (data) VALUES (?) RETURNING *"),
  }),
  methods: (queries) => ({
    logEvent: function(data) {
      return queries.logEvent.get(JSON.stringify(data));
    },
  }),
});

async function measureWritePerformance(indexConfig, eventCount = 1000) {
  const eventQueue = initQueue({
    dbName: testDbPath,
    indexes: indexConfig,
    cache: { enabled: false }, // Disable cache to measure pure write performance
  });

  const model = createTestModel(testDbPath);

  const events = Array.from({ length: eventCount }, (_, i) => ({
    cmd: "logEvent",
    data: { message: `Test event ${i}`, timestamp: Date.now() + i },
    user: `user${i % 10}`, // 10 different users
    correlationId: `correlation-${Math.floor(i / 100)}`, // Group every 100 events
  }));

  const startTime = performance.now();
  
  for (const event of events) {
    eventQueue.store(event, model, eventCallbacks.void);
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

test("Write performance: minimal indexes (fastest writes)", async () => {
  const minimalIndexes = {
    correlation_id: true,  // Keep for basic functionality
    causation_id: true,    // Keep for basic functionality
    cmd: false,
    user: false,
    datetime: false,
    version: false,
    correlation_cmd: false,
    user_datetime: false,
  };

  const result = await measureWritePerformance(minimalIndexes, 1000);
  
  console.log("Minimal indexes performance:");
  console.log(`  Duration: ${result.duration.toFixed(2)}ms`);
  console.log(`  Events/sec: ${result.eventsPerSecond.toFixed(0)}`);
  console.log(`  Avg time per event: ${result.avgTimePerEvent.toFixed(3)}ms`);
  
  expect(result.eventsPerSecond).toBeGreaterThan(500); // Should be fast
});

test("Write performance: query-optimized indexes (slower writes)", async () => {
  const optimizedIndexes = {
    correlation_id: true,
    causation_id: true,
    cmd: true,           // Enable for query performance
    user: true,          // Enable for user queries
    datetime: true,      // Enable for time-range queries
    version: false,      // Usually not needed
    correlation_cmd: true,    // Enable for complex queries
    user_datetime: false,     // Skip to reduce overhead
  };

  const result = await measureWritePerformance(optimizedIndexes, 1000);
  
  console.log("Query-optimized indexes performance:");
  console.log(`  Duration: ${result.duration.toFixed(2)}ms`);
  console.log(`  Events/sec: ${result.eventsPerSecond.toFixed(0)}`);
  console.log(`  Avg time per event: ${result.avgTimePerEvent.toFixed(3)}ms`);
  
  expect(result.eventsPerSecond).toBeGreaterThan(200); // Slower but still reasonable
});

test("Write performance: all indexes (maximum overhead)", async () => {
  const allIndexes = {
    correlation_id: true,
    causation_id: true,
    cmd: true,
    user: true,
    datetime: true,
    version: true,
    correlation_cmd: true,
    user_datetime: true,
  };

  const result = await measureWritePerformance(allIndexes, 1000);
  
  console.log("All indexes performance:");
  console.log(`  Duration: ${result.duration.toFixed(2)}ms`);
  console.log(`  Events/sec: ${result.eventsPerSecond.toFixed(0)}`);
  console.log(`  Avg time per event: ${result.avgTimePerEvent.toFixed(3)}ms`);
  
  expect(result.eventsPerSecond).toBeGreaterThan(100); // Much slower
});

test("Bulk write performance comparison", async () => {
  const minimalIndexes = {
    correlation_id: true,
    causation_id: true,
    cmd: false,
    user: false,
    datetime: false,
    version: false,
    correlation_cmd: false,
    user_datetime: false,
  };

  const eventQueue = initQueue({
    dbName: testDbPath,
    indexes: minimalIndexes,
    cache: { enabled: false },
  });

  const model = createTestModel(testDbPath);

  const events = Array.from({ length: 1000 }, (_, i) => ({
    cmd: "logEvent",
    data: { message: `Bulk event ${i}` },
    user: `user${i % 10}`,
  }));

  const startTime = performance.now();
  eventQueue.storeBulk(events, model, eventCallbacks.void);
  const endTime = performance.now();

  const duration = endTime - startTime;
  const eventsPerSecond = (1000 / duration) * 1000;

  console.log("Bulk write performance (minimal indexes):");
  console.log(`  Duration: ${duration.toFixed(2)}ms`);
  console.log(`  Events/sec: ${eventsPerSecond.toFixed(0)}`);
  
  expect(eventsPerSecond).toBeGreaterThan(1000); // Bulk should be much faster
});

test("WAL mode impact on write performance", async () => {
  const eventQueue = initQueue({
    dbName: testDbPath,
    WAL: true, // Enable WAL mode
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
    cache: { enabled: false },
  });

  const model = createTestModel(testDbPath);

  const events = Array.from({ length: 500 }, (_, i) => ({
    cmd: "logEvent",
    data: { message: `WAL test event ${i}` },
    user: `user${i % 5}`,
  }));

  const startTime = performance.now();
  for (const event of events) {
    eventQueue.store(event, model, eventCallbacks.void);
  }
  const endTime = performance.now();

  const duration = endTime - startTime;
  const eventsPerSecond = (500 / duration) * 1000;

  console.log("WAL mode write performance:");
  console.log(`  Duration: ${duration.toFixed(2)}ms`);
  console.log(`  Events/sec: ${eventsPerSecond.toFixed(0)}`);
  
  expect(eventsPerSecond).toBeGreaterThan(300); // WAL should help with writes
});