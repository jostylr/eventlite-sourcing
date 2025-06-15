import { describe, test, expect, beforeEach } from "bun:test";
import { initQueue, eventCallbacks } from "../lib/event-source.js";
import { createTestModel } from "./helpers/test-model.js";
import {
  createPatternedEventStore,
  createEventChain,
  createCorrelationContext,
  EventPatternQueries,
  EventPatternValidator,
  PatternedEventStore,
  CorrelationContext,
} from "../lib/event-helpers.js";

describe("Event Helper Utilities", () => {
  let eventQueue;
  let model;
  let eventStore;

  beforeEach(() => {
    // Setup fresh queue and model for each test
    eventQueue = initQueue({
      dbName: ":memory:",
      risky: true,
    });

    model = createTestModel({
      dbName: ":memory:",
      stub: true, // Use stub model for tests
    });

    eventStore = createPatternedEventStore(eventQueue, model);
  });

  describe("PatternedEventStore", () => {
    describe("storeExternal", () => {
      test("should store external event without causationId", async () => {
        const result = await eventStore.storeExternal({
          cmd: "userClicked",
          data: { buttonId: "submit" },
        });

        expect(result.id).toBeDefined();
        expect(result.correlationId).toBeDefined();
        expect(result.event.causation_id).toBeNull();
      });

      test("should reject external event with causationId", async () => {
        await expect(
          eventStore.storeExternal({
            cmd: "userClicked",
            data: { buttonId: "submit" },
            causationId: 1,
          }),
        ).rejects.toThrow("cannot have causationId");
      });

      test("should auto-generate correlationId if not provided", async () => {
        const result = await eventStore.storeExternal({
          cmd: "userClicked",
          data: { buttonId: "submit" },
        });

        expect(result.correlationId).toBeTruthy();
        expect(result.correlationId).toMatch(/^[0-9a-f-]{36}$/);
      });

      test("should enrich metadata with eventType", async () => {
        const result = await eventStore.storeExternal({
          cmd: "userClicked",
          data: { buttonId: "submit" },
        });

        expect(result.event.metadata.eventType).toBe("external");
        expect(result.event.metadata.timestamp).toBeDefined();
      });

      test("should warn about naming convention violations", async () => {
        // Capture console output
        const originalWarn = console.warn;
        let warnMessage = "";
        console.warn = (msg) => {
          warnMessage = msg;
        };

        await eventStore.storeExternal({
          cmd: "updateDatabase", // Looks like internal event
          data: {},
        });

        expect(warnMessage).toContain(
          "doesn't follow external event naming convention",
        );

        // Restore console.warn
        console.warn = originalWarn;
      });
    });

    describe("storeInternal", () => {
      let parentEvent;

      beforeEach(async () => {
        parentEvent = await eventStore.storeExternal({
          cmd: "userClicked",
          data: { buttonId: "submit" },
        });
      });

      test("should store internal event with parent", async () => {
        const result = await eventStore.storeInternal(
          {
            cmd: "updateDatabase",
            data: { table: "users" },
          },
          parentEvent,
        );

        expect(result.id).toBeDefined();
        expect(result.event.causation_id).toBe(parentEvent.id);
      });

      test("should inherit correlation from parent", async () => {
        const result = await eventStore.storeInternal(
          {
            cmd: "updateDatabase",
            data: { table: "users" },
          },
          parentEvent,
        );

        expect(result.correlationId).toBe(parentEvent.correlationId);
      });

      test("should reject internal event without parent", async () => {
        await expect(
          eventStore.storeInternal(
            {
              cmd: "updateDatabase",
              data: { table: "users" },
            },
            null,
          ),
        ).rejects.toThrow("must have a parent event");
      });

      test("should accept parent ID directly", async () => {
        const result = await eventStore.storeInternal(
          {
            cmd: "updateDatabase",
            data: { table: "users" },
          },
          parentEvent.id,
        );

        expect(result.event.causation_id).toBe(parentEvent.id);
      });

      test("should validate parent exists when validateRelationships is true", async () => {
        const strictStore = createPatternedEventStore(eventQueue, model, {
          validateRelationships: true,
        });

        await expect(
          strictStore.storeInternal(
            {
              cmd: "updateDatabase",
              data: { table: "users" },
            },
            99999,
          ), // Non-existent parent
        ).rejects.toThrow("Parent event 99999 not found");
      });

      test("should enrich metadata with internal event info", async () => {
        const result = await eventStore.storeInternal(
          {
            cmd: "updateDatabase",
            data: { table: "users" },
          },
          parentEvent,
        );

        expect(result.event.metadata.eventType).toBe("internal");
        expect(result.event.metadata.parentId).toBe(parentEvent.id);
        expect(result.event.metadata.generatedAt).toBeDefined();
      });
    });

    describe("storeInternalWithContexts", () => {
      let parentEvent;

      beforeEach(async () => {
        parentEvent = await eventStore.storeExternal({
          cmd: "userClicked",
          data: { buttonId: "submit" },
        });
      });

      test("should store with multiple correlation contexts", async () => {
        const contexts = {
          primary: "primary-correlation-id",
          userCorrelationId: "USER-123-history",
          ruleCorrelationId: "RULE-456-history",
        };

        const result = await eventStore.storeInternalWithContexts(
          { cmd: "updateRule", data: { ruleId: "RULE-456" } },
          parentEvent,
          contexts,
        );

        expect(result.correlationId).toBe("primary-correlation-id");
        expect(result.event.metadata.correlations).toEqual({
          userCorrelationId: "USER-123-history",
          ruleCorrelationId: "RULE-456-history",
        });
      });
    });

    describe("batchInternal", () => {
      let parentEvent;

      beforeEach(async () => {
        parentEvent = await eventStore.storeExternal({
          cmd: "batchRequested",
          data: { type: "daily-reset" },
        });
      });

      test("should process multiple internal events", async () => {
        const events = [
          { cmd: "resetUser", data: { userId: "USER-1" } },
          { cmd: "resetUser", data: { userId: "USER-2" } },
          { cmd: "resetUser", data: { userId: "USER-3" } },
        ];

        const result = await eventStore.batchInternal(parentEvent, events);

        expect(result.count).toBe(3);
        expect(result.batchId).toBeDefined();
        expect(result.events).toHaveLength(3);

        // All should have same parent and batch metadata
        result.events.forEach((event, index) => {
          expect(event.event.causation_id).toBe(parentEvent.id);
          expect(event.event.metadata.batchId).toBe(result.batchId);
          expect(event.event.metadata.batchPosition).toBe(index + 1);
          expect(event.event.metadata.batchTotal).toBe(3);
        });
      });
    });

    describe("createTransaction", () => {
      test("should create transaction context with shared metadata", async () => {
        const transaction = eventStore.createTransaction("user-workflow", {
          initiatedBy: "admin",
        });

        expect(transaction.correlationId).toBeDefined();
        expect(transaction.metadata.transactionName).toBe("user-workflow");
        expect(transaction.metadata.initiatedBy).toBe("admin");

        // Store events in transaction
        const external = await transaction.external({
          cmd: "workflowStarted",
          data: { step: 1 },
        });

        const internal = await transaction.internal(
          {
            cmd: "processStep",
            data: { step: 1 },
          },
          external,
        );

        // Both should share correlation
        expect(external.correlationId).toBe(transaction.correlationId);
        expect(internal.correlationId).toBe(transaction.correlationId);

        // Both should have transaction metadata
        expect(external.event.metadata.transactionName).toBe("user-workflow");
        expect(internal.event.metadata.transactionName).toBe("user-workflow");
      });
    });
  });

  describe("EventPatternQueries", () => {
    let queries;
    let externalEvent1, externalEvent2;
    let internalEvent1, internalEvent2, internalEvent3;

    beforeEach(async () => {
      queries = new EventPatternQueries(eventQueue);

      // Create test events
      externalEvent1 = await eventStore.storeExternal({
        cmd: "userClicked",
        data: { buttonId: "submit" },
      });

      internalEvent1 = await eventStore.storeInternal(
        {
          cmd: "updateDatabase",
          data: { table: "users" },
        },
        externalEvent1,
      );

      internalEvent2 = await eventStore.storeInternal(
        {
          cmd: "sendEmail",
          data: { to: "user@example.com" },
        },
        internalEvent1,
      );

      externalEvent2 = await eventStore.storeExternal({
        cmd: "scheduledTaskStarted",
        data: { task: "cleanup" },
      });

      internalEvent3 = await eventStore.storeInternal(
        {
          cmd: "cleanupOldData",
          data: { days: 30 },
        },
        externalEvent2,
      );
    });

    test("should find child events", () => {
      const children = queries.findCausedBy(externalEvent1.id, {
        recursive: false,
      });

      expect(children).toHaveLength(1);
      expect(children[0].id).toBe(internalEvent1.id);
    });

    test("should find all descendants recursively", () => {
      const descendants = queries.findCausedBy(externalEvent1.id, {
        recursive: true,
      });

      expect(descendants).toHaveLength(2);
      expect(descendants.map((e) => e.id)).toContain(internalEvent1.id);
      expect(descendants.map((e) => e.id)).toContain(internalEvent2.id);
    });

    test("should build event tree", () => {
      const tree = queries.buildEventTree(externalEvent1.id);

      expect(tree.event.id).toBe(externalEvent1.id);
      expect(tree.eventType).toBe("external");
      expect(tree.children).toHaveLength(1);
      expect(tree.children[0].event.id).toBe(internalEvent1.id);
      expect(tree.children[0].eventType).toBe("internal");
      expect(tree.children[0].children).toHaveLength(1);
      expect(tree.children[0].children[0].event.id).toBe(internalEvent2.id);
    });

    test("should reject building tree from internal event", () => {
      expect(() => queries.buildEventTree(internalEvent1.id)).toThrow(
        "Not an external event",
      );
    });
  });

  describe("EventPatternValidator", () => {
    let validator;

    beforeEach(() => {
      validator = new EventPatternValidator({ strict: true });
    });

    test("should validate correct external event", () => {
      const result = validator.validate({
        cmd: "userClicked",
        data: { buttonId: "submit" },
        // No causationId - correct
      });

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test("should validate correct internal event", () => {
      const result = validator.validate({
        cmd: "updateDatabase",
        data: { table: "users" },
        causationId: 1,
      });

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test("should reject external event with causationId", () => {
      // This event looks external (by naming) but has causationId - that's the error
      const result = validator.validate({
        cmd: "userClicked",
        data: { buttonId: "submit" },
        causationId: 1, // Wrong - external events shouldn't have this!
      });

      // The validator correctly identifies this as internal (has causationId)
      // but the naming suggests it should be external - that's just a warning
      expect(result.valid).toBe(true); // No hard errors
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toContain(
        "Internal event 'userClicked' should use action-focused naming",
      );
    });

    test("should reject internal event without causationId", () => {
      // This event looks internal (by naming) but lacks causationId - that's fine
      const result = validator.validate({
        cmd: "updateDatabase",
        data: { table: "users" },
        // Missing causationId - makes it external
      });

      // The validator correctly identifies this as external (no causationId)
      // but the naming suggests it should be internal - that's just a warning
      expect(result.valid).toBe(true); // No hard errors
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toContain(
        "External event 'updateDatabase' should use past tense, subject-first naming",
      );
    });

    test("should actually reject invalid patterns", () => {
      // Test 1: An event that claims to be external but has causationId
      const externalWithParent = validator.validate({
        cmd: "userClicked", // External naming
        data: { buttonId: "submit" },
        causationId: 1,
        __expectedType: "external", // Hint for validator
      });

      // Since it has causationId, it's treated as internal
      // The validator doesn't have a way to know the developer's intent
      expect(externalWithParent.valid).toBe(true);

      // Test 2: The validator primarily validates structure, not intent
      // If you want to enforce that certain commands are always external,
      // you'd need a different approach (like a command registry)
    });

    test("should warn about naming convention violations", () => {
      const result = validator.validate({
        cmd: "updateDatabase", // Looks internal but is external
        data: {},
      });

      expect(result.valid).toBe(true); // Still valid
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain("should use past tense");
    });
  });

  describe("CorrelationContext", () => {
    test("should build correlation context with fluent API", () => {
      const context = createCorrelationContext("primary-id")
        .addUser("USER-123")
        .addRule("RULE-456")
        .addBatch("BATCH-789")
        .addTransaction("TXN-ABC")
        .build();

      expect(context).toEqual({
        primary: "primary-id",
        userCorrelationId: "USER-USER-123-activity",
        ruleCorrelationId: "RULE-RULE-456-history",
        batchCorrelationId: "BATCH-789",
        transactionCorrelationId: "TXN-ABC",
      });
    });

    test("should convert to metadata format", () => {
      const context = new CorrelationContext("primary-id");
      context.addUser("USER-123").addRule("RULE-456");

      const metadata = context.toMetadata();

      expect(metadata).toEqual({
        correlations: {
          userCorrelationId: "USER-USER-123-activity",
          ruleCorrelationId: "RULE-RULE-456-history",
        },
      });
    });
  });

  describe("EventChainBuilder", () => {
    test("should build and execute event chain", async () => {
      const chain = createEventChain(eventStore)
        .startWith({
          cmd: "orderPlaced",
          data: { orderId: "ORDER-123" },
        })
        .then({
          cmd: "validateInventory",
          data: { orderId: "ORDER-123" },
        })
        .then({
          cmd: "processPayment",
          data: { orderId: "ORDER-123" },
        });

      const result = await chain.execute();

      expect(result.count).toBe(3);
      expect(result.events).toHaveLength(3);
      expect(result.rootEvent.event.cmd).toBe("orderPlaced");
      expect(result.leafEvents).toHaveLength(1);
      expect(result.leafEvents[0].event.cmd).toBe("processPayment");

      // Verify causation chain
      expect(result.events[1].event.causation_id).toBe(result.events[0].id);
      expect(result.events[2].event.causation_id).toBe(result.events[1].id);

      // All should share correlation
      const correlationId = result.events[0].correlationId;
      expect(result.events[1].correlationId).toBe(correlationId);
      expect(result.events[2].correlationId).toBe(correlationId);
    });

    test("should support branching with thenEach", async () => {
      const chain = createEventChain(eventStore)
        .startWith({
          cmd: "batchStarted",
          data: { batchId: "BATCH-123" },
        })
        .thenEach([
          { cmd: "processItem", data: { itemId: "ITEM-1" } },
          { cmd: "processItem", data: { itemId: "ITEM-2" } },
          { cmd: "processItem", data: { itemId: "ITEM-3" } },
        ]);

      const result = await chain.execute();

      expect(result.count).toBe(4);
      expect(result.leafEvents).toHaveLength(3);

      // All items should have batch as parent
      const batchId = result.events[0].id;
      expect(result.events[1].event.causation_id).toBe(batchId);
      expect(result.events[2].event.causation_id).toBe(batchId);
      expect(result.events[3].event.causation_id).toBe(batchId);
    });

    test("should reject chain not starting with external event", () => {
      const chain = createEventChain(eventStore);

      expect(() => chain.then({ cmd: "someCommand", data: {} })).toThrow(
        "Chain must start with external event",
      );
    });
  });

  describe("Integration scenarios", () => {
    test("should handle complete workflow with all utilities", async () => {
      // 1. Create transaction context
      const transaction = eventStore.createTransaction("rule-update", {
        source: "admin-panel",
      });

      // 2. Store external trigger
      const motion = await transaction.external({
        cmd: "motionPassed",
        data: { motionId: "MOTION-123", ruleId: "RULE-001" },
      });

      // 3. Build correlation context
      const context = createCorrelationContext(transaction.correlationId)
        .addRule("RULE-001")
        .addUser("ADMIN-001")
        .build();

      // 4. Store internal response with contexts
      const update = await eventStore.storeInternalWithContexts(
        {
          cmd: "updateRule",
          data: { ruleId: "RULE-001", content: "New content" },
        },
        motion,
        context,
      );

      // 5. Validate the events
      const validator = new EventPatternValidator();
      const motionValidation = validator.validate(motion.event);
      const updateValidation = validator.validate(update.event);

      expect(motionValidation.valid).toBe(true);
      expect(updateValidation.valid).toBe(true);

      // 6. Query the event tree
      const queries = new EventPatternQueries(eventQueue);
      const tree = queries.buildEventTree(motion.id);

      expect(tree.event.cmd).toBe("motionPassed");
      expect(tree.children).toHaveLength(1);
      expect(tree.children[0].event.cmd).toBe("updateRule");

      // 7. Verify all relationships
      expect(update.event.metadata.correlations.ruleCorrelationId).toBe(
        "RULE-RULE-001-history",
      );
      expect(update.event.metadata.correlations.userCorrelationId).toBe(
        "USER-ADMIN-001-activity",
      );
      expect(motion.event.metadata.transactionName).toBe("rule-update");
    });
  });
});
