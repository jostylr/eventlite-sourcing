# Event Wait Conditions Guide

This comprehensive guide covers EventLite's wait conditions feature, which allows events to execute only after specific prerequisite events have occurred.

## Table of Contents

- [Introduction](#introduction)
- [Core Concepts](#core-concepts)
- [Quick Start](#quick-start)
- [Wait Condition Types](#wait-condition-types)
- [Advanced Features](#advanced-features)
- [Best Practices](#best-practices)
- [Debugging & Monitoring](#debugging--monitoring)
- [Performance Considerations](#performance-considerations)
- [Common Patterns](#common-patterns)
- [Troubleshooting](#troubleshooting)

## Introduction

Wait conditions transform EventLite from a simple event store into a powerful workflow orchestration system. Instead of complex callback chains or external state machines, you can declaratively specify dependencies between events.

### Why Use Wait Conditions?

**Before (Callback Hell):**
```javascript
eventQueue.store({ cmd: 'createOrder' }, model, {
  createOrder: async (result, row) => {
    // Trigger payment
    await eventQueue.store({ cmd: 'processPayment' }, model, {
      processPayment: async (payResult, payRow) => {
        // Trigger inventory  
        await eventQueue.store({ cmd: 'checkInventory' }, model, {
          checkInventory: async (invResult, invRow) => {
            // Finally process order
            await eventQueue.store({ cmd: 'fulfillOrder' }, model, callbacks);
          }
        });
      }
    });
  }
});
```

**After (Declarative Wait Conditions):**
```javascript
// Create order
await eventQueue.store({ cmd: 'createOrder', correlationId: 'order-123' }, model, callbacks);

// Payment and inventory happen independently
await eventQueue.store({ cmd: 'processPayment', correlationId: 'order-123' }, model, callbacks);
await eventQueue.store({ cmd: 'checkInventory', correlationId: 'order-123' }, model, callbacks);

// Fulfill order automatically when both are done
eventQueue.storeWhen({
  cmd: 'fulfillOrder',
  correlationId: 'order-123',
  waitFor: {
    all: [
      { pattern: 'paymentProcessed', correlationId: 'order-123' },
      { pattern: 'inventoryChecked', correlationId: 'order-123' }
    ]
  }
}, model, callbacks);
```

## Core Concepts

### Pending Events

When you use `storeWhen()` with wait conditions, the event is stored as "pending" rather than executed immediately. It moves through these states:

1. **Pending** - Waiting for conditions to be satisfied
2. **Ready** - All conditions met, ready for execution  
3. **Executed** - Successfully executed
4. **Expired** - Timeout reached before conditions were met
5. **Cancelled** - Manually cancelled

### Correlation IDs

Wait conditions rely heavily on correlation IDs to group related events. Every condition must specify a `correlationId` to match against.

```javascript
// All these events share the same correlation ID
const correlationId = 'order-' + Date.now();

await eventQueue.store({
  cmd: 'createOrder',
  correlationId,
  data: { items: ['widget'] }
}, model, callbacks);

eventQueue.storeWhen({
  cmd: 'processOrder', 
  correlationId,
  waitFor: {
    all: [
      { pattern: 'paymentReceived', correlationId },
      { pattern: 'inventoryVerified', correlationId }
    ]
  }
}, model, callbacks);
```

### Automatic vs Manual Processing

By default, wait conditions are checked automatically after each event is stored. You can also process them manually:

```javascript
// Automatic (default) - conditions checked after every event
await eventQueue.store({ cmd: 'paymentReceived' }, model, callbacks);
// -> Automatically checks and executes ready events

// Manual processing
const readyEvents = eventQueue.checkAllPendingEvents();
const executedEvents = eventQueue.executeReadyEvents(model, callbacks);
```

## Quick Start

### 1. Basic Wait Condition

Wait for a single event before executing:

```javascript
// Store an event that waits for payment
eventQueue.storeWhen({
  cmd: 'shipOrder',
  data: { orderId: 123 },
  correlationId: 'order-123',
  waitFor: {
    all: [
      { pattern: 'paymentReceived', correlationId: 'order-123' }
    ]
  }
}, model, callbacks);

// Later, when payment is received
await eventQueue.store({
  cmd: 'paymentReceived',
  data: { orderId: 123, amount: 99.99 },
  correlationId: 'order-123'
}, model, callbacks);

// shipOrder event now executes automatically
```

### 2. Multiple Conditions

Wait for multiple events (AND logic):

```javascript
eventQueue.storeWhen({
  cmd: 'finalizeOrder',
  data: { orderId: 456 },
  correlationId: 'order-456',
  waitFor: {
    all: [
      { pattern: 'paymentReceived', correlationId: 'order-456' },
      { pattern: 'inventoryReserved', correlationId: 'order-456' },
      { pattern: 'shippingCalculated', correlationId: 'order-456' }
    ]
  },
  timeout: 300000 // 5 minutes
}, model, callbacks);
```

### 3. Alternative Conditions

Wait for any one of several events (OR logic):

```javascript
eventQueue.storeWhen({
  cmd: 'processRefund',
  data: { orderId: 789 },
  correlationId: 'order-789',
  waitFor: {
    any: [
      { pattern: 'customerRequested', correlationId: 'order-789' },
      { pattern: 'qualityIssueDetected', correlationId: 'order-789' },
      { pattern: 'adminOverride', correlationId: 'order-789' }
    ]
  }
}, model, callbacks);
```

## Wait Condition Types

### All Conditions (AND Logic)

All specified events must occur before execution. This is the most common pattern.

```javascript
waitFor: {
  all: [
    { pattern: 'userRegistered', correlationId: 'signup-123' },
    { pattern: 'emailVerified', correlationId: 'signup-123' },
    { pattern: 'profileCompleted', correlationId: 'signup-123' }
  ]
}
```

**Use Cases:**
- Order processing (payment + inventory + shipping)
- User onboarding (registration + verification + profile)
- Document approval (legal + technical + business review)

### Any Conditions (OR Logic)

Execution occurs when any one of the specified events happens.

```javascript
waitFor: {
  any: [
    { pattern: 'managerApproved', correlationId: 'expense-456' },
    { pattern: 'directorApproved', correlationId: 'expense-456' },
    { pattern: 'ceoApproved', correlationId: 'expense-456' }
  ]
}
```

**Use Cases:**
- Approval workflows (any authorized person can approve)
- Alert escalation (respond to any notification method)
- Fallback scenarios (primary or backup service responds)

### Count Conditions

Wait for a specific number of events matching a pattern.

```javascript
waitFor: {
  count: {
    pattern: 'voteReceived',
    correlationId: 'proposal-789',
    count: 5,
    where: { decision: 'approve' } // Optional: only count approvals
  }
}
```

**Use Cases:**
- Voting systems (need N approvals)
- Consensus mechanisms (majority agreement)
- Load balancing (wait for N responses)
- Quality assurance (multiple reviews)

### Sequence Conditions

Events must occur in a specific order.

```javascript
waitFor: {
  sequence: [
    { pattern: 'dataValidated', correlationId: 'import-321' },
    { pattern: 'backupCreated', correlationId: 'import-321' },
    { pattern: 'importStarted', correlationId: 'import-321' },
    { pattern: 'importCompleted', correlationId: 'import-321' }
  ]
}
```

**Use Cases:**
- Multi-step processes (data migration, deployment)
- Pipeline workflows (build → test → deploy)
- State machines (ordered state transitions)

### Mixed Conditions

Combine multiple condition types for complex scenarios.

```javascript
waitFor: {
  // Manager must approve AND either director approves OR admin overrides
  all: [
    { pattern: 'managerApproved', correlationId: 'budget-999' }
  ],
  any: [
    { pattern: 'directorApproved', correlationId: 'budget-999' },
    { pattern: 'adminOverride', correlationId: 'budget-999' }
  ]
}
```

## Advanced Features

### Property Filtering

Filter events based on their data properties using comparison operators.

```javascript
waitFor: {
  count: {
    pattern: 'bidReceived',
    correlationId: 'auction-555',
    count: 3,
    where: {
      amount: { $gte: 1000 },        // Amount >= 1000
      verified: { $eq: true },       // Must be verified
      bidder: { $ne: 'excluded_user' } // Not from excluded user
    }
  }
}
```

**Supported Operators:**
- `$eq` - Equal to
- `$ne` - Not equal to
- `$gt` - Greater than
- `$gte` - Greater than or equal to
- `$lt` - Less than
- `$lte` - Less than or equal to

### Timeout Handling

Set timeouts to prevent pending events from waiting forever.

```javascript
eventQueue.storeWhen({
  cmd: 'processOrder',
  waitFor: { /* conditions */ },
  timeout: 1800000 // 30 minutes in milliseconds
}, model, callbacks);

// Manually expire events
const expiredEvents = eventQueue.expirePendingEvents();
console.log(`${expiredEvents.length} events expired`);
```

### Event Cancellation

Cancel pending events to prevent execution even if conditions are met.

```javascript
const result = eventQueue.storeWhen({
  cmd: 'processPayment',
  waitFor: { /* conditions */ }
}, model, callbacks);

// Later, cancel if needed
const cancelled = eventQueue.cancelPendingEvent(result.pendingEventId);
if (cancelled) {
  console.log('Payment processing cancelled');
}
```

### Correlation-Based Queries

Find all pending events for a specific correlation ID.

```javascript
const pendingEvents = eventQueue.getPendingEventsByCorrelation('order-123');
console.log(`Order 123 has ${pendingEvents.length} pending events`);

// Show their wait conditions
pendingEvents.forEach(event => {
  const conditions = JSON.parse(event.wait_conditions);
  console.log(`Event ${event.id} waiting for:`, conditions);
});
```

## Best Practices

### 1. Use Descriptive Correlation IDs

```javascript
// Good - descriptive and unique
const correlationId = `order-${userId}-${Date.now()}`;
const correlationId = `workflow-deployment-${version}-${environment}`;

// Bad - generic or not unique
const correlationId = 'abc123';
const correlationId = 'order'; // Not unique!
```

### 2. Set Reasonable Timeouts

```javascript
// Good - appropriate timeouts for different scenarios
eventQueue.storeWhen({
  cmd: 'processPayment',
  waitFor: { /* conditions */ },
  timeout: 300000 // 5 minutes for payment
}, model, callbacks);

eventQueue.storeWhen({
  cmd: 'generateReport',
  waitFor: { /* conditions */ },
  timeout: 3600000 // 1 hour for reports
}, model, callbacks);
```

### 3. Handle Edge Cases

```javascript
// Always consider what happens if conditions are never met
eventQueue.storeWhen({
  cmd: 'processOrder',
  waitFor: {
    all: [
      { pattern: 'paymentReceived', correlationId: 'order-123' },
      { pattern: 'inventoryChecked', correlationId: 'order-123' }
    ]
  },
  timeout: 1800000 // 30 minutes
}, model, {
  ...callbacks,
  // Handle the case where the order times out
  _timeout: (event) => {
    console.log(`Order ${event.data.orderId} timed out`);
    // Maybe notify customer or cancel order
  }
});
```

### 4. Keep Conditions Simple

```javascript
// Good - clear and simple
waitFor: {
  all: [
    { pattern: 'userApproved', correlationId: orderId },
    { pattern: 'systemValidated', correlationId: orderId }
  ]
}

// Avoid - overly complex nested conditions
// Use multiple simpler events instead
```

### 5. Monitor Pending Events

```javascript
// Regularly check for stuck events
setInterval(() => {
  const pendingEvents = eventQueue.checkAllPendingEvents();
  const expiredEvents = eventQueue.expirePendingEvents();
  
  if (expiredEvents.length > 0) {
    console.warn(`${expiredEvents.length} events expired`);
  }
}, 60000); // Check every minute
```

## Debugging & Monitoring

### Inspect Pending Events

```javascript
// Get all pending events
const allPending = eventQueue.getPendingEventsByStatus('pending');
console.log('Pending events:', allPending);

// Get events for specific correlation
const orderPending = eventQueue.getPendingEventsByCorrelation('order-123');

// Check individual event conditions
orderPending.forEach(event => {
  const conditions = JSON.parse(event.wait_conditions);
  console.log(`Event ${event.id}:`, conditions);
  
  // Get wait condition details
  const waitConditions = eventQueue._queries.getWaitConditions.all({ 
    pending_event_id: event.id 
  });
  waitConditions.forEach(condition => {
    console.log(`- ${condition.condition_type}: ${condition.satisfied ? '✓' : '✗'}`);
  });
});
```

### Debug Condition Evaluation

```javascript
// Manually check if conditions would be satisfied
function debugConditions(pendingEventId) {
  const pendingEvent = eventQueue._queries.getPendingEventById.get({ id: pendingEventId });
  const waitConditions = JSON.parse(pendingEvent.wait_conditions);
  const conditions = eventQueue._queries.getWaitConditions.all({ pending_event_id: pendingEventId });
  
  console.log('Wait conditions:', waitConditions);
  console.log('Individual conditions:');
  
  conditions.forEach(condition => {
    const data = JSON.parse(condition.condition_data);
    console.log(`- ${condition.condition_type}: ${condition.satisfied ? '✓' : '✗'}`, data);
  });
}
```

### Performance Monitoring

```javascript
// Track wait condition performance
const startTime = Date.now();
const readyEvents = eventQueue.checkAllPendingEvents();
const checkTime = Date.now() - startTime;

console.log(`Checked ${readyEvents.length} events in ${checkTime}ms`);

if (checkTime > 1000) {
  console.warn('Wait condition checking is slow - consider optimizing queries');
}
```

## Performance Considerations

### Database Indexes

Wait conditions automatically create indexes for optimal performance:

```sql
-- Automatically created indexes
CREATE INDEX idx_pending_status ON pending_events(status);
CREATE INDEX idx_pending_correlation ON pending_events(correlation_id);
CREATE INDEX idx_pending_expires ON pending_events(expires_at);
CREATE INDEX idx_wait_conditions_pending ON wait_conditions(pending_event_id);
CREATE INDEX idx_wait_conditions_satisfied ON wait_conditions(satisfied);
```

### Optimization Tips

1. **Use Specific Correlation IDs**: Avoid broad correlation IDs that match too many events
2. **Set Timeouts**: Prevent accumulation of old pending events
3. **Clean Up Regularly**: Use `expirePendingEvents()` periodically
4. **Limit Complexity**: Avoid deeply nested or overly complex conditions
5. **Monitor Growth**: Watch pending event table size

```javascript
// Good - specific correlation ID
const correlationId = `order-${orderId}-${timestamp}`;

// Bad - too broad, matches many events
const correlationId = 'orders';
```

### Batch Processing

For high-volume scenarios, consider batch processing:

```javascript
// Process ready events in batches
function processPendingEventsBatch() {
  const batchSize = 100;
  let processed = 0;
  
  do {
    const readyEvents = eventQueue.checkAllPendingEvents();
    const executedEvents = eventQueue.executeReadyEvents(model, callbacks);
    processed = executedEvents.length;
    
    console.log(`Processed ${processed} events`);
  } while (processed === batchSize);
}

// Run batch processing periodically
setInterval(processPendingEventsBatch, 5000);
```

## Common Patterns

### Approval Workflow

```javascript
class ApprovalWorkflow {
  static async requestApproval(documentId, requiredApprovals) {
    const correlationId = `approval-${documentId}`;
    
    // Store pending approval event
    eventQueue.storeWhen({
      cmd: 'documentApproved',
      data: { documentId },
      correlationId,
      waitFor: {
        count: {
          pattern: 'approvalGranted',
          correlationId,
          count: requiredApprovals,
          where: { decision: 'approve' }
        }
      },
      timeout: 7200000 // 2 hours
    }, model, callbacks);
    
    // Notify approvers
    await this.notifyApprovers(documentId, correlationId);
  }
  
  static async grantApproval(documentId, approverId, decision) {
    const correlationId = `approval-${documentId}`;
    
    await eventQueue.store({
      cmd: 'approvalGranted',
      data: { documentId, approverId, decision },
      correlationId
    }, model, callbacks);
  }
}
```

### Order Processing Pipeline

```javascript
class OrderPipeline {
  static async processOrder(order) {
    const correlationId = `order-${order.id}`;
    
    // Create initial order
    await eventQueue.store({
      cmd: 'orderCreated',
      data: order,
      correlationId
    }, model, callbacks);
    
    // Process payment and inventory in parallel
    await Promise.all([
      this.processPayment(order, correlationId),
      this.checkInventory(order, correlationId)
    ]);
    
    // Ship when both are complete
    eventQueue.storeWhen({
      cmd: 'shipOrder',
      data: { orderId: order.id },
      correlationId,
      waitFor: {
        all: [
          { pattern: 'paymentConfirmed', correlationId },
          { pattern: 'inventoryReserved', correlationId }
        ]
      }
    }, model, callbacks);
  }
  
  static async processPayment(order, correlationId) {
    // Payment processing logic...
    await eventQueue.store({
      cmd: 'paymentConfirmed',
      data: { orderId: order.id, amount: order.total },
      correlationId
    }, model, callbacks);
  }
  
  static async checkInventory(order, correlationId) {
    // Inventory checking logic...
    await eventQueue.store({
      cmd: 'inventoryReserved',
      data: { orderId: order.id, items: order.items },
      correlationId
    }, model, callbacks);
  }
}
```

### Multi-Stage Deployment

```javascript
class DeploymentPipeline {
  static async deploy(version, environments) {
    const correlationId = `deploy-${version}`;
    
    // Deploy to staging first
    await eventQueue.store({
      cmd: 'deployToStaging',
      data: { version },
      correlationId
    }, model, callbacks);
    
    // Wait for staging tests to pass
    eventQueue.storeWhen({
      cmd: 'deployToProduction',
      data: { version },
      correlationId,
      waitFor: {
        sequence: [
          { pattern: 'stagingDeployComplete', correlationId },
          { pattern: 'integrationTestsPassed', correlationId },
          { pattern: 'stagingApproved', correlationId }
        ]
      }
    }, model, callbacks);
  }
}
```

## Troubleshooting

### Common Issues

**1. Events Never Execute**
```javascript
// Check if conditions are being met
const pending = eventQueue.getPendingEventsByCorrelation('order-123');
pending.forEach(event => {
  const conditions = eventQueue._queries.getWaitConditions.all({ 
    pending_event_id: event.id 
  });
  console.log('Conditions:', conditions);
});

// Check if events with matching patterns exist
const allEvents = eventQueue.getTransaction('order-123');
console.log('Events in correlation:', allEvents.map(e => e.cmd));
```

**2. Conditions Never Satisfied**
```javascript
// Verify correlation IDs match exactly
const condition = { pattern: 'paymentReceived', correlationId: 'order-123' };
const matchingEvents = eventQueue.getTransaction('order-123')
  .filter(e => e.cmd === 'paymentReceived');
console.log('Matching events:', matchingEvents);
```

**3. Performance Issues**
```javascript
// Check pending event count
const pendingCount = eventQueue._queries.getPendingEventsByStatus.all({ status: 'pending' }).length;
if (pendingCount > 1000) {
  console.warn(`High number of pending events: ${pendingCount}`);
  // Consider cleaning up expired events
  eventQueue.expirePendingEvents();
}
```

**4. Memory Leaks**
```javascript
// Regular cleanup of expired events
setInterval(() => {
  const expired = eventQueue.expirePendingEvents();
  const cancelled = eventQueue._queries.getPendingEventsByStatus.all({ status: 'cancelled' });
  
  // Clean up old cancelled/expired events from database
  // (Implementation depends on your cleanup policy)
}, 3600000); // Every hour
```

### Debug Helpers

```javascript
// Utility function to debug a specific pending event
function debugPendingEvent(pendingEventId) {
  const event = eventQueue._queries.getPendingEventById.get({ id: pendingEventId });
  if (!event) {
    console.log('Pending event not found');
    return;
  }
  
  console.log('Pending Event:', event);
  console.log('Wait Conditions:', JSON.parse(event.wait_conditions));
  
  const conditions = eventQueue._queries.getWaitConditions.all({ 
    pending_event_id: pendingEventId 
  });
  
  conditions.forEach(condition => {
    console.log(`${condition.condition_type}: ${condition.satisfied ? '✓' : '✗'}`);
    console.log('Data:', JSON.parse(condition.condition_data));
  });
  
  // Check available events
  const correlationEvents = eventQueue.getTransaction(event.correlation_id);
  console.log('Available events:', correlationEvents.map(e => ({ 
    id: e.id, 
    cmd: e.cmd, 
    data: e.data 
  })));
}

// Show all pending events summary
function showPendingEventsSummary() {
  const pending = eventQueue._queries.getPendingEventsByStatus.all({ status: 'pending' });
  
  console.log(`Total pending events: ${pending.length}`);
  
  const byCorrelation = pending.reduce((acc, event) => {
    acc[event.correlation_id] = (acc[event.correlation_id] || 0) + 1;
    return acc;
  }, {});
  
  console.log('By correlation ID:', byCorrelation);
  
  const old = pending.filter(e => Date.now() - e.created_at > 3600000); // 1 hour old
  if (old.length > 0) {
    console.warn(`${old.length} events are over 1 hour old`);
  }
}
```

This comprehensive guide should give you everything you need to effectively use wait conditions in your EventLite applications. The key is to start simple and gradually adopt more complex patterns as your use cases require them.