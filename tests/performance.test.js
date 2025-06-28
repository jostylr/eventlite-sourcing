import { test, expect, beforeEach, afterEach } from "bun:test";
import { initQueue, eventCallbacks } from "../lib/event-source.js";
import { BulkOperations } from "../lib/bulk-operations.js";
import { BackgroundJobQueue, EventJobProcessor } from "../lib/background-jobs.js";
import { modelSetup } from "../lib/model.js";
import { unlinkSync, existsSync } from "fs";

const testDbPath = "data/test-performance.sqlite";

beforeEach(() => {
  // Clean up any existing test database
  if (existsSync(testDbPath)) {
    unlinkSync(testDbPath);
  }
});

afterEach(() => {
  // Clean up test database
  if (existsSync(testDbPath)) {
    unlinkSync(testDbPath);
  }
});

test("Query caching functionality", async () => {
  const eventQueue = initQueue({
    dbName: testDbPath,
    cache: { enabled: true, maxSize: 100, ttl: 10000 },
  });

  // Create a simple model
  const model = modelSetup({
    dbName: testDbPath,
    tables: (db) => {
      db.exec("CREATE TABLE IF NOT EXISTS testUser (id INTEGER PRIMARY KEY, name TEXT)");
    },
    queries: (db) => ({
      createUser: db.prepare("INSERT INTO testUser (name) VALUES (?) RETURNING *"),
    }),
    methods: (queries) => ({
      createUser: function(data) {
        return queries.createUser.get(data.name);
      },
    }),
  });

  // Store some test events
  const event1 = eventQueue.store({
    cmd: "createUser",
    data: { name: "Alice" },
    user: "system",
  }, model, eventCallbacks.void);

  const event2 = eventQueue.store({
    cmd: "createUser", 
    data: { name: "Bob" },
    user: "system",
  }, model, eventCallbacks.void);

  // Test cached retrieval
  const cached1 = eventQueue.retrieveByIDCached(event1.id);
  const cached2 = eventQueue.retrieveByIDCached(event1.id); // Should come from cache

  expect(cached1).toBeDefined();
  expect(cached1.id).toBe(event1.id);
  expect(cached2.id).toBe(event1.id);

  // Test cache stats
  const stats = eventQueue.getCacheStats();
  expect(stats.enabled).toBe(true);
  expect(stats.size).toBeGreaterThan(0);

  // Test cache clearing
  eventQueue.clearCache();
  const clearedStats = eventQueue.getCacheStats();
  expect(clearedStats.size).toBe(0);
});

test("Pagination functionality", async () => {
  const eventQueue = initQueue({ dbName: testDbPath });
  const model = modelSetup({
    dbName: testDbPath,
    tables: (db) => {
      db.exec("CREATE TABLE IF NOT EXISTS testUser (id INTEGER PRIMARY KEY, name TEXT)");
    },
    queries: (db) => ({
      createUser: db.prepare("INSERT INTO testUser (name) VALUES (?) RETURNING *"),
    }),
    methods: (queries) => ({
      createUser: function(data) {
        return queries.createUser.get(data.name);
      },
    }),
  });

  const correlationId = "test-correlation-123";

  // Create multiple events with same correlation ID
  for (let i = 0; i < 15; i++) {
    eventQueue.store({
      cmd: "createUser",
      data: { name: `User${i}` },
      user: "system",
      correlationId,
    }, model, eventCallbacks.void);
  }

  // Test paginated correlation query
  const page1 = eventQueue.getByCorrelationIdPaginated(correlationId, { limit: 5, offset: 0 });
  expect(page1.events).toHaveLength(5);
  expect(page1.totalCount).toBe(15);
  expect(page1.hasMore).toBe(true);
  expect(page1.nextOffset).toBe(5);

  const page2 = eventQueue.getByCorrelationIdPaginated(correlationId, { limit: 5, offset: 5 });
  expect(page2.events).toHaveLength(5);
  expect(page2.hasMore).toBe(true);

  const page3 = eventQueue.getByCorrelationIdPaginated(correlationId, { limit: 5, offset: 10 });
  expect(page3.events).toHaveLength(5);
  expect(page3.hasMore).toBe(false);
  expect(page3.nextOffset).toBe(null);
});

test("Bulk operations functionality", async () => {
  const eventQueue = initQueue({ dbName: testDbPath });
  const model = modelSetup({
    dbName: testDbPath,
    tables: (db) => {
      db.exec("CREATE TABLE IF NOT EXISTS testUser (id INTEGER PRIMARY KEY, name TEXT)");
    },
    queries: (db) => ({
      createUser: db.prepare("INSERT INTO testUser (name) VALUES (?) RETURNING *"),
    }),
    methods: (queries) => ({
      createUser: function(data) {
        return queries.createUser.get(data.name);
      },
    }),
  });

  // Test bulk insert
  const bulkEvents = [];
  for (let i = 0; i < 10; i++) {
    bulkEvents.push({
      cmd: "createUser",
      data: { name: `BulkUser${i}` },
      user: "system",
    });
  }

  const bulkResults = eventQueue.storeBulk(bulkEvents, model, eventCallbacks.void);
  expect(bulkResults).toHaveLength(10);
  expect(bulkResults[0].row.id).toBeDefined();

  // Test bulk operations utility
  const bulkOps = new BulkOperations(eventQueue);
  
  // Test processing stats
  const stats = await bulkOps.getProcessingStats();
  expect(stats.totalEvents).toBe(10);
  expect(stats.eventsByCommand.createUser).toBe(10);
});

test("Streaming functionality", async () => {
  const eventQueue = initQueue({ dbName: testDbPath });
  const model = modelSetup({
    dbName: testDbPath,
    tables: (db) => {
      db.exec("CREATE TABLE IF NOT EXISTS testUser (id INTEGER PRIMARY KEY, name TEXT)");
    },
    queries: (db) => ({
      createUser: db.prepare("INSERT INTO testUser (name) VALUES (?) RETURNING *"),
    }),
    methods: (queries) => ({
      createUser: function(data) {
        return queries.createUser.get(data.name);
      },
    }),
  });

  // Create test events
  for (let i = 0; i < 25; i++) {
    eventQueue.store({
      cmd: "createUser",
      data: { name: `StreamUser${i}` },
      user: "system",
    }, model, eventCallbacks.void);
  }

  // Test streaming
  let totalEvents = 0;
  let batchCount = 0;
  
  for await (const batch of eventQueue.streamEvents({ batchSize: 10 })) {
    totalEvents += batch.length;
    batchCount++;
    expect(batch.length).toBeLessThanOrEqual(10);
  }

  expect(totalEvents).toBe(25);
  expect(batchCount).toBe(3); // 10 + 10 + 5
});

test("Background job queue functionality", async () => {
  const jobQueue = new BackgroundJobQueue({
    maxHistorySize: 100,
    defaultTimeout: 5000,
    processingIntervalMs: 100,
  });

  let processedData = null;

  // Register a test worker
  jobQueue.registerWorker("testJob", async (data, job) => {
    processedData = data;
    return { processed: true, jobId: job.id };
  });

  // Add a job
  const jobId = jobQueue.addJob("testJob", { message: "Hello World" });
  expect(jobId).toBeDefined();

  // Start processing
  jobQueue.start();

  // Wait for job to process
  await new Promise(resolve => setTimeout(resolve, 200));

  // Check job status
  const status = jobQueue.getJobStatus(jobId);
  expect(status?.status).toBe("completed");
  expect(processedData?.message).toBe("Hello World");

  // Check queue stats
  const stats = jobQueue.getQueueStats();
  expect(stats.recentCompletion.completed).toBe(1);

  jobQueue.stop();
});

test("Event-driven background jobs", async () => {
  const eventQueue = initQueue({ dbName: testDbPath });
  const jobQueue = new BackgroundJobQueue({ processingIntervalMs: 100 });
  const eventJobProcessor = new EventJobProcessor(eventQueue, jobQueue);

  const model = modelSetup({
    dbName: testDbPath,
    tables: (db) => {
      db.exec("CREATE TABLE IF NOT EXISTS testUser (id INTEGER PRIMARY KEY, name TEXT)");
    },
    queries: (db) => ({
      createUser: db.prepare("INSERT INTO testUser (name) VALUES (?) RETURNING *"),
    }),
    methods: (queries) => ({
      createUser: function(data) {
        return queries.createUser.get(data.name);
      },
    }),
  });

  let jobData = null;

  // Register worker for background job
  jobQueue.registerWorker("sendWelcomeEmail", async (data) => {
    jobData = data;
    return { emailSent: true };
  });

  // Register event to trigger background job
  eventJobProcessor.onEvent("createUser", "sendWelcomeEmail", (eventRow) => ({
    userName: eventRow.data.name,
    timestamp: Date.now(),
  }));

  // Start job processing
  jobQueue.start();

  // Create event callback that processes background jobs
  const eventCallback = {
    ...eventJobProcessor.createEventCallback(),
    createUser: (result, row) => {
      eventJobProcessor.processEvent(row, row);
    },
  };

  // Store event that should trigger background job
  const event = eventQueue.store({
    cmd: "createUser",
    data: { name: "Alice" },
    user: "system",
  }, model, eventCallback);

  // Wait for background job to process
  await new Promise(resolve => setTimeout(resolve, 200));

  expect(jobData).toBeDefined();
  expect(jobData.userName).toBe("Alice");

  jobQueue.stop();
});