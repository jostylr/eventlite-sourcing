import { test, expect, beforeEach } from "bun:test";
import { initQueue, eventCallbacks } from "../lib/event-source.js";
import { modelSetup } from "../lib/model.js";

let eventQueue;
let testModel;

const testModelSetup = {
  dbName: "tests/data/test-wait-conditions.sqlite",
  reset: [""], // Delete the database file
  tables(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY,
        user_id TEXT,
        status TEXT,
        amount REAL
      );
    `);
  },
  queries(db) {
    return {
      createOrder: db.prepare("INSERT INTO orders (user_id, status, amount) VALUES (?, ?, ?) RETURNING *"),
      updateOrderStatus: db.prepare("UPDATE orders SET status = ? WHERE id = ? RETURNING *"),
      getOrder: db.prepare("SELECT * FROM orders WHERE id = ?"),
    };
  },
  methods(queries) {
    return {
      createOrder({ userId, amount }) {
        const result = queries.createOrder.run(userId, 'pending', amount);
        return { orderId: result.lastInsertRowid, userId, amount, status: 'pending' };
      },
      
      paymentReceived({ orderId }) {
        const result = queries.updateOrderStatus.run('paid', orderId);
        return { orderId, status: 'paid' };
      },
      
      inventoryChecked({ orderId, available }) {
        if (available) {
          return { orderId, inventory: 'available' };
        } else {
          return { orderId, inventory: 'unavailable' };
        }
      },
      
      processOrder({ orderId }) {
        const result = queries.updateOrderStatus.run('processing', orderId);
        return { orderId, status: 'processing' };
      },
    };
  },
  // Silent default handler to suppress "unknown to model" messages
  default: (data, meta) => {
    return "";
  },
};

beforeEach(async () => {
  eventQueue = initQueue({
    dbName: "tests/data/test-wait-conditions-queue.sqlite",
    reset: true,
  });
  
  testModel = modelSetup(testModelSetup);
});

test("Wait Conditions > should store event with wait conditions", async () => {
  const correlationId = "order-123";
  
  // Store an event that waits for payment and inventory check
  const result = eventQueue.storeWhen({
    cmd: 'processOrder',
    data: { orderId: 123 },
    correlationId,
    waitFor: {
      all: [
        { pattern: 'paymentReceived', correlationId },
        { pattern: 'inventoryChecked', correlationId }
      ]
    },
    timeout: 60000 // 1 minute
  }, testModel, eventCallbacks.void);
  
  expect(result.status).toBe('pending');
  expect(result.pendingEventId).toBeGreaterThan(0);
});

test("Wait Conditions > should execute pending event when all conditions are met", async () => {
  const correlationId = "order-456";
  
  // First, create the order
  await eventQueue.store({
    cmd: 'createOrder',
    data: { userId: 'user1', amount: 100 },
    correlationId,
  }, testModel, eventCallbacks.void);
  
  // Store an event that waits for payment and inventory check
  const waitResult = eventQueue.storeWhen({
    cmd: 'processOrder',
    data: { orderId: 456 },
    correlationId,
    waitFor: {
      all: [
        { pattern: 'paymentReceived', correlationId },
        { pattern: 'inventoryChecked', correlationId }
      ]
    }
  }, testModel, eventCallbacks.void);
  
  expect(waitResult.status).toBe('pending');
  
  // Check that no ready events exist yet
  let readyEvents = eventQueue.checkAllPendingEvents();
  expect(readyEvents.length).toBe(0);
  
  // Trigger payment received
  await eventQueue.store({
    cmd: 'paymentReceived',
    data: { orderId: 456 },
    correlationId,
    causationId: 1, // Caused by createOrder event
  }, testModel, eventCallbacks.void);
  
  // Still no ready events (need both conditions)
  readyEvents = eventQueue.checkAllPendingEvents();
  expect(readyEvents.length).toBe(0);
  
  // Trigger inventory check
  await eventQueue.store({
    cmd: 'inventoryChecked',
    data: { orderId: 456, available: true },
    correlationId,
    causationId: 1, // Caused by createOrder event
  }, testModel, eventCallbacks.void);
  
  // Now the event should be ready
  readyEvents = eventQueue.checkAllPendingEvents();
  expect(readyEvents.length).toBe(1);
  
  // Execute ready events
  const executedEvents = eventQueue.executeReadyEvents(testModel, eventCallbacks.void);
  expect(executedEvents.length).toBe(1);
  expect(executedEvents[0].result.orderId).toBe(456);
});

test("Wait Conditions > should handle count conditions", async () => {
  const correlationId = "approval-789";
  
  // Store an event that waits for 3 approvals
  const waitResult = eventQueue.storeWhen({
    cmd: 'processApproval',
    data: { requestId: 789 },
    correlationId,
    waitFor: {
      count: {
        pattern: 'approved',
        correlationId,
        count: 3
      }
    }
  }, testModel, eventCallbacks.void);
  
  expect(waitResult.status).toBe('pending');
  
  // Add 2 approvals - not enough yet
  await eventQueue.store({
    cmd: 'approved',
    data: { requestId: 789, approver: 'manager1' },
    correlationId,
  }, testModel, eventCallbacks.void);
  
  await eventQueue.store({
    cmd: 'approved',
    data: { requestId: 789, approver: 'manager2' },
    correlationId,
  }, testModel, eventCallbacks.void);
  
  let readyEvents = eventQueue.checkAllPendingEvents();
  expect(readyEvents.length).toBe(0);
  
  // Add third approval - now it should be ready
  await eventQueue.store({
    cmd: 'approved',
    data: { requestId: 789, approver: 'manager3' },
    correlationId,
  }, testModel, eventCallbacks.void);
  
  readyEvents = eventQueue.checkAllPendingEvents();
  expect(readyEvents.length).toBe(1);
});

test("Wait Conditions > should handle timeout and expiration", async () => {
  const correlationId = "timeout-test";
  
  // Store an event with a very short timeout
  const waitResult = eventQueue.storeWhen({
    cmd: 'processOrder',
    data: { orderId: 999 },
    correlationId,
    waitFor: {
      all: [
        { pattern: 'paymentReceived', correlationId }
      ]
    },
    timeout: 100 // 100ms timeout
  }, testModel, eventCallbacks.void);
  
  expect(waitResult.status).toBe('pending');
  
  // Wait for timeout to expire
  await new Promise(resolve => setTimeout(resolve, 150));
  
  // Check for expired events
  const expiredEvents = eventQueue.expirePendingEvents();
  expect(expiredEvents.length).toBe(1);
  expect(expiredEvents[0].id).toBe(waitResult.pendingEventId);
});

test("Wait Conditions > should support event cancellation", async () => {
  const correlationId = "cancel-test";
  
  // Store an event that waits
  const waitResult = eventQueue.storeWhen({
    cmd: 'processOrder',
    data: { orderId: 888 },
    correlationId,
    waitFor: {
      all: [
        { pattern: 'paymentReceived', correlationId }
      ]
    }
  }, testModel, eventCallbacks.void);
  
  expect(waitResult.status).toBe('pending');
  
  // Cancel the pending event
  const cancelled = eventQueue.cancelPendingEvent(waitResult.pendingEventId);
  expect(cancelled).toBe(true);
  
  // Try to cancel again (should fail)
  const cancelledAgain = eventQueue.cancelPendingEvent(waitResult.pendingEventId);
  expect(cancelledAgain).toBe(false);
  
  // Event should not be ready even if condition is met
  await eventQueue.store({
    cmd: 'paymentReceived',
    data: { orderId: 888 },
    correlationId,
  }, testModel, eventCallbacks.void);
  
  const readyEvents = eventQueue.checkAllPendingEvents();
  expect(readyEvents.length).toBe(0);
});

test("Wait Conditions > should fallback to regular store when no waitFor is provided", async () => {
  // Store regular event (no waitFor)
  const result = eventQueue.storeWhen({
    cmd: 'createOrder',
    data: { userId: 'user1', amount: 50 }
  }, testModel, eventCallbacks.void);
  
  // Should execute immediately like normal store
  expect(result.orderId).toBeGreaterThan(0);
  expect(result.status).toBe('pending');
  expect(result.userId).toBe('user1');
});

test("Wait Conditions > should handle 'any' conditions correctly", async () => {
  const correlationId = "any-test";
  
  // Store an event that waits for either manager OR director approval
  const waitResult = eventQueue.storeWhen({
    cmd: 'processRequest',
    data: { requestId: 999 },
    correlationId,
    waitFor: {
      any: [
        { pattern: 'managerApproved', correlationId },
        { pattern: 'directorApproved', correlationId }
      ]
    }
  }, testModel, eventCallbacks.void);
  
  expect(waitResult.status).toBe('pending');
  
  // Only manager approves (should be enough)
  await eventQueue.store({
    cmd: 'managerApproved',
    data: { requestId: 999, approver: 'manager1' },
    correlationId,
  }, testModel, eventCallbacks.void);
  
  const readyEvents = eventQueue.checkAllPendingEvents();
  expect(readyEvents.length).toBe(1);
  
  const executedEvents = eventQueue.executeReadyEvents(testModel, eventCallbacks.void);
  expect(executedEvents.length).toBe(1);
});

test("Wait Conditions > should handle sequence conditions", async () => {
  const correlationId = "sequence-test";
  
  // Store an event that waits for events in sequence
  const waitResult = eventQueue.storeWhen({
    cmd: 'finalizeWorkflow',
    data: { workflowId: 555 },
    correlationId,
    waitFor: {
      sequence: [
        { pattern: 'step1Complete', correlationId },
        { pattern: 'step2Complete', correlationId },
        { pattern: 'step3Complete', correlationId }
      ]
    }
  }, testModel, eventCallbacks.void);
  
  expect(waitResult.status).toBe('pending');
  
  // Complete steps out of order - should not be ready until all done in order
  await eventQueue.store({
    cmd: 'step3Complete',
    data: { workflowId: 555 },
    correlationId,
  }, testModel, eventCallbacks.void);
  
  await eventQueue.store({
    cmd: 'step1Complete', 
    data: { workflowId: 555 },
    correlationId,
  }, testModel, eventCallbacks.void);
  
  // Still not ready (missing step2)
  let readyEvents = eventQueue.checkAllPendingEvents();
  expect(readyEvents.length).toBe(0);
  
  // Complete step 2
  await eventQueue.store({
    cmd: 'step2Complete',
    data: { workflowId: 555 },
    correlationId,
  }, testModel, eventCallbacks.void);
  
  // Now should be ready
  readyEvents = eventQueue.checkAllPendingEvents();
  expect(readyEvents.length).toBe(1);
});

test("Wait Conditions > should handle conditions with property filters", async () => {
  const correlationId = "property-test";
  
  // Store an event that waits for high-value approvals only
  const waitResult = eventQueue.storeWhen({
    cmd: 'processLoan',
    data: { loanId: 777 },
    correlationId,
    waitFor: {
      count: {
        pattern: 'approved',
        correlationId,
        count: 2,
        where: { amount: { $gte: 1000 } }
      }
    }
  }, testModel, eventCallbacks.void);
  
  expect(waitResult.status).toBe('pending');
  
  // Add low-value approval (should not count)
  await eventQueue.store({
    cmd: 'approved',
    data: { loanId: 777, amount: 500, approver: 'low-approval' },
    correlationId,
  }, testModel, eventCallbacks.void);
  
  // Add one high-value approval
  await eventQueue.store({
    cmd: 'approved',
    data: { loanId: 777, amount: 1500, approver: 'high-approval-1' },
    correlationId,
  }, testModel, eventCallbacks.void);
  
  // Still not ready (need 2 high-value approvals)
  let readyEvents = eventQueue.checkAllPendingEvents();
  expect(readyEvents.length).toBe(0);
  
  // Add second high-value approval
  await eventQueue.store({
    cmd: 'approved',
    data: { loanId: 777, amount: 2000, approver: 'high-approval-2' },
    correlationId,
  }, testModel, eventCallbacks.void);
  
  // Now should be ready
  readyEvents = eventQueue.checkAllPendingEvents();
  expect(readyEvents.length).toBe(1);
});

test("Wait Conditions > should handle mixed wait types", async () => {
  const correlationId = "mixed-test";
  
  // Complex condition: needs manager approval AND (director approval OR admin override)
  const waitResult = eventQueue.storeWhen({
    cmd: 'processComplexRequest',
    data: { requestId: 888 },
    correlationId,
    waitFor: {
      all: [
        { pattern: 'managerApproved', correlationId }
      ],
      any: [
        { pattern: 'directorApproved', correlationId },
        { pattern: 'adminOverride', correlationId }
      ]
    }
  }, testModel, eventCallbacks.void);
  
  expect(waitResult.status).toBe('pending');
  
  // Add manager approval (satisfies 'all' condition)
  await eventQueue.store({
    cmd: 'managerApproved',
    data: { requestId: 888 },
    correlationId,
  }, testModel, eventCallbacks.void);
  
  // Still not ready (need 'any' condition)
  let readyEvents = eventQueue.checkAllPendingEvents();
  expect(readyEvents.length).toBe(0);
  
  // Add admin override (satisfies 'any' condition)
  await eventQueue.store({
    cmd: 'adminOverride',
    data: { requestId: 888 },
    correlationId,
  }, testModel, eventCallbacks.void);
  
  // Now should be ready
  readyEvents = eventQueue.checkAllPendingEvents();
  expect(readyEvents.length).toBe(1);
});

test("Wait Conditions > should not execute cancelled events even when conditions are met", async () => {
  const correlationId = "cancel-condition-test";
  
  const waitResult = eventQueue.storeWhen({
    cmd: 'processOrder',
    data: { orderId: 111 },
    correlationId,
    waitFor: {
      all: [
        { pattern: 'paymentReceived', correlationId }
      ]
    }
  }, testModel, eventCallbacks.void);
  
  // Cancel the event first
  const cancelled = eventQueue.cancelPendingEvent(waitResult.pendingEventId);
  expect(cancelled).toBe(true);
  
  // Then satisfy the condition
  await eventQueue.store({
    cmd: 'paymentReceived',
    data: { orderId: 111 },
    correlationId,
  }, testModel, eventCallbacks.void);
  
  // Should not be ready because it was cancelled
  const readyEvents = eventQueue.checkAllPendingEvents();
  expect(readyEvents.length).toBe(0);
  
  const executedEvents = eventQueue.executeReadyEvents(testModel, eventCallbacks.void);
  expect(executedEvents.length).toBe(0);
});