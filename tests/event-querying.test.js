import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { EventQueryEngine } from "../lib/event-querying.js";
import { initQueue, eventCallbacks } from "../lib/event-source.js";
import { modelSetup } from "../lib/model.js";
import { existsSync, rmSync } from "fs";

describe("EventQueryEngine", () => {
  const testDbPath = "tests/data/event-querying-test.sqlite";
  let eventQueue;
  let queryEngine;
  let model;

  beforeEach(async () => {
    // Clean up any existing test database
    if (existsSync(testDbPath)) {
      rmSync(testDbPath);
    }

    // Initialize event queue with test data
    eventQueue = initQueue({ 
      dbName: testDbPath,
      risky: true
    });

    // Create stub model
    model = modelSetup({ dbName: ":memory:", stub: true });

    // Create test events with relationships
    createTestEvents();

    // Initialize query engine
    queryEngine = new EventQueryEngine(testDbPath);
  });

  afterEach(() => {
    queryEngine?.close();
    eventQueue?._db?.close();
    
    if (existsSync(testDbPath)) {
      rmSync(testDbPath);
    }
  });

  function createTestEvents() {
    // Root event 1 - User registration
    const correlationId1 = "corr-001";
    eventQueue.store({
      cmd: "userRegistered",
      data: { userId: "user1", email: "user1@test.com" },
      correlationId: correlationId1
    }, model, eventCallbacks.void);

    // Child events from user registration
    eventQueue.store({
      cmd: "sendWelcomeEmail",
      data: { userId: "user1", email: "user1@test.com" },
      correlationId: correlationId1,
      causationId: 1
    }, model, eventCallbacks.void);

    eventQueue.store({
      cmd: "createUserProfile",
      data: { userId: "user1" },
      correlationId: correlationId1,
      causationId: 1
    }, model, eventCallbacks.void);

    // Grandchild event
    eventQueue.store({
      cmd: "profileCreated",
      data: { userId: "user1", profileId: "prof1" },
      correlationId: correlationId1,
      causationId: 3
    }, model, eventCallbacks.void);

    // Root event 2 - Order placed (different correlation)
    const correlationId2 = "corr-002";
    eventQueue.store({
      cmd: "orderPlaced",
      data: { userId: "user1", orderId: "order1", amount: 100 },
      correlationId: correlationId2
    }, model, eventCallbacks.void);

    // Child events from order
    eventQueue.store({
      cmd: "validatePayment",
      data: { orderId: "order1", amount: 100 },
      correlationId: correlationId2,
      causationId: 5
    }, model, eventCallbacks.void);

    eventQueue.store({
      cmd: "checkInventory",
      data: { orderId: "order1" },
      correlationId: correlationId2,
      causationId: 5
    }, model, eventCallbacks.void);

    // Different branch from validatePayment
    eventQueue.store({
      cmd: "paymentApproved",
      data: { orderId: "order1" },
      correlationId: correlationId2,
      causationId: 6
    }, model, eventCallbacks.void);

    // Root event 3 - Another user registration
    const correlationId3 = "corr-003";
    eventQueue.store({
      cmd: "userRegistered",
      data: { userId: "user2", email: "user2@test.com" },
      correlationId: correlationId3
    }, model, eventCallbacks.void);
  }

  describe("Root Event Detection (#10)", () => {
    test("should get all root events", () => {
      const rootEvents = queryEngine.getRootEvents();
      
      expect(rootEvents).toHaveLength(3);
      expect(rootEvents.map(e => e.cmd)).toEqual([
        "userRegistered", 
        "orderPlaced", 
        "userRegistered"
      ]);
      expect(rootEvents.every(e => e.causation_id === null)).toBe(true);
    });

    test("should get root events in time range", () => {
      const rootEvents = queryEngine.getRootEventsInTimeRange(1, 5);
      
      expect(rootEvents).toHaveLength(2);
      expect(rootEvents.map(e => e.id)).toEqual([1, 5]);
    });

    test("should get root events by type", () => {
      const userRegistrations = queryEngine.getRootEventsByType("userRegistered");
      
      expect(userRegistrations).toHaveLength(2);
      expect(userRegistrations.map(e => e.id)).toEqual([1, 9]);
    });

    test("should get root events by user", () => {
      const userEvents = queryEngine.getRootEventsByUser("user1");
      
      expect(userEvents).toHaveLength(2);
      expect(userEvents.map(e => e.cmd)).toEqual(["userRegistered", "orderPlaced"]);
    });
  });

  describe("Enhanced Child Event Methods (#11)", () => {
    test("should get direct child events", () => {
      const children = queryEngine.getDirectChildren(1);
      
      expect(children).toHaveLength(2);
      expect(children.map(e => e.cmd)).toEqual(["sendWelcomeEmail", "createUserProfile"]);
      expect(children.every(e => e.causation_id === 1)).toBe(true);
    });

    test("should get all descendant events recursively", () => {
      const descendants = queryEngine.getDescendantEvents(1);
      
      expect(descendants).toHaveLength(3);
      expect(descendants.map(e => e.cmd)).toEqual([
        "sendWelcomeEmail", 
        "createUserProfile", 
        "profileCreated"
      ]);
    });

    test("should get children by type", () => {
      const emailChildren = queryEngine.getChildrenByType(1, "sendWelcomeEmail");
      
      expect(emailChildren).toHaveLength(1);
      expect(emailChildren[0].cmd).toBe("sendWelcomeEmail");
    });

    test("should handle events with no children", () => {
      const children = queryEngine.getDirectChildren(2); // sendWelcomeEmail has no children
      
      expect(children).toHaveLength(0);
    });
  });

  describe("Cousin Event Detection (#12)", () => {
    test("should get sibling events", () => {
      const siblings = queryEngine.getSiblingEvents(2); // sendWelcomeEmail
      
      expect(siblings).toHaveLength(1);
      expect(siblings[0].cmd).toBe("createUserProfile");
      expect(siblings[0].causation_id).toBe(1);
    });

    test("should get related events in same correlation", () => {
      const related = queryEngine.getRelatedEvents(2); // sendWelcomeEmail
      
      expect(related).toHaveLength(3);
      expect(related.map(e => e.cmd)).toEqual([
        "userRegistered",
        "createUserProfile", 
        "profileCreated"
      ]);
    });

    test("should get cousin events (same correlation, different branch)", () => {
      const cousins = queryEngine.getCousinEvents(8); // paymentApproved (child of validatePayment)
      
      // paymentApproved should find checkInventory as a cousin
      // because they're in same correlation but different branches
      expect(cousins).toHaveLength(1);
      expect(cousins[0].cmd).toBe("checkInventory");
    });

    test("should get complete event family", () => {
      const family = queryEngine.getEventFamily(3); // createUserProfile
      
      expect(family.length).toBeGreaterThan(0);
      const familyCommands = family.map(e => e.cmd);
      expect(familyCommands).toContain("userRegistered"); // ancestor
      expect(familyCommands).toContain("sendWelcomeEmail"); // sibling
      expect(familyCommands).toContain("profileCreated"); // descendant
    });
  });

  describe("Advanced Event Relationship Queries (#13)", () => {
    test("should calculate event depth", () => {
      const rootDepth = queryEngine.getEventDepth(1); // userRegistered
      const childDepth = queryEngine.getEventDepth(2); // sendWelcomeEmail
      const grandchildDepth = queryEngine.getEventDepth(4); // profileCreated
      
      expect(rootDepth).toBe(0);
      expect(childDepth).toBe(1);
      expect(grandchildDepth).toBe(2);
    });

    test("should get event branches for correlation", () => {
      const branches = queryEngine.getEventBranches("corr-001");
      
      expect(branches.length).toBeGreaterThan(0);
      expect(branches.every(b => b.correlation_id === "corr-001")).toBe(true);
      
      // Check that branch paths are properly formed
      const paths = branches.map(b => b.branch_path);
      expect(paths.some(p => p.includes("1->2"))).toBe(true); // userRegistered -> sendWelcomeEmail
      expect(paths.some(p => p.includes("1->3->4"))).toBe(true); // userRegistered -> createUserProfile -> profileCreated
    });

    test("should find orphaned events", () => {
      // Add an orphaned event manually to test
      eventQueue.store({
        cmd: "orphanedEvent",
        data: { test: true },
        correlationId: "corr-orphan",
        causationId: 999 // Non-existent parent
      }, model, eventCallbacks.void);

      const orphaned = queryEngine.findOrphanedEvents();
      
      expect(orphaned).toHaveLength(1);
      expect(orphaned[0].cmd).toBe("orphanedEvent");
      expect(orphaned[0].causation_id).toBe(999);
    });

    test("should calculate event influence", () => {
      const rootInfluence = queryEngine.getEventInfluence(1); // userRegistered
      const childInfluence = queryEngine.getEventInfluence(2); // sendWelcomeEmail (no children)
      const parentInfluence = queryEngine.getEventInfluence(5); // orderPlaced
      
      expect(rootInfluence).toBe(3); // 3 descendants
      expect(childInfluence).toBe(0); // no descendants
      expect(parentInfluence).toBe(3); // validatePayment, checkInventory, paymentApproved
    });

    test("should find critical path", () => {
      const criticalPath = queryEngine.getCriticalPath("corr-001");
      
      expect(criticalPath).toBeDefined();
      expect(criticalPath.correlation_id).toBe("corr-001");
      expect(criticalPath.path_length).toBe(3); // userRegistered -> createUserProfile -> profileCreated
      expect(criticalPath.path).toBe("1->3->4");
    });
  });

  describe("Event Visualization and Reporting", () => {
    test("should generate text event report", () => {
      const report = queryEngine.generateEventReport({
        correlationId: "corr-001",
        format: "text"
      });
      
      expect(report).toContain("Event Report for Correlation ID: corr-001");
      expect(report).toContain("METRICS");
      expect(report).toContain("Total Events: 4");
      expect(report).toContain("Root Events: 1");
      expect(report).toContain("RELATIONSHIPS");
      expect(report).toContain("EVENTS");
      expect(report).toContain("userRegistered");
      expect(report).toContain("sendWelcomeEmail");
    });

    test("should generate JSON event report", () => {
      const reportJson = queryEngine.generateEventReport({
        correlationId: "corr-002",
        format: "json"
      });
      
      const report = JSON.parse(reportJson);
      
      expect(report.title).toContain("corr-002");
      expect(report.events).toHaveLength(4);
      expect(report.metrics.totalEvents).toBe(4);
      expect(report.metrics.rootEvents).toBe(1);
      expect(report.relationships).toBeDefined();
    });

    test("should generate markdown event report", () => {
      const report = queryEngine.generateEventReport({
        eventId: 5, // orderPlaced
        format: "markdown"
      });
      
      expect(report).toContain("# Event Report for Event ID: 5");
      expect(report).toContain("## Metrics");
      expect(report).toContain("- **Total Events:**");
      expect(report).toContain("## Events");
      expect(report).toContain("| ID | Command |");
    });

    test("should generate visual event tree", () => {
      const tree = queryEngine.generateVisualEventTree("corr-001");
      
      expect(tree).toContain("Event Tree for Correlation ID: corr-001");
      expect(tree).toContain("userRegistered");
      expect(tree).toContain("├──");
      expect(tree).toContain("└──");
      expect(tree).toContain("sendWelcomeEmail");
      expect(tree).toContain("createUserProfile");
      expect(tree).toContain("profileCreated");
    });

    test("should handle empty correlation ID", () => {
      const report = queryEngine.generateEventReport({
        correlationId: "non-existent"
      });
      
      expect(report).toContain("Error: No events found");
    });

    test("should get events by correlation ID", () => {
      const events = queryEngine.getEventsByCorrelationId("corr-002");
      
      expect(events).toHaveLength(4);
      expect(events.every(e => e.correlation_id === "corr-002")).toBe(true);
      expect(events.map(e => e.cmd)).toEqual([
        "orderPlaced",
        "validatePayment", 
        "checkInventory",
        "paymentApproved"
      ]);
    });
  });

  describe("Edge Cases and Error Handling", () => {
    test("should handle non-existent event IDs", () => {
      const children = queryEngine.getDirectChildren(999);
      const depth = queryEngine.getEventDepth(999);
      const influence = queryEngine.getEventInfluence(999);
      
      expect(children).toHaveLength(0);
      expect(depth).toBe(0);
      expect(influence).toBe(0);
    });

    test("should handle empty database", () => {
      // Create a fresh query engine with empty database
      const emptyDbPath = "tests/data/empty-test.sqlite";
      const emptyQueue = initQueue({ 
        dbName: emptyDbPath,
        init: { create: true }
      });
      const emptyQueryEngine = new EventQueryEngine(emptyDbPath);

      try {
        const rootEvents = emptyQueryEngine.getRootEvents();
        const orphaned = emptyQueryEngine.findOrphanedEvents();
        
        expect(rootEvents).toHaveLength(0);
        expect(orphaned).toHaveLength(0);
      } finally {
        emptyQueryEngine.close();
        emptyQueue._db?.close();
        if (existsSync(emptyDbPath)) {
          rmSync(emptyDbPath);
        }
      }
    });

    test("should handle circular references gracefully", () => {
      // This shouldn't happen in a well-formed event store, but let's test edge case
      const siblings = queryEngine.getSiblingEvents(1); // Root event has no siblings
      expect(siblings).toHaveLength(0);
    });
  });
});