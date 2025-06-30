# API Documentation

This document provides a comprehensive reference for all functions, methods, and options available in EventLite Sourcing.

## Table of Contents

- [Core Functions](#core-functions)
  - [initQueue](#initqueue)
  - [modelSetup](#modelsetup)
  - [eventCallbacks](#eventcallbacks)
- [Event Queue Methods](#event-queue-methods)
  - [store](#store)
  - [storeWhen](#storewhen)
  - [execute](#execute)
  - [retrieveByID](#retrievebyid)
  - [cycleThrough](#cyclethrough)
- [Wait Conditions](#wait-conditions)
  - [Overview](#wait-conditions-overview)
  - [API Reference](#wait-conditions-api)
  - [Condition Types](#condition-types)
  - [Examples](#wait-conditions-examples)
- [Performance & Scalability](#performance--scalability)
  - [Index Configuration](#index-configuration)
  - [Query Caching](#query-caching)
  - [Pagination](#pagination)
  - [Streaming](#streaming)
  - [Bulk Operations](#bulk-operations)
  - [Background Jobs](#background-jobs)
- [Model Configuration](#model-configuration)
  - [Tables Function](#tables-function)
  - [Queries Function](#queries-function)
  - [Methods Function](#methods-function)
- [Callback System](#callback-system)
  - [Callback Object Structure](#callback-object-structure)
  - [Pre-built Callbacks](#pre-built-callbacks)
- [Data Types](#data-types)
  - [Event Row](#event-row)
  - [Model Object](#model-object)
  - [Error Object](#error-object)
- [Event Helpers API](#event-helpers-api)
  - [PatternedEventStore](#patternedeventstore)
  - [EventChainBuilder](#eventchainbuilder)
  - [EventPatternQueries](#eventpatternqueries)
  - [EventPatternValidator](#eventpatternvalidator)
  - [CorrelationContext](#correlationcontext)
  - [Factory Functions](#factory-functions)
- [File Storage API](#file-storage-api)
  - [FileStorageManager](#filestoragemanager)
  - [FileProcessor](#fileprocessor)
- [Snapshot Management](#snapshot-management)
  - [initSnapshots](#initsnapshots)
  - [SnapshotManager](#snapshotmanager)

## Core Functions

### initQueue

Initializes an event queue for storing and replaying events.

```javascript
initQueue(options?: QueueOptions): EventQueue
```

#### Parameters

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `options` | `QueueOptions` | `{}` | Configuration options for the event queue |

#### QueueOptions

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `dbName` | `string` | `'data/events.sqlite'` | Path to the SQLite database file for storing events |
| `init` | `object` | `{ create: true, strict: true }` | SQLite initialization options |
| `hash` | `object` | `undefined` | Password hashing configuration using Bun.password |
| `noWAL` | `boolean` | `false` | Disable Write-Ahead Logging mode |
| `risky` | `boolean` | `false` | Enable test mode with reset() method (use only for testing) |
| `reset` | `boolean` | `false` | Reset the event queue database (use only for testing) |
| `datetime` | `function` | `() => Date.now()` | Function to generate timestamps |

#### Returns

An `EventQueue` object containing:

```javascript
{
  queries: {
    // Internal database queries
  },
  methods: {
    store: Function,
    execute: Function,
    retrieveByID: Function,
    cycleThrough: Function,
    getTransaction: Function,
    getChildEvents: Function,
    getEventLineage: Function,
    storeWithContext: Function,
    reset?: Function  // Only if risky: true
  }
}
```

#### Example

```javascript
const eventQueue = initQueue({
  dbName: 'data/my-events.sqlite',
  hash: { algorithm: 'argon2id' },
  noWAL: false
});
```

### modelSetup

Creates a model representing the current state of your application.

```javascript
modelSetup(options?: ModelOptions): Model
```

#### Parameters

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `options` | `ModelOptions` | `{}` | Configuration options for the model |

#### ModelOptions

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `dbName` | `string` | `'data/model.sqlite'` | Path to the SQLite database file for model state |
| `init` | `object` | `{ create: true, strict: true }` | SQLite initialization options |
| `noWAL` | `boolean` | `false` | Disable Write-Ahead Logging mode |
| `tables` | `function` | `undefined` | Function to create database tables |
| `queries` | `function` | `undefined` | Function to create prepared queries |
| `methods` | `function/object` | `undefined` | Event handler methods |
| `migrations` | `function` | `undefined` | Function to define event version migrations |
| `reset` | `array` | `undefined` | Reset strategy: `['move']`, `['rename']`, or `['delete']` |
| `done` | `function` | `undefined` | Called when model is successfully set up |
| `error` | `function` | `undefined` | Called if setup fails |
| `stub` | `boolean` | `false` | Create a stub model for testing |
| `default` | `function` | `undefined` | Default handler for unknown commands |

#### Returns

A `Model` object containing:

```javascript
{
  queries: object,     // Prepared database queries
  methods: object,     // Event handler methods
  _done?: function,    // Success callback
  _error?: function,   // Error callback
  _default?: function, // Default command handler
  _migrations?: object // Event version migrations
}
```

#### Example

```javascript
const model = modelSetup({
  dbName: 'data/app-state.sqlite',
  tables(db) {
    db.query('CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT)').run();
  },
  queries(db) {
    return {
      createItem: db.query('INSERT INTO items (name) VALUES ($name)'),
      getItem: db.query('SELECT * FROM items WHERE id = $id')
    };
  },
  methods(queries) {
    return {
      createItem({ name }) {
        const result = queries.createItem.run({ name });
        return { id: result.lastInsertRowid, name };
      }
    };
  }
});
```

### eventCallbacks

Pre-built callback handlers for common scenarios.

```javascript
eventCallbacks: {
  stub: CallbackObject,
  void: CallbackObject,
  error: CallbackObject,
  done: Function
}
```

#### Available Callbacks

| Name | Description | Use Case |
|------|-------------|----------|
| `stub` | Logs all events and errors to console | Development and debugging |
| `void` | No-op callbacks (silent operation) | Production when no side effects needed |
| `error` | Only logs errors, ignores successful events | Error monitoring |
| `done` | Simple function callback | Completion notifications |

## Event Queue Methods

### store

Store and execute an event.

```javascript
async store(
  event: EventData,
  model: Model,
  callback: CallbackObject
): Promise<void>
```

#### Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `event` | `EventData` | Yes | The event to store and execute |
| `model` | `Model` | Yes | The model to execute against |
| `callback` | `CallbackObject` | Yes | Callbacks for handling results |

#### EventData

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `user` | `string` | `''` | User identifier |
| `ip` | `string` | `''` | IP address |
| `cmd` | `string` | Required | Command name (must match a model method) |
| `data` | `object` | `{}` | Data to pass to the command |
| `version` | `number` | `1` | Event version for migration support |
| `correlationId` | `string` | Auto-generated | Groups related events together |
| `causationId` | `number` | `null` | ID of the event that caused this one |
| `metadata` | `object` | `{}` | Additional event metadata |

#### Special Fields

If `data` contains a field named `user_password` and hash options are configured, it will be automatically hashed before storage.

#### Example

```javascript
await eventQueue.store({
  user: 'alice',
  ip: '192.168.1.1',
  cmd: 'createItem',
  data: { name: 'Widget' }
}, model, eventCallbacks.stub);
```

### storeWhen

Store an event with wait conditions. If wait conditions are provided, the event is stored as pending and executed only when all conditions are met. If no wait conditions are provided, behaves exactly like `store()`.

```javascript
storeWhen(
  event: {
    user?: string,
    ip?: string,
    cmd: string,
    data?: object,
    version?: number,
    correlationId?: string,
    causationId?: number,
    metadata?: object,
    waitFor?: WaitForConditions,
    timeout?: number
  },
  model: Model,
  callbacks: CallbackObject
): PendingEventResult | Promise<any>
```

**Parameters:**
- `event.waitFor` - Wait conditions that must be satisfied before execution
- `event.timeout` - Optional timeout in milliseconds for pending events
- All other parameters are the same as `store()`

**Returns:**
- If `waitFor` is provided: `{ pendingEventId: number, status: 'pending' }`
- If `waitFor` is not provided: Same return value as `store()`

**Example:**
```javascript
// Wait for payment AND inventory check
const result = eventQueue.storeWhen({
  cmd: 'processOrder',
  data: { orderId: 123 },
  correlationId: 'order-123',
  waitFor: {
    all: [
      { pattern: 'paymentReceived', correlationId: 'order-123' },
      { pattern: 'inventoryChecked', correlationId: 'order-123' }
    ]
  },
  timeout: 60000 // 1 minute
}, model, callbacks);

console.log(result); // { pendingEventId: 1, status: 'pending' }
```

### execute

Execute a previously stored event.

```javascript
async execute(
  row: EventRow,
  model: Model,
  callback: CallbackObject
): Promise<void>
```

#### Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `row` | `EventRow` | Yes | Event row from the database |
| `model` | `Model` | Yes | The model to execute against |
| `callback` | `CallbackObject` | Yes | Callbacks for handling results |

### retrieveByID

Get a specific event by its ID.

```javascript
retrieveByID(id: number): EventRow | undefined
```

#### Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | `number` | Yes | The event ID (rowid) |

#### Returns

The event row if found, otherwise `undefined`.

### cycleThrough

Replay events from the queue to rebuild state.

```javascript
cycleThrough(
  model: Model,
  doneCB?: Function,
  whileCB?: CallbackObject,
  startId?: number
): void
```

#### Parameters

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `model` | `Model` | Required | The model to execute against |
| `doneCB` | `Function` | `() => {}` | Called when replay is complete |
| `whileCB` | `CallbackObject` | `eventCallbacks.void` | Callbacks for each event |
| `startId` | `number` | `0` | Start replay from this event ID |

#### Example

```javascript
// Replay all events
eventQueue.cycleThrough(model, () => {
  console.log('State rebuilt successfully');
});

// Replay from checkpoint
eventQueue.cycleThrough(model, 
  () => console.log('Partial replay complete'),
  eventCallbacks.void,
  { start: 1000 }  // Start from event ID 1000
);

// Replay a specific range
eventQueue.cycleThrough(model,
  () => console.log('Range replay complete'),
  eventCallbacks.void,
  { start: 1000, stop: 2000 }  // Events 1000-1999
);
```

### getTransaction

Get all events with the same correlation ID.

```javascript
getTransaction(correlationId: string): EventRow[]
```

#### Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `correlationId` | `string` | Yes | The correlation ID to search for |

#### Returns

Array of event rows with parsed data and metadata.

### getChildEvents

Get all events directly caused by a specific event.

```javascript
getChildEvents(eventId: number): EventRow[]
```

#### Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `eventId` | `number` | Yes | The parent event ID |

#### Returns

Array of child event rows.

### getEventLineage

Get the complete lineage of an event (parent and children).

```javascript
getEventLineage(eventId: number): EventLineage | null
```

#### Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `eventId` | `number` | Yes | The event ID to get lineage for |

#### Returns

```typescript
{
  event: EventRow,      // The requested event
  parent: EventRow | null,  // Parent event if any
  children: EventRow[]  // Direct child events
}
```

### storeWithContext

Store an event with inherited context.

```javascript
storeWithContext(
  eventData: EventData,
  context: EventContext,
  model: Model,
  callback: CallbackObject
): Promise<any>
```

#### Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `eventData` | `EventData` | Yes | The event data |
| `context` | `EventContext` | Yes | Context to inherit |
| `model` | `Model` | Yes | The model to execute against |
| `callback` | `CallbackObject` | Yes | Callbacks for handling results |

#### EventContext

| Property | Type | Description |
|----------|------|-------------|
| `correlationId` | `string` | Correlation ID to use |
| `causationId` | `number` | Event ID that caused this |
| `parentEventId` | `number` | Alternative to causationId |
| `metadata` | `object` | Additional metadata to merge |

## Wait Conditions

### Wait Conditions Overview

Wait conditions allow you to store events that execute only after specific prerequisite events have occurred. This enables complex multi-step workflows while maintaining the event sourcing pattern's integrity.

**Key Benefits:**
- **Declarative**: Express complex dependencies clearly in event metadata
- **Non-blocking**: Pending events don't block the main event flow
- **Flexible**: Support for AND, OR, count, and sequence dependencies
- **Timeout Support**: Automatic cleanup of expired pending events
- **Replay Safe**: Works correctly during event replay scenarios

### Wait Conditions API

#### checkAllPendingEvents()

Check all pending events and mark any with satisfied conditions as ready for execution.

```javascript
checkAllPendingEvents(): PendingEvent[]
```

**Returns:** Array of events that are now ready for execution.

#### executeReadyEvents()

Execute all events that have satisfied wait conditions.

```javascript
executeReadyEvents(model: Model, callbacks: CallbackObject): ExecutedEvent[]
```

**Returns:** Array of `{ pendingEvent, result }` objects for executed events.

#### expirePendingEvents()

Mark expired pending events based on their timeout settings.

```javascript
expirePendingEvents(): PendingEvent[]
```

**Returns:** Array of events that were marked as expired.

#### cancelPendingEvent()

Cancel a pending event, preventing it from executing even if conditions are met.

```javascript
cancelPendingEvent(pendingEventId: number): boolean
```

**Returns:** `true` if successfully cancelled, `false` if event not found or already processed.

#### getPendingEventsByCorrelation()

Get all pending events for a specific correlation ID.

```javascript
getPendingEventsByCorrelation(correlationId: string): PendingEvent[]
```

### Condition Types

#### All Conditions (AND Logic)

All specified conditions must be satisfied for the event to execute.

```javascript
waitFor: {
  all: [
    { pattern: 'paymentReceived', correlationId: 'order-123' },
    { pattern: 'inventoryChecked', correlationId: 'order-123' },
    { pattern: 'addressValidated', correlationId: 'order-123' }
  ]
}
```

#### Any Conditions (OR Logic)

At least one of the specified conditions must be satisfied.

```javascript
waitFor: {
  any: [
    { pattern: 'managerApproved', correlationId: 'request-456' },
    { pattern: 'directorApproved', correlationId: 'request-456' },
    { pattern: 'adminOverride', correlationId: 'request-456' }
  ]
}
```

#### Count Conditions

Wait for a specific number of events matching a pattern.

```javascript
waitFor: {
  count: {
    pattern: 'approved',
    correlationId: 'loan-789',
    count: 3,
    where: { amount: { $gte: 1000 } } // Optional property filter
  }
}
```

#### Sequence Conditions

Wait for events to occur in a specific order.

```javascript
waitFor: {
  sequence: [
    { pattern: 'step1Complete', correlationId: 'workflow-321' },
    { pattern: 'step2Complete', correlationId: 'workflow-321' },
    { pattern: 'step3Complete', correlationId: 'workflow-321' }
  ]
}
```

#### Mixed Conditions

Combine multiple condition types for complex dependencies.

```javascript
waitFor: {
  all: [
    { pattern: 'managerApproved', correlationId: 'request-999' }
  ],
  any: [
    { pattern: 'directorApproved', correlationId: 'request-999' },
    { pattern: 'adminOverride', correlationId: 'request-999' }
  ]
}
```

#### Property Filtering

Use `where` clauses with comparison operators to filter events by their data properties.

**Supported Operators:**
- `$eq`: Equal to
- `$ne`: Not equal to  
- `$gt`: Greater than
- `$gte`: Greater than or equal to
- `$lt`: Less than
- `$lte`: Less than or equal to

```javascript
waitFor: {
  count: {
    pattern: 'bidReceived',
    correlationId: 'auction-555',
    count: 5,
    where: {
      amount: { $gte: 100 },
      verified: { $eq: true }
    }
  }
}
```

### Wait Conditions Examples

#### Order Processing Workflow

```javascript
// 1. Create order
await eventQueue.store({
  cmd: 'createOrder',
  data: { userId: 'user123', items: ['item1', 'item2'] },
  correlationId: 'order-456'
}, model, callbacks);

// 2. Store event that waits for payment and inventory
const waitResult = eventQueue.storeWhen({
  cmd: 'processOrder',
  data: { orderId: 456 },
  correlationId: 'order-456',
  waitFor: {
    all: [
      { pattern: 'paymentReceived', correlationId: 'order-456' },
      { pattern: 'inventoryVerified', correlationId: 'order-456' }
    ]
  },
  timeout: 1800000 // 30 minutes
}, model, callbacks);

// 3. When payment is received
await eventQueue.store({
  cmd: 'paymentReceived',
  data: { orderId: 456, amount: 99.99, method: 'card' },
  correlationId: 'order-456',
  causationId: 1 // Caused by createOrder
}, model, callbacks);

// 4. When inventory is verified  
await eventQueue.store({
  cmd: 'inventoryVerified',
  data: { orderId: 456, available: true },
  correlationId: 'order-456',
  causationId: 1 // Caused by createOrder
}, model, callbacks);

// 5. processOrder event now executes automatically
```

#### Approval Workflow

```javascript
// Require both manager approval AND (director approval OR admin override)
eventQueue.storeWhen({
  cmd: 'processExpense',
  data: { expenseId: 789, amount: 5000 },
  correlationId: 'expense-789',
  waitFor: {
    all: [
      { pattern: 'managerApproved', correlationId: 'expense-789' }
    ],
    any: [
      { pattern: 'directorApproved', correlationId: 'expense-789' },
      { pattern: 'adminOverride', correlationId: 'expense-789' }
    ]
  }
}, model, callbacks);
```

#### Manual Event Processing

```javascript
// Check for ready events manually
const readyEvents = eventQueue.checkAllPendingEvents();
console.log(`${readyEvents.length} events ready for execution`);

// Execute ready events
const executedEvents = eventQueue.executeReadyEvents(model, callbacks);
console.log(`Executed ${executedEvents.length} pending events`);

// Clean up expired events
const expiredEvents = eventQueue.expirePendingEvents();
console.log(`${expiredEvents.length} events expired`);

// Cancel a specific pending event
const cancelled = eventQueue.cancelPendingEvent(pendingEventId);
if (cancelled) {
  console.log('Event cancelled successfully');
}
```

## Snapshot API

### initSnapshots

Initialize a snapshot manager for saving and restoring model state.

```javascript
initSnapshots(options?: SnapshotOptions): SnapshotManager
```

#### SnapshotOptions

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `dbName` | `string` | `'data/snapshots.sqlite'` | Path to snapshot database |
| `init` | `object` | `{ create: true, strict: true }` | SQLite initialization options |
| `noWAL` | `boolean` | `false` | Disable Write-Ahead Logging |

### SnapshotManager Methods

#### createSnapshot

Save current model state.

```javascript
async createSnapshot(
  modelName: string,
  eventId: number,
  model: Model,
  metadata?: object
): Promise<CreateSnapshotResult>
```

#### restoreSnapshot

Restore model state from a snapshot.

```javascript
async restoreSnapshot(
  modelName: string,
  eventId: number,
  model: Model
): Promise<RestoreSnapshotResult>
```

Returns:
```typescript
{
  success: boolean,
  eventId: number,      // Snapshot was taken at this event
  replayFrom: number,   // Start replaying from this event ID
  metadata?: object
}
```

#### listSnapshots

List available snapshots.

```javascript
listSnapshots(
  modelName: string,
  limit?: number,
  offset?: number
): SnapshotInfo[]
```

#### deleteSnapshot

Delete a specific snapshot.

```javascript
deleteSnapshot(modelName: string, eventId: number): boolean
```

#### deleteOldSnapshots

Clean up old snapshots.

```javascript
deleteOldSnapshots(modelName: string, keepAfterEventId: number): number
```

## Performance & Scalability

EventLite Sourcing includes comprehensive performance optimization features. For detailed guidance, see the [Performance Guide](./Performance-Guide.md).

### Index Configuration

Configure database indexes to balance write performance vs query speed:

```javascript
const eventQueue = initQueue({
  indexes: {
    // Core indexes (recommended to keep)
    correlation_id: true,     // Event transaction grouping
    causation_id: true,       // Event relationship tracking
    
    // Performance indexes (enable based on usage)
    cmd: false,               // Command-based filtering
    user: false,              // User-based queries
    datetime: false,          // Time-range queries
    version: false,           // Version-based filtering
    
    // Composite indexes (highest overhead)
    correlation_cmd: false,   // Correlation + command queries
    user_datetime: false,     // User + time range queries
  }
});
```

**Performance Impact:**
- Minimal indexes (2): ~900 events/sec with WAL
- Balanced indexes (4-5): ~400 events/sec  
- All indexes (8): ~220 events/sec

### Query Caching

Enable caching for frequently accessed data:

```javascript
const eventQueue = initQueue({
  cache: {
    enabled: true,
    maxSize: 1000,        // Number of cached items
    ttl: 300000,          // 5 minutes in milliseconds
  }
});

// Use cached methods
const event = eventQueue.retrieveByIDCached(id);
const transaction = eventQueue.getTransactionCached(correlationId);

// Cache management
const stats = eventQueue.getCacheStats();
eventQueue.clearCache();
```

### Pagination

Handle large result sets efficiently:

```javascript
// Paginated correlation query
const page = eventQueue.getByCorrelationIdPaginated(correlationId, {
  limit: 100,
  offset: 0
});

console.log({
  events: page.events,        // Array of events
  totalCount: page.totalCount, // Total matching events
  hasMore: page.hasMore,      // Boolean: more pages available
  nextOffset: page.nextOffset // Next offset or null
});

// Other paginated methods
eventQueue.getChildEventsPaginated(eventId, { limit: 50 });
eventQueue.getEventsByUserPaginated(user, { limit: 100 });
eventQueue.getEventsByCmdPaginated(cmd, { limit: 200 });
eventQueue.getEventsInTimeRangePaginated(start, end, { limit: 100 });
```

### Streaming

Process large datasets with memory efficiency:

```javascript
// Stream all events in batches
for await (const batch of eventQueue.streamEvents({ batchSize: 1000 })) {
  console.log(`Processing batch of ${batch.length} events`);
  await processBatch(batch);
}

// Stream with filtering
for await (const batch of eventQueue.streamEvents({
  batchSize: 500,
  correlationId: 'specific-correlation',
  user: 'specific-user',
  cmd: 'specific-command',
  startId: 1000,
  endId: 5000
})) {
  await processBatch(batch);
}
```

### Bulk Operations

High-performance bulk operations:

```javascript
// Bulk event insertion (40x faster than individual writes)
const events = [
  { cmd: 'createUser', data: { name: 'Alice' } },
  { cmd: 'createUser', data: { name: 'Bob' } },
  // ... many more events
];

const results = eventQueue.storeBulk(events, model, callbacks);

// Bulk export/import utilities
import { BulkOperations } from 'eventlite-sourcing';

const bulkOps = new BulkOperations(eventQueue);

// Export to JSON Lines format
await bulkOps.exportToJSONL('events.jsonl', {
  batchSize: 1000,
  startId: 0,
  correlationId: 'specific-correlation'
});

// Export to CSV format  
await bulkOps.exportToCSV('events.csv', {
  includeHeaders: true,
  batchSize: 1000
});

// Import from JSON Lines
const result = await bulkOps.importFromJSONL('events.jsonl', {
  batchSize: 100,
  validate: true,
  skipErrors: false
});

// Batch processing with custom function
await bulkOps.batchProcess(async (batch) => {
  // Process each batch of events
  return await analyzeEvents(batch);
}, {
  batchSize: 100,
  parallel: true,
  maxConcurrency: 4
});

// Get processing statistics
const stats = await bulkOps.getProcessingStats();
console.log({
  totalEvents: stats.totalEvents,
  eventsByCommand: stats.eventsByCommand,
  dateRange: stats.dateRange
});
```

### Background Jobs

Event-driven background job processing:

```javascript
import { BackgroundJobQueue, EventJobProcessor } from 'eventlite-sourcing';

// Create job queue
const jobQueue = new BackgroundJobQueue({
  maxHistorySize: 1000,
  defaultTimeout: 30000,
  processingIntervalMs: 1000
});

// Register job workers
jobQueue.registerWorker('sendEmail', async (data, job) => {
  await sendEmailService(data.recipient, data.subject, data.body);
  return { emailSent: true, timestamp: Date.now() };
}, {
  timeout: 10000,
  retryAttempts: 3,
  retryDelay: 1000
});

// Start job processing
jobQueue.start();

// Create event-job processor
const eventJobProcessor = new EventJobProcessor(eventQueue, jobQueue);

// Map events to background jobs
eventJobProcessor.onEvent('userRegistered', 'sendEmail', (eventRow) => ({
  recipient: eventRow.data.email,
  subject: 'Welcome!',
  body: `Welcome ${eventRow.data.name}!`
}));

// Add jobs manually
const jobId = jobQueue.addJob('sendEmail', {
  recipient: 'user@example.com',
  subject: 'Hello',
  body: 'Hello World!'
});

// Schedule jobs
const scheduledJobId = jobQueue.scheduleJob('sendEmail', data, Date.now() + 60000);

// Recurring jobs
const recurringJobId = jobQueue.scheduleRecurringJob('cleanup', {}, 3600000); // Every hour

// Monitor job status
const status = jobQueue.getJobStatus(jobId);
const queueStats = jobQueue.getQueueStats();

// Stop processing
jobQueue.stop();
```

**Performance Configurations:**

```javascript
// High-volume ingestion (maximum write speed)
const fastQueue = initQueue({
  WAL: true,
  indexes: { correlation_id: true, causation_id: true },
  cache: { enabled: false }
});

// Balanced workload
const balancedQueue = initQueue({
  WAL: true,
  indexes: { 
    correlation_id: true, 
    causation_id: true, 
    cmd: true, 
    datetime: true 
  },
  cache: { enabled: true, maxSize: 1000, ttl: 300000 }
});

// Query-optimized (maximum query performance)
const queryQueue = initQueue({
  WAL: true,
  indexes: { 
    correlation_id: true, 
    causation_id: true, 
    cmd: true, 
    user: true, 
    datetime: true, 
    version: true,
    correlation_cmd: true
  },
  cache: { enabled: true, maxSize: 5000, ttl: 600000 }
});
```

## Model Configuration

### Tables Function

Defines the database schema for your model.

```javascript
tables(db: Database): void
```

#### Parameters

| Name | Type | Description |
|------|------|-------------|
| `db` | `Database` | Bun SQLite database instance |

#### Example

```javascript
tables(db) {
  db.query(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      email TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )
  `).run();
  
  db.query(`
    CREATE TABLE posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      content TEXT,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `).run();
}
```

### Queries Function

Creates prepared SQL statements for efficient database operations.

```javascript
queries(db: Database): object
```

#### Parameters

| Name | Type | Description |
|------|------|-------------|
| `db` | `Database` | Bun SQLite database instance |

#### Returns

An object containing prepared query statements.

#### Example

```javascript
queries(db) {
  return {
    // User queries
    createUser: db.query('INSERT INTO users (username, email, created_at) VALUES ($username, $email, $created_at)'),
    getUserById: db.query('SELECT * FROM users WHERE id = $id'),
    getUserByUsername: db.query('SELECT * FROM users WHERE username = $username'),
    
    // Post queries
    createPost: db.query('INSERT INTO posts (user_id, title, content, created_at) VALUES ($user_id, $title, $content, $created_at)'),
    getPostsByUser: db.query('SELECT * FROM posts WHERE user_id = $user_id ORDER BY created_at DESC'),
    
    // Complex queries
    getUserWithPosts: db.query(`
      SELECT u.*, COUNT(p.id) as post_count
      FROM users u
      LEFT JOIN posts p ON u.id = p.user_id
      WHERE u.id = $id
      GROUP BY u.id
    `)
  };
}
```

### Methods Function

Defines event handlers that process commands and update state.

```javascript
methods(queries: object): object
```

#### Parameters

| Name | Type | Description |
|------|------|-------------|
| `queries` | `object` | The prepared queries returned by the queries function |

#### Method Signature

Each method receives:

```javascript
methodName(data: object, metadata: object): any
```

| Parameter | Description |
|-----------|-------------|
| `data` | The data object from the event (after migrations) |
| `metadata` | Event metadata: `{ datetime, user, ip, cmd, id, version, correlationId, causationId, metadata }` |

#### Example

```javascript
methods(queries) {
  return {
    createUser({ username, email }, { datetime }) {
      const created_at = Date.parse(datetime);
      const result = queries.createUser.run({ username, email, created_at });
      return { userId: result.lastInsertRowid, username, email };
    },
    
    createPost({ userId, title, content }, { datetime, user }) {
      // Verify user exists
      const author = queries.getUserById.get({ id: userId });
      if (!author) {
        throw new Error(`User ${userId} not found`);
      }
      
      const created_at = Date.parse(datetime);
      const result = queries.createPost.run({
        user_id: userId,
        title,
        content,
        created_at
      });
      
      return { postId: result.lastInsertRowid, title, author: author.username };
    },
    
    // Default handler for unknown commands
    _default(data, metadata) {
      console.warn(`Unknown command: ${metadata.cmd}`);
      return { error: 'Unknown command' };
    }
  };
}
```

### Migrations Function

Defines version migrations for evolving event schemas.

```javascript
migrations(): object
```

#### Returns

An object mapping command names to arrays of migration functions.

#### Migration Function Signature

```javascript
(data: object) => object
```

Each migration transforms data from one version to the next.

#### Example

```javascript
migrations() {
  return {
    updateStatus: [
      // Version 1 -> 2: Rename status values
      (data) => {
        const statusMap = {
          'inactive': 'disabled',
          'active': 'enabled'
        };
        return {
          ...data,
          status: statusMap[data.status] || data.status
        };
      },
      // Version 2 -> 3: Add metadata
      (data) => {
        return {
          ...data,
          metadata: { migrated: true }
        };
      }
    ]
  };
}
```

Migrations are applied sequentially based on the event's version number.

## Callback System

### Callback Object Structure

Callbacks handle side effects when events are processed.

```javascript
{
  // Command-specific handlers
  [commandName]: (result: any, row: EventRow) => void,
  
  // Default handler for unspecified commands
  _default: (result: any, row: EventRow) => void,
  
  // Error handler
  _error: (error: ErrorObject) => void
}
```

#### Handler Parameters

**Command Handlers**

| Parameter | Type | Description |
|-----------|------|-------------|
| `result` | `any` | The value returned by the model method |
| `row` | `EventRow` | The complete event data |

**Error Handler**

| Parameter | Type | Description |
|-----------|------|-------------|
| `error` | `ErrorObject` | Error details including message and context |

### Pre-built Callbacks

#### eventCallbacks.stub

Logs all events and errors to console. Useful for development.

```javascript
{
  _error(error) {
    console.log(error.msg, error.error, error.cmd, error.data, error);
  },
  _default(result, row) {
    console.log(`${row.cmd} processed:`, result, row.data);
  }
}
```

#### eventCallbacks.void

No-op callbacks for silent operation.

```javascript
{
  _error() {},
  _default() {}
}
```

#### eventCallbacks.error

Only logs errors, ignores successful events.

```javascript
{
  _error(error) {
    console.log(error.msg, error.error, error.cmd, error.data, error);
  },
  _default() {}
}
```

## Data Types

### Event Row

The structure of an event as stored in the database.

```typescript
interface EventRow {
  id: number;          // Unique identifier (SQLite rowid)
  version: number;     // Event version
  datetime: string;    // ISO 8601 timestamp
  user: string;        // User identifier
  ip: string;          // IP address
  cmd: string;         // Command name
  data: object;        // Command data (JSON)
  correlation_id: string;   // Transaction/workflow identifier
  causation_id: number | null;  // Parent event ID
  metadata: object;    // Additional context (JSON)
}
```

### Model Object

The structure returned by modelSetup.

```typescript
interface Model {
  queries: object;     // Prepared database queries
  methods: object;     // Event handler methods
  _done?: Function;    // Success callback
  _error?: Function;   // Error callback
  _default?: Function; // Default command handler
  _migrations?: object; // Version migration functions
}
```

### Error Object

The structure passed to error handlers.

```typescript
interface ErrorObject {
  msg: string;         // Error message
  error?: Error;       // Original error (if thrown)
  cmd: string;         // Command that failed
  data: object;        // Command data
  user: string;        // User who triggered the event
  ip: string;          // IP address
  datetime: string;    // When the event occurred
  id: number;          // Event ID
  version: number;     // Event version
  correlation_id: string;  // Transaction identifier
  causation_id: number | null;  // Parent event ID
  metadata: object;    // Event metadata
  res?: any;           // Partial result (if any)
}
```

## Advanced Topics

### Password Hashing

When hash options are provided to initQueue, any field named `user_password` in the event data will be automatically hashed using Bun.password.

```javascript
const eventQueue = initQueue({
  hash: {
    algorithm: 'argon2id',  // or 'argon2i', 'argon2d', 'bcrypt'
    memoryCost: 4096,       // for argon2
    timeCost: 3             // for argon2
  }
});

// This will hash the password automatically
await eventQueue.store({
  cmd: 'createUser',
  data: {
    username: 'alice',
    user_password: 'plaintext'  // Will be hashed
  }
}, model, callbacks);
```

### Database Reset Strategies

The model can be configured with different reset strategies:

```javascript
// Move the database to a backup location
modelSetup({ reset: ['move', 'backup/'] })

// Rename with timestamp
modelSetup({ reset: ['rename'] })

// Delete the database (dangerous!)
modelSetup({ reset: ['delete'] })
```

### WAL Mode

Write-Ahead Logging is enabled by default for better concurrency. Disable it if needed:

```javascript
const eventQueue = initQueue({ noWAL: true });
const model = modelSetup({ noWAL: true });
```

### Event Versioning Best Practices

1. Always increment version when changing event structure
2. Write migrations for backward compatibility
3. Test migrations thoroughly with production data
4. Keep migrations simple and idempotent

```javascript
// Good migration
(data) => ({
  ...data,
  newField: data.oldField || 'default',
  renamedField: data.oldFieldName
});

// Avoid complex logic in migrations
```

### Snapshot Strategy

Choose snapshot frequency based on your needs:

```javascript
// Time-based snapshots
setInterval(async () => {
  const lastEvent = eventQueue.methods.getLastRow();
  await snapshots.createSnapshot('model', lastEvent.id, model);
}, 24 * 60 * 60 * 1000); // Daily

// Event count-based snapshots
if (eventId % 10000 === 0) {
  await snapshots.createSnapshot('model', eventId, model);
}

// Business logic-based snapshots
after('monthEnd', async () => {
  await snapshots.createSnapshot('model', lastEventId, model, {
    type: 'month-end',
    month: currentMonth
  });
});
```

### Correlation ID Patterns

Common patterns for using correlation IDs:

```javascript
// HTTP Request tracking
app.use((req, res, next) => {
  req.correlationId = req.headers['x-correlation-id'] || crypto.randomUUID();
  next();
});

// Async job processing
async function processJob(job) {
  const correlationId = job.correlationId || crypto.randomUUID();
  
  await eventQueue.store({
    correlationId,
    cmd: 'jobStarted',
    data: { jobId: job.id }
  }, model, callbacks);
  
  // All related events use same correlation ID
}

// Saga pattern
class OrderSaga {
  constructor(correlationId) {
    this.correlationId = correlationId;
    this.events = [];
  }
  
  async execute() {
    try {
      // Each step uses causation from previous
      const order = await this.createOrder();
      const payment = await this.processPayment(order.id);
      const shipping = await this.arrangeShipping(order.id);
    } catch (error) {
      await this.compensate();
    }
  }
}
```

### Error Handling Best Practices

1. Always implement the `_error` callback
2. Throw meaningful errors in model methods
3. Use try-catch in complex methods
4. Log errors for debugging
5. Consider error recovery strategies
6. For non-deterministic operations, handle both generation and replay scenarios

### Best Practices for Internal Events

1. **Deterministic by Default**: Most internal events should be deterministic
2. **Store Random Values**: When randomness is needed, generate and store the value in the event
3. **Document Non-Determinism**: Clearly indicate which events involve randomness
4. **Idempotent Methods**: Model methods should handle replay correctly
5. **Time Handling**: Store timestamps in events rather than using "now" in methods

```javascript
// Model method example
methods(queries) {
  return {
    generateApiKey(data, context) {
      // Use the stored key during replay
      const apiKey = data.apiKey || generateNewApiKey();
      
      queries.insertApiKey.run({
        userId: data.userId,
        apiKey: apiKey,
        createdAt: data.createdAt || context.datetime
      });
      
      return { apiKey };
    }
  };
}
```

```javascript
methods(queries) {
  return {
    riskyOperation(data) {
      try {
        // Validate input
        if (!data.required) {
          throw new Error('Missing required field');
        }
        
        // Perform operation
        const result = queries.riskyQuery.run(data);
        
        // Check result
        if (!result.changes) {
          throw new Error('Operation had no effect');
        }
        
        return { success: true, changes: result.changes };
      } catch (error) {
        // Log internal errors
        console.error('riskyOperation failed:', error);
        throw error;
      }
    }
  };
}
```

## Replay Mechanics

### cycleThrough

The `cycleThrough` method replays events from the event queue through the model.

```javascript
eventQueue.cycleThrough(model, doneCB, whileCB, options)
```

#### Parameters

- `model` - The model to replay events through
- `doneCB` - Callback function called when replay is complete
- `whileCB` (optional) - Callbacks to use during replay (default: `eventCallbacks.void`)
- `options` (optional) - Replay options
  - `start` (number) - Event ID to start from (default: 0)
  - `stop` (number) - Event ID to stop at (optional)

#### Replay Behavior

1. **Data Preservation**: Event data is stored in JSON format and parsed during replay
2. **Method Execution**: Model methods receive the exact stored data
3. **No New Events**: During replay, use `eventCallbacks.void` to prevent side effects
4. **Sequential Processing**: Events are replayed in order by ID

#### Example: Full Rebuild

```javascript
// Reset model state
model.reset();

// Replay all events without side effects
eventQueue.cycleThrough(
  model,
  () => console.log('Rebuild complete'),
  eventCallbacks.void
);
```

#### Example: Partial Replay

```javascript
// Replay specific range
eventQueue.cycleThrough(
  model,
  () => console.log('Partial replay complete'),
  eventCallbacks.void,
  { start: 1000, stop: 2000 }
);
```

### Handling Non-Deterministic Values

For operations involving randomness, generate values before storing the event:

```javascript
// Generate random values at event creation time
const event = {
  user: 'system',
  cmd: 'generateApiKey',
  data: {
    userId: 'USER-123',
    apiKey: crypto.randomUUID(),        // Generated once
    expiresAt: Date.now() + 86400000,   // Calculated once
    salt: crypto.randomBytes(16).toString('hex')
  }
};

await eventQueue.store(event, model, callbacks);

// Model method uses stored values
methods(queries) {
  return {
    generateApiKey({ userId, apiKey, expiresAt, salt }) {
      // Values come from event data during both normal execution and replay
      const hash = hashWithSalt(apiKey, salt);
      queries.storeApiKey.run({ userId, hash, expiresAt });
      return { userId, apiKey, expiresAt };
    }
  };
}
```

### Replay-Safe Model Methods

Model methods should be deterministic given their input:

```javascript
methods(queries) {
  return {
    // ✅ GOOD: Uses data from event
    createToken({ userId, token, expiresAt }) {
      queries.insertToken.run({ userId, token, expiresAt });
      return { userId, token };
    },
    
    // ❌ BAD: Generates data in method
    createTokenBad({ userId }) {
      const token = crypto.randomUUID(); // Different on each replay!
      const expiresAt = Date.now() + 3600000; // Different on each replay!
      queries.insertToken.run({ userId, token, expiresAt });
      return { userId, token };
    }
  };
}
```

### Preventing Side Effects During Replay

Use different callbacks for normal operation vs replay:

```javascript
// Normal operation with side effects
const normalCallbacks = {
  userCreated({ userId, email }) {
    sendWelcomeEmail(email);
    notifyAdmins(userId);
  },
  orderPlaced({ orderId }) {
    sendOrderConfirmation(orderId);
    updateInventory(orderId);
  },
  _error(err) {
    alertOps(err);
  }
};

// Replay callbacks - no side effects
const replayCallbacks = eventCallbacks.void;

// Or selective replay callbacks
const selectiveReplayCallbacks = {
  _error(err) {
    console.error('Replay error:', err);
  },
  _default() {}, // Silent for most events
  criticalEvent(data) {
    console.log('Replaying critical event:', data);
  }
};
```

## Event Helpers API

The `event-helpers` module provides utilities for enforcing event patterns and managing complex correlations. Import from `eventlite-sourcing/lib/event-helpers.js`.

### PatternedEventStore

A wrapper around the event queue that enforces external/internal event patterns.

#### Constructor

```javascript
new PatternedEventStore(eventQueue, model, options)
```

##### Parameters

- `eventQueue` - An initialized event queue instance
- `model` - A model instance
- `options` - Configuration options
  - `enforcePatterns` (boolean, default: true) - Enforce external/internal rules
  - `validateRelationships` (boolean, default: true) - Validate parent events exist
  - `autoCorrelation` (boolean, default: true) - Auto-generate correlation IDs

#### Methods

##### storeExternal

Store an external event (no causationId allowed).

```javascript
async storeExternal(eventData, metadata = {}, callbacks = eventCallbacks.void)
```

###### Parameters

- `eventData` - Event data object (without causationId)
- `metadata` - Additional metadata to store
- `callbacks` - Callback handlers

###### Returns

```javascript
{
  id: number,
  correlationId: string,
  event: EventRow
}
```

##### storeInternal

Store an internal event (causationId required).

```javascript
async storeInternal(eventData, parentEvent, metadata = {}, callbacks = eventCallbacks.void)
```

###### Parameters

- `eventData` - Event data object
- `parentEvent` - Parent event object or ID
- `metadata` - Additional metadata
- `callbacks` - Callback handlers

##### storeInternalWithContexts

Store an internal event with multiple correlation contexts.

```javascript
async storeInternalWithContexts(eventData, parentEvent, contexts = {}, callbacks = eventCallbacks.void)
```

###### Parameters

- `eventData` - Event data object
- `parentEvent` - Parent event object or ID
- `contexts` - Object with primary and secondary correlation IDs
  - `primary` - Main correlation ID
  - Additional properties become secondary correlations

##### batchInternal

Process multiple internal events from one external trigger.

```javascript
async batchInternal(parentEvent, events, callbacks = eventCallbacks.void)
```

###### Returns

```javascript
{
  batchId: string,
  count: number,
  events: Array<Event>
}
```

##### createTransaction

Create a transaction context for related events.

```javascript
createTransaction(name, metadata = {})
```

###### Returns

```javascript
{
  correlationId: string,
  metadata: object,
  external: async (eventData, metadata) => Event,
  internal: async (eventData, parentEvent, metadata) => Event
}
```

### EventChainBuilder

Build complex event chains with a fluent API.

#### Constructor

```javascript
new EventChainBuilder(eventStore)
```

#### Methods

##### startWith

Begin chain with an external event.

```javascript
startWith(externalEvent, metadata = {})
```

##### then

Add an internal event to the chain.

```javascript
then(internalEvent, metadata = {})
```

##### thenEach

Add multiple internal events in parallel.

```javascript
thenEach(events, metadata = {})
```

##### execute

Execute the entire chain.

```javascript
async execute(callbacks = eventCallbacks.void)
```

###### Returns

```javascript
{
  count: number,
  events: Array<Event>,
  rootEvent: Event,
  leafEvents: Array<Event>
}
```

### EventPatternQueries

Query helpers for finding events by pattern.

#### Constructor

```javascript
new EventPatternQueries(eventQueue)
```

#### Methods

##### findExternalEvents

Find all external events (no causationId).

```javascript
findExternalEvents(options = {})
```

###### Options

- `since` - Start datetime
- `until` - End datetime
- `cmd` - Command name filter

##### findCausedBy

Find all internal events caused by a specific external event.

```javascript
findCausedBy(externalEventId, options = {})
```

###### Options

- `recursive` (boolean, default: true) - Include nested children
- `maxDepth` (number, default: 10) - Maximum recursion depth

##### buildEventTree

Build a complete event tree from an external trigger.

```javascript
buildEventTree(externalEventId)
```

###### Returns

```javascript
{
  event: EventRow,
  eventType: 'external' | 'internal',
  children: Array<EventNode>
}
```

### EventPatternValidator

Validate events follow naming and structural patterns.

#### Constructor

```javascript
new EventPatternValidator(options = {})
```

##### Options

- `strict` (boolean, default: true) - Enforce naming conventions

#### Methods

##### validate

Validate an event follows patterns.

```javascript
validate(event)
```

###### Returns

```javascript
{
  valid: boolean,
  errors: Array<string>,
  warnings: Array<string>
}
```

### CorrelationContext

Builder for managing primary and secondary correlation IDs.

#### Constructor

```javascript
new CorrelationContext(primary)
```

#### Methods

##### add

Add a secondary correlation.

```javascript
add(name, correlationId)
```

##### addRule

Add a rule correlation ID.

```javascript
addRule(ruleId)
```

##### addUser

Add a user correlation ID.

```javascript
addUser(userId)
```

##### addBatch

Add a batch correlation ID.

```javascript
addBatch(batchId)
```

##### build

Build the correlation context object.

```javascript
build()
```

##### toMetadata

Convert to metadata format.

```javascript
toMetadata()
```

### Factory Functions

#### createPatternedEventStore

```javascript
createPatternedEventStore(eventQueue, model, options)
```

#### createEventChain

```javascript
createEventChain(eventStore)
```

#### createCorrelationContext

```javascript
createCorrelationContext(primary)
```

### Example Usage

```javascript
import {
  createPatternedEventStore,
  createEventChain,
  createCorrelationContext
} from 'eventlite-sourcing/lib/event-helpers.js';

// Initialize patterned store
const store = createPatternedEventStore(eventQueue, model);

// Create a transaction
const transaction = store.createTransaction('order-flow');

// Store external event
const external = await transaction.external({
  user: 'user123',
  cmd: 'orderSubmitted',
  data: { orderId: 'ORD-123' }
});

// Build correlation context
const context = createCorrelationContext(transaction.correlationId)
  .addUser('USER-123')
  .addRule('DISCOUNT-10')
  .build();

// Store internal with contexts
await store.storeInternalWithContexts(
  {
    user: 'system',
    cmd: 'applyDiscount',
    data: { amount: 10 }
  },
  external,
  context
);

// Build event chain
const chain = createEventChain(store)
  .startWith({
    user: 'user456',
    cmd: 'checkoutStarted',
    data: { cartId: 'CART-789' }
  })
  .then({
    user: 'system',
    cmd: 'validateInventory',
    data: { cartId: 'CART-789' }
  })
  .thenEach([
    { user: 'system', cmd: 'reserveStock', data: { sku: 'A1' } },
    { user: 'system', cmd: 'calculateTax', data: { total: 100 } }
  ]);

const results = await chain.execute();
```

### Handling Non-Deterministic Internal Events

When internal events involve random generation or other non-deterministic operations, store the generated values in the event data:

```javascript
// Example: Password generation with stored result
const passwordEvent = await store.storeInternal({
  user: 'system',
  ip: '127.0.0.1',
  cmd: 'generatePassword',
  data: {
    userId: 'USER-123',
    // Generate once and store in event
    password: crypto.randomBytes(32).toString('hex'),
    salt: crypto.randomBytes(16).toString('hex'),
    algorithm: 'pbkdf2',
    iterations: 100000
  }
}, parentEvent);

// Example: Token generation with expiration
const tokenEvent = await store.storeInternal({
  user: 'system',
  ip: '127.0.0.1',
  cmd: 'generateApiToken',
  data: {
    userId: 'USER-123',
    token: crypto.randomUUID(),
    expiresAt: Date.now() + (30 * 24 * 60 * 60 * 1000), // 30 days
    scope: ['read', 'write']
  }
}, parentEvent);

// During replay, these events will use the stored values
// rather than generating new random values
```

## File Storage API

EventLite Sourcing provides comprehensive file storage capabilities through the FileStorageManager and FileProcessor classes.

### FileStorageManager

Main class for managing file storage, metadata, permissions, and retention policies.

#### Constructor

```javascript
new FileStorageManager(options?: FileStorageOptions)
```

**Options:**
- `baseDir?: string` - Base directory for file storage (default: './data/files')
- `backend?: string` - Storage backend (default: 'local')
- `maxFileSize?: number` - Maximum file size in bytes (default: 104857600)
- `allowedTypes?: string[] | null` - Allowed MIME types (default: null = all)
- `dbName?: string` - Database file path
- `virusScanEnabled?: boolean` - Enable virus scanning (default: false)
- `enableDeepValidation?: boolean` - Enable deep file validation (default: true)

#### Core Methods

##### storeFile(buffer, metadata)

Store a file with metadata and return file reference.

```javascript
async storeFile(buffer: Buffer, metadata: FileMetadata): Promise<FileReference>
```

**Parameters:**
- `buffer` - File content as Buffer
- `metadata` - File metadata object

**Metadata:**
- `originalName: string` - Original filename
- `mimeType: string` - MIME type
- `ownerId?: string` - File owner ID
- `expiresAt?: number` - Expiration timestamp
- `retentionPolicy?: string` - Retention policy
- `additionalMetadata?: object` - Custom metadata

**Returns:** FileReference object with id, path, size, checksum, etc.

##### getFile(fileId)

Retrieve file content by ID.

```javascript
async getFile(fileId: string): Promise<Buffer>
```

##### getFileMetadata(fileId)

Get file metadata by ID.

```javascript
async getFileMetadata(fileId: string): Promise<FileReference>
```

##### deleteFile(fileId)

Delete a file by ID.

```javascript
async deleteFile(fileId: string): Promise<boolean>
```

#### Versioning Methods

##### storeFileVersion(parentId, buffer, metadata)

Create a new version of an existing file.

```javascript
async storeFileVersion(parentId: string, buffer: Buffer, metadata: FileMetadata): Promise<FileReference>
```

##### getFileVersions(fileId)

Get all versions of a file.

```javascript
async getFileVersions(fileId: string): Promise<FileReference[]>
```

##### getFileHistory(fileId)

Get complete version history.

```javascript
async getFileHistory(fileId: string): Promise<FileReference[]>
```

#### Permission Methods

##### grantFilePermission(fileId, userId, permissionType, options)

Grant permission to a user for a file.

```javascript
async grantFilePermission(
  fileId: string, 
  userId: string, 
  permissionType: string, 
  options?: PermissionOptions
): Promise<boolean>
```

**Permission Types:** 'read', 'write', 'admin', or custom

**Options:**
- `groupId?: string` - Grant to group instead of user
- `grantedBy?: string` - Who granted the permission
- `expiresAt?: number` - Permission expiration

##### checkFilePermission(fileId, userId, permissionType)

Check if user has specific permission.

```javascript
async checkFilePermission(fileId: string, userId: string, permissionType: string): Promise<boolean>
```

##### canUserAccessFile(fileId, userId, action)

Check if user can access file for specific action.

```javascript
async canUserAccessFile(fileId: string, userId: string, action?: string): Promise<boolean>
```

##### getAccessibleFiles(userId, permissionType)

Get all files accessible to a user.

```javascript
async getAccessibleFiles(userId: string, permissionType?: string): Promise<FileReference[]>
```

#### Retention Methods

##### applyRetentionPolicy(fileId, policy)

Apply retention policy to a file.

```javascript
async applyRetentionPolicy(fileId: string, policy: string | number): Promise<number | null>
```

**Policies:** '1day', '7days', '30days', '1year', or custom milliseconds

##### getExpiredFiles()

Get all expired files.

```javascript
async getExpiredFiles(): Promise<FileReference[]>
```

##### cleanupExpiredFiles()

Clean up all expired files.

```javascript
async cleanupExpiredFiles(): Promise<{deletedCount: number, totalExpired: number}>
```

#### Processing Methods

##### validateFileContent(fileId)

Validate file content and type.

```javascript
async validateFileContent(fileId: string): Promise<FileValidationResult>
```

##### extractTextContent(fileId)

Extract text from documents.

```javascript
async extractTextContent(fileId: string): Promise<TextExtractionResult>
```

##### generateThumbnail(fileId, options)

Generate thumbnail for images.

```javascript
async generateThumbnail(fileId: string, options?: object): Promise<ImageProcessingResult>
```

##### validateContentSecurity(fileId)

Check file for security risks.

```javascript
async validateContentSecurity(fileId: string): Promise<SecurityValidationResult>
```

##### generateFileHashes(fileId)

Generate multiple hashes for integrity verification.

```javascript
async generateFileHashes(fileId: string): Promise<FileHashes>
```

#### Event Integration Methods

##### createEventFileReference(fileRef)

Create event-compatible file reference.

```javascript
createEventFileReference(fileRef: FileReference): EventFileReference
```

##### resolveEventFileReference(eventRef)

Resolve file content from event reference.

```javascript
async resolveEventFileReference(eventRef: EventFileReference): Promise<Buffer>
```

##### extractFileReferences(eventData)

Extract file references from event data.

```javascript
extractFileReferences(eventData: any): EventFileReference[]
```

#### Utility Methods

##### findOrphanedFiles(referencedFileIds)

Find files not referenced in events.

```javascript
async findOrphanedFiles(referencedFileIds?: string[]): Promise<FileReference[]>
```

##### cleanupOrphanedFiles(referencedFileIds)

Clean up unreferenced files.

```javascript
async cleanupOrphanedFiles(referencedFileIds?: string[]): Promise<number>
```

##### getStorageStats()

Get storage statistics.

```javascript
async getStorageStats(): Promise<StorageStats>
```

### FileProcessor

Standalone file processing and validation utilities.

#### Constructor

```javascript
new FileProcessor(options?: FileProcessorOptions)
```

#### Methods

##### validateFile(buffer, metadata)

Comprehensive file validation.

```javascript
async validateFile(buffer: Buffer, metadata: FileMetadata): Promise<FileValidationResult>
```

##### detectFileType(buffer)

Detect file type using magic bytes.

```javascript
detectFileType(buffer: Buffer): string | null
```

##### extractTextContent(buffer, mimeType)

Extract text from file buffer.

```javascript
async extractTextContent(buffer: Buffer, mimeType: string): Promise<TextExtractionResult>
```

##### validateContentSecurity(buffer, metadata)

Check for security risks in file content.

```javascript
async validateContentSecurity(buffer: Buffer, metadata: FileMetadata): Promise<SecurityValidationResult>
```

##### generateFileHashes(buffer)

Generate multiple hashes for file.

```javascript
generateFileHashes(buffer: Buffer): FileHashes
```

## Snapshot Management

### initSnapshots

Initialize snapshot management system.

```javascript
initSnapshots(options?: SnapshotOptions): SnapshotManager
```

### SnapshotManager

Class for managing model state snapshots.

#### Methods

##### createSnapshot(modelName, eventId, model, metadata)

Create a snapshot of model state.

```javascript
async createSnapshot(
  modelName: string, 
  eventId: number, 
  model: Model, 
  metadata?: object
): Promise<CreateSnapshotResult>
```

##### restoreSnapshot(modelName, eventId, model)

Restore model state from snapshot.

```javascript
async restoreSnapshot(
  modelName: string, 
  eventId: number, 
  model: Model
): Promise<RestoreSnapshotResult>
```

##### listSnapshots(modelName, limit, offset)

List available snapshots.

```javascript
listSnapshots(modelName: string, limit?: number, offset?: number): SnapshotInfo[]
```

For complete usage examples and detailed guides, see the [File Storage Guide](./file-storage.md).

## Event Querying Engine

The EventQueryEngine provides advanced event relationship analysis and visualization capabilities.

### Import

```javascript
import { EventQueryEngine } from "eventlite-sourcing";
```

### Constructor

```javascript
const queryEngine = new EventQueryEngine(dbPath);
```

**Parameters:**
- `dbPath: string` - Path to the SQLite database containing events

### Root Event Detection

#### getRootEvents()

Get all events with no causation_id (external events).

```javascript
getRootEvents(): EventRow[]
```

#### getRootEventsInTimeRange(startId, endId)

Get root events within a specific ID range.

```javascript
getRootEventsInTimeRange(startId: number, endId: number): EventRow[]
```

#### getRootEventsByType(eventType)

Get root events of a specific command type.

```javascript
getRootEventsByType(eventType: string): EventRow[]
```

#### getRootEventsByUser(userId)

Get root events initiated by a specific user.

```javascript
getRootEventsByUser(userId: string): EventRow[]
```

### Child Event Methods

#### getDirectChildren(eventId)

Get immediate child events (causation_id = eventId).

```javascript
getDirectChildren(eventId: number): EventRow[]
```

#### getDescendantEvents(eventId)

Get all descendant events recursively.

```javascript
getDescendantEvents(eventId: number): EventRow[]
```

#### getChildrenByType(eventId, eventType)

Get child events of a specific type.

```javascript
getChildrenByType(eventId: number, eventType: string): EventRow[]
```

### Cousin Event Detection

#### getSiblingEvents(eventId)

Get events with the same causation_id (same parent).

```javascript
getSiblingEvents(eventId: number): EventRow[]
```

#### getCousinEvents(eventId)

Get events in same correlation but different causation branch.

```javascript
getCousinEvents(eventId: number): EventRow[]
```

#### getRelatedEvents(eventId)

Get all events in the same correlation group.

```javascript
getRelatedEvents(eventId: number): EventRow[]
```

#### getEventFamily(eventId)

Get complete event family (ancestors, descendants, cousins).

```javascript
getEventFamily(eventId: number): EventRow[]
```

### Advanced Relationship Queries

#### getEventDepth(eventId)

Get depth of event in causation chain (0 = root).

```javascript
getEventDepth(eventId: number): number
```

#### getEventInfluence(eventId)

Get count of all descendant events.

```javascript
getEventInfluence(eventId: number): number
```

#### getEventBranches(correlationId)

Get all causation branches with path information.

```javascript
getEventBranches(correlationId: string): EventBranch[]
```

#### getCriticalPath(correlationId)

Get the longest causation chain in correlation.

```javascript
getCriticalPath(correlationId: string): CriticalPath | null
```

#### findOrphanedEvents()

Find events with invalid causation_ids.

```javascript
findOrphanedEvents(): EventRow[]
```

### Event Visualization

#### generateEventReport(options)

Generate comprehensive event analysis report.

```javascript
generateEventReport(options?: EventQueryOptions): string
```

**Options:**
- `correlationId?: string` - Analyze specific correlation
- `eventId?: string` - Analyze correlation containing this event
- `includeMetrics?: boolean` - Include statistical analysis (default: true)
- `includeRelationships?: boolean` - Include relationship analysis (default: true)
- `format?: 'text' | 'json' | 'markdown'` - Output format (default: 'text')

#### generateVisualEventTree(correlationId)

Create ASCII visual representation of event tree.

```javascript
generateVisualEventTree(correlationId: string): string
```

#### getEventsByCorrelationId(correlationId)

Get all events in a correlation group.

```javascript
getEventsByCorrelationId(correlationId: string): EventRow[]
```

### Cleanup

#### close()

Close database connection.

```javascript
close(): void
```

### Type Definitions

```typescript
interface EventQueryOptions {
  correlationId?: string;
  eventId?: string;
  includeMetrics?: boolean;
  includeRelationships?: boolean;
  format?: 'text' | 'json' | 'markdown';
}

interface EventBranch {
  id: number;
  cmd: string;
  correlation_id: string;
  causation_id: number | null;
  root_id: number;
  branch_path: string;
  branch_depth: number;
}

interface CriticalPath {
  id: number;
  cmd: string;
  correlation_id: string;
  causation_id: number | null;
  path_length: number;
  path: string;
}

interface EventMetrics {
  totalEvents: number;
  rootEvents: number;
  childEvents: number;
  uniqueEventTypes: number;
  eventTypeDistribution: Record<string, number>;
  timeSpan: number;
  averageDepth: string;
}
```

### Usage Examples

```javascript
// Basic relationship analysis
const queryEngine = new EventQueryEngine("events.sqlite");

// Find all root events
const roots = queryEngine.getRootEvents();

// Analyze specific event's children
const children = queryEngine.getDirectChildren(123);
const allDescendants = queryEngine.getDescendantEvents(123);

// Find related events
const siblings = queryEngine.getSiblingEvents(123);
const cousins = queryEngine.getCousinEvents(123);

// Advanced analysis
const depth = queryEngine.getEventDepth(123);
const influence = queryEngine.getEventInfluence(123);

// Generate reports
const textReport = queryEngine.generateEventReport({
  correlationId: "order-001",
  format: "text"
});

const jsonReport = queryEngine.generateEventReport({
  correlationId: "order-001", 
  format: "json"
});

// Visual tree
const tree = queryEngine.generateVisualEventTree("order-001");
console.log(tree);

// Cleanup
queryEngine.close();
```

For complete usage examples and detailed guides, see the [Event Querying Guide](./event-querying.md).
