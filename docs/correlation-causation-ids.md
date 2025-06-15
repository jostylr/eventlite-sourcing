# Correlation and Causation IDs in Event Sourcing

## Overview

Correlation and Causation IDs are metadata fields that help track relationships between events in an event-sourced system. They provide crucial context for understanding how events relate to each other and enable powerful debugging, auditing, and monitoring capabilities.

## Correlation ID

A **Correlation ID** is a unique identifier that groups related events together across an entire business transaction or user journey, even across multiple services or systems.

### Purpose
- Track a complete business transaction from start to finish
- Group all events that are part of the same user action or workflow
- Enable distributed tracing across microservices
- Simplify debugging by filtering related events

### Example Scenario: E-commerce Order

When a user places an order, multiple events might occur:

```javascript
// All these events share the same correlation ID
const correlationId = "550e8400-e29b-41d4-a716-446655440000";

// Event 1: Order created
{
  id: 1,
  correlationId: "550e8400-e29b-41d4-a716-446655440000",
  causationId: null, // First event has no cause
  cmd: "createOrder",
  data: { customerId: "CUST001", items: [...] }
}

// Event 2: Payment processed (caused by order creation)
{
  id: 2,
  correlationId: "550e8400-e29b-41d4-a716-446655440000",
  causationId: 1, // Caused by event 1
  cmd: "processPayment",
  data: { orderId: 123, amount: 99.99 }
}

// Event 3: Inventory reserved (caused by order creation)
{
  id: 3,
  correlationId: "550e8400-e29b-41d4-a716-446655440000",
  causationId: 1, // Also caused by event 1
  cmd: "reserveInventory",
  data: { orderId: 123, items: [...] }
}

// Event 4: Email sent (caused by payment)
{
  id: 4,
  correlationId: "550e8400-e29b-41d4-a716-446655440000",
  causationId: 2, // Caused by event 2
  cmd: "sendConfirmationEmail",
  data: { orderId: 123, email: "customer@example.com" }
}
```

## Causation ID

A **Causation ID** is the ID of the event that directly caused the current event to be created. It creates a parent-child relationship between events.

### Purpose
- Track direct cause-and-effect relationships
- Build event dependency trees
- Understand event flow and business logic
- Enable compensation/rollback strategies

### Example: Event Chain Visualization

```
createOrder (id: 1)
├── processPayment (id: 2, causationId: 1)
│   ├── sendConfirmationEmail (id: 4, causationId: 2)
│   └── updateAccountBalance (id: 5, causationId: 2)
└── reserveInventory (id: 3, causationId: 1)
    └── updateStockLevels (id: 6, causationId: 3)
```

## Implementation Changes Required

### 1. Update Event Queue Schema

```sql
CREATE TABLE IF NOT EXISTS queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  version INTEGER DEFAULT 1,
  datetime INTEGER NOT NULL,
  user TEXT,
  ip TEXT,
  cmd TEXT NOT NULL,
  data TEXT,
  correlation_id TEXT,
  causation_id INTEGER,
  metadata TEXT,
  FOREIGN KEY (causation_id) REFERENCES queue(id)
);

-- Index for efficient correlation queries
CREATE INDEX idx_correlation_id ON queue(correlation_id);
CREATE INDEX idx_causation_id ON queue(causation_id);
```

### 2. Update Event Storage Method

```javascript
// event-source.js modifications
store({ user = "", ip = "", cmd, data = {}, version = 1, correlationId, causationId, metadata = {} }, model, cb) {
  // Generate correlation ID if not provided
  if (!correlationId && !causationId) {
    correlationId = generateUUID(); // New request, new correlation ID
  } else if (causationId && !correlationId) {
    // Inherit correlation ID from parent event
    const parentEvent = this.retrieveByID(causationId);
    if (parentEvent) {
      correlationId = parentEvent.correlation_id;
    }
  }

  const row = queries.storeRow.get({
    version,
    datetime: datetime(),
    user,
    ip,
    cmd,
    data: JSON.stringify(data),
    correlation_id: correlationId,
    causation_id: causationId,
    metadata: JSON.stringify(metadata)
  });
  
  // Continue with execution...
}
```

### 3. Add Query Methods

```javascript
// New query methods for the event queue
const queries = {
  // ... existing queries ...
  
  // Get all events with the same correlation ID
  getByCorrelationId: db.prepare(
    "SELECT * FROM queue WHERE correlation_id = $correlationId ORDER BY id"
  ),
  
  // Get direct children of an event
  getChildEvents: db.prepare(
    "SELECT * FROM queue WHERE causation_id = $causationId ORDER BY id"
  ),
  
  // Get the full event tree for a correlation
  getEventTree: db.prepare(`
    WITH RECURSIVE event_tree AS (
      SELECT * FROM queue WHERE correlation_id = $correlationId AND causation_id IS NULL
      UNION ALL
      SELECT q.* FROM queue q
      INNER JOIN event_tree et ON q.causation_id = et.id
    )
    SELECT * FROM event_tree ORDER BY id
  `)
};
```

### 4. Enhanced Methods

```javascript
const methods = {
  // Get all events in a transaction
  getTransaction(correlationId) {
    return queries.getByCorrelationId.all({ correlationId })
      .map(row => ({ ...row, data: JSON.parse(row.data) }));
  },

  // Get event lineage
  getEventLineage(eventId) {
    const event = this.retrieveByID(eventId);
    if (!event) return null;

    const lineage = {
      event,
      parent: null,
      children: []
    };

    // Get parent
    if (event.causation_id) {
      lineage.parent = this.retrieveByID(event.causation_id);
    }

    // Get children
    lineage.children = queries.getChildEvents.all({ causationId: eventId })
      .map(row => ({ ...row, data: JSON.parse(row.data) }));

    return lineage;
  },

  // Store event with automatic correlation inheritance
  storeWithContext(eventData, context, model, cb) {
    const enrichedEvent = {
      ...eventData,
      correlationId: context.correlationId,
      causationId: context.causationId || context.parentEventId,
      metadata: {
        ...eventData.metadata,
        ...context.metadata
      }
    };

    return this.store(enrichedEvent, model, cb);
  }
};
```

## Use Cases

### 1. Distributed Tracing

Track a user action across multiple services:

```javascript
// API Gateway
const correlationId = generateUUID();
eventQueue.store({
  correlationId,
  cmd: 'userLogin',
  data: { username: 'alice' }
});

// Auth Service (different process/service)
eventQueue.store({
  correlationId, // Same ID passed along
  causationId: loginEventId,
  cmd: 'generateToken',
  data: { userId: 123 }
});

// User Service
eventQueue.store({
  correlationId, // Still the same ID
  causationId: loginEventId,
  cmd: 'updateLastLogin',
  data: { userId: 123 }
});
```

### 2. Saga Pattern Implementation

Implement long-running transactions with compensation:

```javascript
// Start a saga
const sagaId = generateUUID();
const bookingEvents = [];

// Book flight
const flightEvent = await eventQueue.store({
  correlationId: sagaId,
  cmd: 'bookFlight',
  data: { flight: 'AA123' },
  metadata: { sagaStep: 1, compensationCmd: 'cancelFlight' }
});
bookingEvents.push(flightEvent);

// Book hotel
try {
  const hotelEvent = await eventQueue.store({
    correlationId: sagaId,
    causationId: flightEvent.id,
    cmd: 'bookHotel',
    data: { hotel: 'Hilton' },
    metadata: { sagaStep: 2, compensationCmd: 'cancelHotel' }
  });
  bookingEvents.push(hotelEvent);
} catch (error) {
  // Compensate by reversing previous events
  for (const event of bookingEvents.reverse()) {
    await eventQueue.store({
      correlationId: sagaId,
      causationId: event.id,
      cmd: event.metadata.compensationCmd,
      data: event.data,
      metadata: { compensation: true }
    });
  }
}
```

### 3. Debugging and Auditing

```javascript
// Find all events related to a problem
function debugTransaction(correlationId) {
  const events = eventQueue.methods.getTransaction(correlationId);
  
  console.log(`Transaction ${correlationId}:`);
  events.forEach(event => {
    console.log(`  ${event.datetime}: ${event.cmd} (caused by: ${event.causation_id || 'user action'})`);
    if (event.metadata?.error) {
      console.log(`    ERROR: ${event.metadata.error}`);
    }
  });
}

// Analyze event patterns
function analyzeEventFlow(startDate, endDate) {
  const events = eventQueue.methods.getEventsByDateRange(startDate, endDate);
  
  // Group by correlation ID
  const transactions = {};
  events.forEach(event => {
    if (!transactions[event.correlation_id]) {
      transactions[event.correlation_id] = [];
    }
    transactions[event.correlation_id].push(event);
  });
  
  // Analyze patterns
  const patterns = {
    avgEventsPerTransaction: 0,
    commonEventChains: {},
    failurePoints: []
  };
  
  // ... analysis logic ...
  
  return patterns;
}
```

## Benefits

1. **Complete Audit Trail**: See the full context of why something happened
2. **Debugging**: Easily trace through complex event flows
3. **Monitoring**: Track business transactions end-to-end
4. **Analytics**: Understand user behavior and system patterns
5. **Error Recovery**: Implement compensation strategies
6. **Testing**: Replay specific transaction scenarios

## Best Practices

1. **Always Include Correlation ID**: Every event should have one, even if generated
2. **Inherit Context**: Child events should inherit the parent's correlation ID
3. **Meaningful IDs**: Use UUIDs or other globally unique identifiers
4. **Index Fields**: Add database indexes for efficient querying
5. **Include Metadata**: Add helpful context like service name, version, etc.
6. **Security**: Don't include sensitive data in correlation IDs
7. **Retention**: Consider correlation ID lifecycle and cleanup strategies

## Future Enhancements

1. **Event Streaming**: Subscribe to events by correlation ID
2. **Visualization**: Generate event flow diagrams automatically
3. **Analytics Dashboard**: Real-time transaction monitoring
4. **Distributed Tracing Integration**: OpenTelemetry compatibility
5. **Smart Replay**: Replay only specific transaction branches