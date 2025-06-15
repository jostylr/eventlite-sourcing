import { expect, test, describe, beforeEach, afterEach } from "bun:test";
import { initQueue, modelSetup, eventCallbacks } from "../index.js";

describe("Correlation and Causation IDs", () => {
  let eventQueue;
  let model;

  beforeEach(() => {
    eventQueue = initQueue({ dbName: ":memory:", risky: true });
    model = modelSetup({ dbName: ":memory:", stub: true });
  });

  afterEach(() => {
    if (eventQueue.reset) {
      eventQueue.reset();
    }
  });

  test("should generate correlation ID for new transactions", async () => {
    await eventQueue.store(
      {
        cmd: "startTransaction",
        data: { value: 42 },
      },
      model,
      eventCallbacks.void
    );

    const event = eventQueue.retrieveByID(1);
    expect(event.correlation_id).toBeDefined();
    expect(event.correlation_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(event.causation_id).toBeNull();
  });

  test("should use provided correlation ID", async () => {
    const correlationId = "test-correlation-123";

    await eventQueue.store(
      {
        cmd: "testCommand",
        data: { value: 42 },
        correlationId,
      },
      model,
      eventCallbacks.void
    );

    const event = eventQueue.retrieveByID(1);
    expect(event.correlation_id).toBe(correlationId);
  });

  test("should inherit correlation ID from parent event", async () => {
    // First event
    await eventQueue.store(
      {
        cmd: "parentEvent",
        data: { value: 1 },
      },
      model,
      eventCallbacks.void
    );

    const parentEvent = eventQueue.retrieveByID(1);
    const parentCorrelationId = parentEvent.correlation_id;

    // Child event with causation ID
    await eventQueue.store(
      {
        cmd: "childEvent",
        data: { value: 2 },
        causationId: 1,
      },
      model,
      eventCallbacks.void
    );

    const childEvent = eventQueue.retrieveByID(2);
    expect(childEvent.correlation_id).toBe(parentCorrelationId);
    expect(childEvent.causation_id).toBe(1);
  });

  test("should store and retrieve metadata", async () => {
    const metadata = {
      service: "user-service",
      version: "1.2.3",
      environment: "test",
    };

    await eventQueue.store(
      {
        cmd: "metadataTest",
        data: { value: 42 },
        metadata,
      },
      model,
      eventCallbacks.void
    );

    const event = eventQueue.retrieveByID(1);
    expect(event.metadata).toEqual(metadata);
  });

  test("should get all events in a transaction", async () => {
    const correlationId = "transaction-123";

    // Create multiple events with same correlation ID
    await eventQueue.store(
      {
        cmd: "createOrder",
        data: { orderId: 1 },
        correlationId,
      },
      model,
      eventCallbacks.void
    );

    await eventQueue.store(
      {
        cmd: "processPayment",
        data: { orderId: 1, amount: 99.99 },
        correlationId,
        causationId: 1,
      },
      model,
      eventCallbacks.void
    );

    await eventQueue.store(
      {
        cmd: "sendEmail",
        data: { orderId: 1 },
        correlationId,
        causationId: 2,
      },
      model,
      eventCallbacks.void
    );

    const transaction = eventQueue.getTransaction(correlationId);

    expect(transaction).toHaveLength(3);
    expect(transaction[0].cmd).toBe("createOrder");
    expect(transaction[1].cmd).toBe("processPayment");
    expect(transaction[2].cmd).toBe("sendEmail");
    expect(transaction.every(e => e.correlation_id === correlationId)).toBe(true);
  });

  test("should get child events", async () => {
    // Parent event
    await eventQueue.store(
      {
        cmd: "parentCommand",
        data: { value: 1 },
      },
      model,
      eventCallbacks.void
    );

    // Multiple child events
    await eventQueue.store(
      {
        cmd: "childCommand1",
        data: { value: 2 },
        causationId: 1,
      },
      model,
      eventCallbacks.void
    );

    await eventQueue.store(
      {
        cmd: "childCommand2",
        data: { value: 3 },
        causationId: 1,
      },
      model,
      eventCallbacks.void
    );

    // Grandchild event
    await eventQueue.store(
      {
        cmd: "grandchildCommand",
        data: { value: 4 },
        causationId: 2,
      },
      model,
      eventCallbacks.void
    );

    const children = eventQueue.getChildEvents(1);

    expect(children).toHaveLength(2);
    expect(children[0].cmd).toBe("childCommand1");
    expect(children[1].cmd).toBe("childCommand2");
  });

  test("should get event lineage", async () => {
    // Create event chain
    await eventQueue.store(
      {
        cmd: "rootEvent",
        data: { level: 0 },
      },
      model,
      eventCallbacks.void
    );

    await eventQueue.store(
      {
        cmd: "middleEvent",
        data: { level: 1 },
        causationId: 1,
      },
      model,
      eventCallbacks.void
    );

    await eventQueue.store(
      {
        cmd: "leafEvent",
        data: { level: 2 },
        causationId: 2,
      },
      model,
      eventCallbacks.void
    );

    // Get lineage of middle event
    const lineage = eventQueue.getEventLineage(2);

    expect(lineage).toBeDefined();
    expect(lineage.event.cmd).toBe("middleEvent");
    expect(lineage.parent.cmd).toBe("rootEvent");
    expect(lineage.children).toHaveLength(1);
    expect(lineage.children[0].cmd).toBe("leafEvent");
  });

  test("should handle null lineage for non-existent event", () => {
    const lineage = eventQueue.getEventLineage(999);
    expect(lineage).toBeNull();
  });

  test("should use storeWithContext helper", async () => {
    const context = {
      correlationId: "context-123",
      metadata: {
        service: "test-service",
        userId: "user-456",
      },
    };

    await eventQueue.storeWithContext(
      {
        cmd: "contextTest",
        data: { value: 42 },
      },
      context,
      model,
      eventCallbacks.void
    );

    const event = eventQueue.retrieveByID(1);
    expect(event.correlation_id).toBe("context-123");
    expect(event.metadata.service).toBe("test-service");
    expect(event.metadata.userId).toBe("user-456");
  });

  test("should handle complex context inheritance", async () => {
    // First event
    await eventQueue.store(
      {
        cmd: "first",
        data: { step: 1 },
        metadata: { original: true },
      },
      model,
      eventCallbacks.void
    );

    // Use context to create related event
    const context = {
      parentEventId: 1,
      metadata: { additional: "info" },
    };

    await eventQueue.storeWithContext(
      {
        cmd: "second",
        data: { step: 2 },
        metadata: { own: "data" },
      },
      context,
      model,
      eventCallbacks.void
    );

    const secondEvent = eventQueue.retrieveByID(2);
    expect(secondEvent.causation_id).toBe(1);
    expect(secondEvent.correlation_id).toBe(eventQueue.retrieveByID(1).correlation_id);
    expect(secondEvent.metadata).toEqual({
      own: "data",
      additional: "info",
    });
  });

  test("should handle correlation ID in event replay", async () => {
    const correlationId = "replay-test-123";
    const events = [];

    // Create model that captures metadata
    const captureModel = modelSetup({
      dbName: ":memory:",
      methods() {
        return {
          captureEvent(data, metadata) {
            events.push({ data, metadata });
            return { captured: true };
          },
        };
      },
    });

    // Store events
    await eventQueue.store(
      {
        cmd: "captureEvent",
        data: { id: 1 },
        correlationId,
      },
      captureModel,
      eventCallbacks.void
    );

    await eventQueue.store(
      {
        cmd: "captureEvent",
        data: { id: 2 },
        correlationId,
        causationId: 1,
      },
      captureModel,
      eventCallbacks.void
    );

    // Clear and replay
    events.length = 0;
    eventQueue.cycleThrough(
      captureModel,
      () => {},
      eventCallbacks.void,
      { start: 0 }
    );

    expect(events).toHaveLength(2);
    expect(events[0].metadata.correlationId).toBe(correlationId);
    expect(events[1].metadata.correlationId).toBe(correlationId);
    expect(events[1].metadata.causationId).toBe(1);
  });

  test("should create event trees with correlation IDs", async () => {
    const correlationId = "tree-test-123";

    // Create a tree structure
    // 1. Order created
    await eventQueue.store(
      {
        cmd: "createOrder",
        data: { orderId: 100 },
        correlationId,
      },
      model,
      eventCallbacks.void
    );

    // 2. Payment processing (caused by order)
    await eventQueue.store(
      {
        cmd: "processPayment",
        data: { orderId: 100, amount: 50 },
        causationId: 1,
      },
      model,
      eventCallbacks.void
    );

    // 3. Inventory check (caused by order)
    await eventQueue.store(
      {
        cmd: "checkInventory",
        data: { orderId: 100 },
        causationId: 1,
      },
      model,
      eventCallbacks.void
    );

    // 4. Payment completed (caused by payment processing)
    await eventQueue.store(
      {
        cmd: "completePayment",
        data: { orderId: 100 },
        causationId: 2,
      },
      model,
      eventCallbacks.void
    );

    // 5. Send notification (caused by payment completion)
    await eventQueue.store(
      {
        cmd: "sendNotification",
        data: { orderId: 100, type: "payment" },
        causationId: 4,
      },
      model,
      eventCallbacks.void
    );

    // Verify the tree structure
    const orderLineage = eventQueue.getEventLineage(1);
    expect(orderLineage.children).toHaveLength(2);
    expect(orderLineage.children.map(c => c.cmd).sort()).toEqual(["checkInventory", "processPayment"]);

    const paymentLineage = eventQueue.getEventLineage(2);
    expect(paymentLineage.parent.cmd).toBe("createOrder");
    expect(paymentLineage.children).toHaveLength(1);
    expect(paymentLineage.children[0].cmd).toBe("completePayment");

    // All events should share the same correlation ID
    const allEvents = eventQueue.getTransaction(correlationId);
    expect(allEvents).toHaveLength(5);
    expect(allEvents.every(e => e.correlation_id === correlationId)).toBe(true);
  });

  test("should handle missing parent when inheriting correlation ID", async () => {
    await eventQueue.store(
      {
        cmd: "orphanEvent",
        data: { value: 42 },
        causationId: 999, // Non-existent parent
      },
      model,
      eventCallbacks.void
    );

    const event = eventQueue.retrieveByID(1);
    expect(event.correlation_id).toBeDefined(); // Should still have a correlation ID
    expect(event.causation_id).toBe(999);
  });

  test("should preserve all IDs during cycleThrough", async () => {
    const correlationId = "cycle-test";
    const metadata = { source: "test" };

    // Store event with all IDs
    await eventQueue.store(
      {
        cmd: "testEvent",
        data: { value: 1 },
        correlationId,
        metadata,
      },
      model,
      eventCallbacks.void
    );

    // Store child event
    await eventQueue.store(
      {
        cmd: "childEvent",
        data: { value: 2 },
        causationId: 1,
        metadata: { ...metadata, child: true },
      },
      model,
      eventCallbacks.void
    );

    // Verify stored correctly
    const storedEvents = eventQueue.getTransaction(correlationId);
    expect(storedEvents).toHaveLength(2);
    expect(storedEvents[0].metadata.source).toBe("test");
    expect(storedEvents[1].metadata.child).toBe(true);
  });
});
