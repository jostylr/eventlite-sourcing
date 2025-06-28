import { describe, test, expect } from "bun:test";
import { EventQueryEngine } from "../lib/event-querying.js";
import { initQueue, eventCallbacks } from "../lib/event-source.js";
import { modelSetup } from "../lib/model.js";
import { existsSync, rmSync } from "fs";

describe("EventQueryEngine Simple Tests", () => {
  test("should initialize and handle empty database", () => {
    const testDbPath = "tests/data/simple-query-test.sqlite";
    
    // Clean up any existing test database
    if (existsSync(testDbPath)) {
      rmSync(testDbPath);
    }

    // Initialize event queue with test data
    const eventQueue = initQueue({ 
      dbName: testDbPath,
      init: { create: true }
    });

    try {
      // Initialize query engine
      const queryEngine = new EventQueryEngine(testDbPath);

      try {
        // Test with empty database
        const rootEvents = queryEngine.getRootEvents();
        expect(rootEvents).toHaveLength(0);
        
        const orphaned = queryEngine.findOrphanedEvents();
        expect(orphaned).toHaveLength(0);

        console.log("✅ Empty database tests passed");
      } finally {
        queryEngine.close();
      }
    } finally {
      eventQueue._db?.close();
      if (existsSync(testDbPath)) {
        rmSync(testDbPath);
      }
    }
  });

  test("should work with basic events", () => {
    const testDbPath = "tests/data/basic-query-test.sqlite";
    
    // Clean up any existing test database
    if (existsSync(testDbPath)) {
      rmSync(testDbPath);
    }

    // Initialize event queue
    const eventQueue = initQueue({ 
      dbName: testDbPath,
      risky: true
    });

    try {
      // Set up a simple model
      const model = modelSetup({
        dbName: ":memory:",
        stub: true,
        default: () => "", // Silent default for unknown commands
      });

      // Store a simple event
      eventQueue.store({
        cmd: "testCommand",
        data: { test: "data" },
        correlationId: "test-corr"
      }, model, eventCallbacks.void);

      // Initialize query engine
      const queryEngine = new EventQueryEngine(testDbPath);

      try {
        // Test basic queries
        const rootEvents = queryEngine.getRootEvents();
        expect(rootEvents).toHaveLength(1);
        expect(rootEvents[0].cmd).toBe("testCommand");
        
        const correlationEvents = queryEngine.getEventsByCorrelationId("test-corr");
        expect(correlationEvents).toHaveLength(1);
        
        console.log("✅ Basic events tests passed");
      } finally {
        queryEngine.close();
      }
    } finally {
      eventQueue._db?.close();
      if (existsSync(testDbPath)) {
        rmSync(testDbPath);
      }
    }
  });
});