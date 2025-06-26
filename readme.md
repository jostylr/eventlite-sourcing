# EventLite Sourcing

A lightweight event sourcing library for Node.js and Bun, built on SQLite. EventLite provides a simple, reliable way to implement event sourcing patterns in your applications with minimal overhead.

[![Tests](https://github.com/jostylr/eventlite-sourcing/actions/workflows/test.yml/badge.svg)](https://github.com/jostylr/eventlite-sourcing/actions/workflows/test.yml)
[![Coverage](https://img.shields.io/badge/coverage-97.83%25-brightgreen.svg)](https://github.com/jostylr/eventlite-sourcing)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

## Features

- 🚀 **Lightweight & Fast** - Built on SQLite with minimal dependencies
- 📝 **Event Replay** - Rebuild state from any point in history
- 🔒 **Built-in Security** - Password hashing and user/IP tracking
- 🧪 **Well Tested** - 97.83% code coverage
- 🎯 **Simple API** - Easy to understand and use
- 🔄 **Flexible Models** - Adapt to any data structure
- 📌 **Event Versioning** - Built-in migrations for evolving event schemas
- 💾 **Snapshot Support** - Efficient state restoration for large event stores
- 🔗 **Correlation & Causation IDs** - Track relationships between events
- 📁 **File Storage** - Comprehensive file management with permissions and retention
- 📘 **TypeScript Support** - Full type definitions included

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [Core Concepts](#core-concepts)
- [API Reference](#api-reference)
- [Event Helpers](#event-helpers)
- [File Storage](#file-storage)
- [External vs Internal Events](#external-vs-internal-events)
- [Correlation ID Patterns](#correlation-id-patterns)
- [GDPR Compliance](#gdpr-compliance)
- [Examples](#examples)
- [Testing](#testing)
- [Contributing](#contributing)
- [License](#license)

## Installation

```bash
# Using Bun
bun add eventlite-sourcing

# Using npm
npm install eventlite-sourcing

# Using yarn
yarn add eventlite-sourcing
```

## Quick Start

```javascript
import { initQueue, modelSetup } from 'eventlite-sourcing';

// 1. Initialize the event queue
const eventQueue = initQueue({
  dbName: 'data/events.sqlite'
});

// 2. Set up your model (the current state database)
const model = modelSetup({
  dbName: 'data/model.sqlite',
  tables(db) {
    db.query('CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, email TEXT)').run();
  },
  queries(db) {
    return {
      createUser: db.query('INSERT INTO users (name, email) VALUES ($name, $email)'),
      getUser: db.query('SELECT * FROM users WHERE id = $id')
    };
  },
  methods(queries) {
    return {
      createUser({ name, email }) {
        const result = queries.createUser.run({ name, email });
        return { userId: result.lastInsertRowid, name, email };
      }
    };
  }
});

// 3. Define callbacks for side effects (including triggering new events)
const callbacks = {
  createUser(result, row) {
    console.log(`User created: ${result.name} at ${row.datetime}`);
    
    // Trigger new events in callbacks, NOT in model methods!
    eventQueue.store({
      cmd: 'sendWelcomeEmail',
      data: { userId: result.userId, email: result.email },
      causationId: row.id  // Link to parent event
    }, model, callbacks);
  },
  _default(result, row) {
    console.log(`Event ${row.cmd} processed`);
  },
  _error({ msg, error }) {
    console.error(`Error: ${msg}`, error);
  }
};

// 4. Store and execute events
await eventQueue.store(
  { cmd: 'createUser', data: { name: 'Alice', email: 'alice@example.com' } },
  model,
  callbacks
);
```

## Important: State Changes vs Side Effects

**Critical architectural principle**: Keep state changes separate from side effects!

- **Model methods** - Pure state transformations only (database updates)
- **Callbacks** - Side effects including triggering new events

```javascript
// ✅ CORRECT: Model method only updates state
methods(queries) {
  return {
    createUser({ name, email }) {
      const result = queries.createUser.run({ name, email });
      return { userId: result.lastInsertRowid, name, email };
      // Do NOT trigger events here!
    }
  };
}

// ✅ CORRECT: Callbacks handle side effects and new events
const callbacks = {
  createUser(result, row) {
    // Send emails
    sendWelcomeEmail(result.email);
    
    // Trigger follow-up events
    eventQueue.store({
      cmd: 'userWelcomeEmailSent',
      data: { userId: result.userId },
      causationId: row.id
    }, model, callbacks);
    
    // Update external systems
    updateAnalytics(result);
  }
};

// This separation ensures:
// 1. Model methods are replay-safe (no duplicate events during replay)
// 2. Side effects can be controlled during replay with eventCallbacks.void
// 3. Event causation chains are properly tracked
```

## Core Concepts

### Event Sourcing

Event sourcing is a pattern where all changes to application state are stored as a sequence of events. Instead of storing just the current state, you store all the events that led to that state. This provides:

- **Complete audit trail** - Every change is recorded with who, what, when, and why
- **Time travel** - Rebuild state at any point in history
- **Debugging** - Replay events to reproduce issues
- **Analytics** - Analyze patterns in how your system is used

### Events vs State

- **Events** - Immutable records of things that happened (stored in the event queue)
- **State** - The current view of your data (stored in the model database)

### The Event Queue

The event queue is an append-only log of all events. Each event contains:

- `id` - Unique identifier (SQLite rowid)
- `datetime` - When the event occurred
- `user` - Who triggered the event
- `ip` - Where the event came from
- `cmd` - What command to execute
- `data` - The data for the command

### The Model

The model represents your current state and defines:

- **Tables** - Database schema for your state
- **Queries** - Prepared statements for database operations
- **Methods** - Functions that process events and update state (pure transformations only!)

**Key principle**: Model methods should NEVER trigger new events or cause side effects. They only transform state.

### Callbacks

Callbacks handle side effects when events are processed:

- **Trigger new events** - Chain events by storing new ones with causationId
- Send notifications
- Update caches
- Trigger webhooks
- Generate static files

**Key principle**: All event triggering happens in callbacks, not in model methods. This ensures replay safety.

## Event Chaining Patterns

Understanding how to properly chain events is crucial for building maintainable event-sourced systems.

### ❌ WRONG: Triggering Events in Model Methods

```javascript
// DON'T DO THIS - Creates duplicate events during replay!
methods(queries) {
  return {
    createOrder({ userId, items }) {
      const orderId = queries.createOrder.run({ userId, items }).lastInsertRowid;
      
      // WRONG: This creates new events during replay!
      eventQueue.store({
        cmd: 'calculateOrderTotals',
        data: { orderId }
      });
      
      return { orderId };
    }
  };
}
```

### ✅ CORRECT: Triggering Events in Callbacks

```javascript
// Model method: Pure state transformation
methods(queries) {
  return {
    createOrder({ userId, items }) {
      const orderId = queries.createOrder.run({ userId, items }).lastInsertRowid;
      return { orderId, items }; // Just return data, no side effects
    }
  };
}

// Callbacks: Handle event chaining
const callbacks = {
  createOrder(result, row) {
    // Trigger follow-up events here
    eventQueue.store({
      cmd: 'calculateOrderTotals',
      data: { orderId: result.orderId, items: result.items },
      causationId: row.id  // Link to parent event
    }, model, callbacks);
    
    // Can trigger multiple events
    eventQueue.store({
      cmd: 'checkInventory',
      data: { orderId: result.orderId, items: result.items },
      causationId: row.id
    }, model, callbacks);
  }
};
```

### Why This Matters for Replay

```javascript
// During normal operation:
await eventQueue.store(orderEvent, model, callbacks);
// Result: 'createOrder' executes, callbacks fire, new events are created

// During replay:
eventQueue.cycleThrough(model, done, eventCallbacks.void);
// Result: 'createOrder' executes, NO callbacks fire, NO duplicate events

// If you had events in model methods, they would be created again during replay!
```

## API Reference

### `initQueue(options)`

Initialize an event queue with the following options:

- `dbName` (string) - Path to SQLite database file (default: `'data/events.sqlite'`)
- `init` (object) - SQLite initialization options (default: `{ create: true, strict: true }`)
- `hash` (object) - Password hashing options (optional)
- `noWAL` (boolean) - Disable Write-Ahead Logging (default: `false`)
- `risky` (boolean) - Enable test mode with reset function (default: `false`)

Returns an object with:

- `queries` - Direct access to database queries (internal use)
- `methods` - Event queue methods (see below)

**New in v0.2.0**: Events now include `version`, `correlation_id`, `causation_id`, and `metadata` fields.

### Event Queue Methods

#### `async store({ user, ip, cmd, data, version, correlationId, causationId, metadata }, model, callback)`

Store and execute an event.

- `user` (string) - User identifier (optional)
- `ip` (string) - IP address (optional)
- `cmd` (string) - Command name (must match a model method)
- `data` (object) - Data to pass to the command
- `version` (number) - Event version for migration support (default: `1`)
- `correlationId` (string) - Groups related events together (auto-generated if not provided)
- `causationId` (number) - ID of the event that caused this one (optional)
- `metadata` (object) - Additional event metadata (optional)
- `model` (object) - The model to execute against
- `callback` (object) - Callbacks for handling results

#### `async execute(row, model, callback)`

Execute a previously stored event.

- `row` (object) - Event row from the database
- `model` (object) - The model to execute against
- `callback` (object) - Callbacks for handling results

#### `retrieveByID(id)`

Get a specific event by its ID.

- `id` (number) - The event ID (rowid)

Returns the event row or undefined.

#### `cycleThrough(model, doneCB, whileCB, startId)`

Replay events from the queue.

- `model` (object) - The model to execute against
- `doneCB` (function) - Called when replay is complete
- `whileCB` (object) - Callbacks for each event (optional)
- `startId` (number) - Start replay from this event ID (optional)

#### `getTransaction(correlationId)`

Get all events with the same correlation ID.

- `correlationId` (string) - The correlation ID to search for

Returns an array of events in the transaction.

#### `getChildEvents(eventId)`

Get all events directly caused by a specific event.

- `eventId` (number) - The parent event ID

Returns an array of child events.

#### `getEventLineage(eventId)`

Get the complete lineage of an event (parent and children).

- `eventId` (number) - The event ID to get lineage for

Returns an object with `event`, `parent`, and `children` properties.

#### `storeWithContext(eventData, context, model, callback)`

Store an event with inherited context.

- `eventData` (object) - The event data
- `context` (object) - Context with `correlationId`, `causationId`/`parentEventId`, and `metadata`
- `model` (object) - The model to execute against
- `callback` (object) - Callbacks for handling results

### `modelSetup(options)`

Create a model with the following options:

- `dbName` (string) - Path to model database (default: `'data/model.sqlite'`)
- `init` (object) - SQLite initialization options
- `noWAL` (boolean) - Disable Write-Ahead Logging
- `tables` (function) - Function to create database tables
- `queries` (function) - Function to create prepared queries
- `methods` (function) - Function to create event handlers
- `migrations` (function) - Function to define event migrations
- `reset` (array) - Reset options: `['move']`, `['rename']`, or `['delete']`
- `done` (function) - Success callback (optional)
- `error` (function) - Error callback (optional)
- `stub` (boolean) - Create a stub model for testing

### Callback Object Structure

```javascript
{
  // Handle specific commands
  commandName(result, row) {
    // result: what the model method returned
    // row: the event data (user, ip, cmd, data, datetime, id)
  },

  // Handle any unspecified commands
  _default(result, row) {
    // Default handler
  },

  // Handle errors
  _error({ msg, error, cmd, data, user, ip, datetime, id, res }) {
    // Error handler
  }
}
```

### Pre-built Callbacks

EventLite provides some pre-built callback objects:

- `eventCallbacks.stub` - Logs all events to console
- `eventCallbacks.void` - No-op callbacks (silent operation)
- `eventCallbacks.error` - Only logs errors
- `eventCallbacks.done` - Simple completion callback

### `initSnapshots(options)`

Initialize a snapshot manager for saving and restoring model state.

- `dbName` (string) - Path to snapshot database (default: `'data/snapshots.sqlite'`)
- `init` (object) - SQLite initialization options
- `noWAL` (boolean) - Disable Write-Ahead Logging

Returns a `SnapshotManager` instance with methods:

- `createSnapshot(modelName, eventId, model, metadata)` - Save current model state
- `restoreSnapshot(modelName, eventId, model)` - Restore model to a snapshot
- `listSnapshots(modelName, limit, offset)` - List available snapshots
- `deleteSnapshot(modelName, eventId)` - Delete a specific snapshot
- `deleteOldSnapshots(modelName, eventId)` - Clean up old snapshots

## Event Helpers

The `event-helpers` module provides utilities for enforcing event patterns and managing complex correlations.

### PatternedEventStore

A wrapper around the event queue that enforces external/internal event patterns:

```javascript
import { createPatternedEventStore } from 'eventlite-sourcing/lib/event-helpers.js';

const patternedStore = createPatternedEventStore(eventQueue, model, {
  enforcePatterns: true,      // Enforce external/internal rules
  validateRelationships: true, // Validate parent events exist
  autoCorrelation: true       // Auto-generate correlation IDs
});

// Store external event (no causationId allowed)
const external = await patternedStore.storeExternal({
  user: 'user123',
  ip: '127.0.0.1',
  cmd: 'userClicked',
  data: { button: 'submit' }
});

// Store internal event (must have parent)
const internal = await patternedStore.storeInternal({
  user: 'system',
  ip: '127.0.0.1',
  cmd: 'validateForm',
  data: { formId: 'signup' }
}, external);
```

### EventChainBuilder

Build complex event chains with a fluent API:

```javascript
import { createEventChain } from 'eventlite-sourcing/lib/event-helpers.js';

const chain = createEventChain(patternedStore)
  .startWith({
    user: 'user123',
    ip: '127.0.0.1',
    cmd: 'userSubmittedOrder',
    data: { orderId: 'ORD-123' }
  })
  .then({
    user: 'system',
    ip: '127.0.0.1',
    cmd: 'validateInventory',
    data: { orderId: 'ORD-123' }
  })
  .thenEach([
    { cmd: 'reserveStock', data: { sku: 'PROD-1', qty: 2 } },
    { cmd: 'calculateShipping', data: { orderId: 'ORD-123' } },
    { cmd: 'processPayment', data: { orderId: 'ORD-123' } }
  ]);

const results = await chain.execute();
```

### CorrelationContext

Manage primary and secondary correlation IDs:

```javascript
import { createCorrelationContext } from 'eventlite-sourcing/lib/event-helpers.js';

const context = createCorrelationContext('ORDER-123-process')
  .addUser('USER-456')
  .addRule('DISCOUNT-RULE-789')
  .addBatch('BATCH-2024-01-15');

// Use with PatternedEventStore
await patternedStore.storeInternalWithContexts(
  eventData,
  parentEvent,
  context.build()
);
```

### EventPatternQueries

Query events by their patterns:

```javascript
import { EventPatternQueries } from 'eventlite-sourcing/lib/event-helpers.js';

const queries = new EventPatternQueries(eventQueue);

// Find all external events
const externalEvents = queries.findExternalEvents({
  since: '2024-01-01',
  cmd: 'userClicked'
});

// Build complete event tree
const tree = queries.buildEventTree(externalEventId);
```

## File Storage

EventLite includes comprehensive file storage capabilities with permissions, retention policies, and processing features:

```javascript
import { FileStorageManager } from 'eventlite-sourcing';

// Initialize file storage
const fileManager = new FileStorageManager({
  baseDir: './data/files',
  maxFileSize: 104857600,        // 100MB limit
  allowedTypes: ['image/jpeg', 'image/png', 'application/pdf'],
  enableDeepValidation: true     // Validate file types using magic bytes
});

// Store a file with metadata
const fileRef = await fileManager.storeFile(buffer, {
  originalName: 'document.pdf',
  mimeType: 'application/pdf',
  ownerId: 'user123',
  retentionPolicy: '1year'
});

// Create event-compatible file reference for event storage
const eventFileRef = fileManager.createEventFileReference(fileRef);

await eventQueue.store({
  cmd: 'documentUploaded',
  data: {
    title: 'Annual Report',
    file: eventFileRef,            // File reference embedded in event
    category: 'financial'
  }
}, model, callbacks);

// Grant file permissions
await fileManager.grantFilePermission(fileRef.id, 'user456', 'read', {
  expiresAt: Date.now() + (7 * 24 * 60 * 60 * 1000) // 7 days
});

// Process files
const validation = await fileManager.validateFileContent(fileRef.id);
const textContent = await fileManager.extractTextContent(fileRef.id);
const thumbnail = await fileManager.generateThumbnail(fileRef.id);

// Cleanup expired files
const result = await fileManager.cleanupExpiredFiles();
console.log(`Cleaned up ${result.deletedCount} expired files`);
```

For complete file storage documentation, see the [File Storage Guide](./docs/file-storage.md).

## External vs Internal Events

EventLite enforces a clear distinction between external and internal events to maintain system integrity.

### External Events

External events are triggers from outside the system:

- **No causationId** - They are root events that start chains
- **User-initiated** - clicks, form submissions, API calls
- **Time-based** - scheduled jobs, timeouts, expirations
- **External systems** - webhooks, notifications, sensor data

**Naming convention**: Subject-first, past tense
- `userClicked`, `orderSubmitted`, `paymentReceived`
- `timeExpired`, `scheduleReached`, `webhookOccurred`

### Internal Events

Internal events are system reactions:

- **Must have causationId** - Always caused by another event
- **System-generated** - validations, calculations, state changes, random generation
- **Mostly deterministic** - Same input produces same output, except for:
  - Random generation (passwords, tokens, UUIDs)
  - Time-based values (timestamps, expiration dates)
  - External API calls or dependencies

**Naming convention**: Action-focused, descriptive
- `validateOrder`, `calculateTax`, `updateInventory`
- `generatePassword`, `createToken`, `assignRandomName`
- `sendEmail`, `generateReport`, `archiveRecord`

**Handling Non-Determinism**: When internal events involve randomness:
```javascript
// Store the generated value in the event data
const password = await patternedStore.storeInternal({
  user: 'system',
  ip: '127.0.0.1',
  cmd: 'generatePassword',
  data: { 
    userId: 'USER-123',
    password: generateSecurePassword(), // Generated value stored in event
    algorithm: 'bcrypt',
    rounds: 10
  }
}, parentEvent);

// During replay, the stored password is used instead of regenerating
```

### Example Flow

```javascript
// 1. External event starts the chain
const userClick = await patternedStore.storeExternal({
  user: 'user123',
  ip: '192.168.1.1',
  cmd: 'userClickedCheckout',
  data: { cartId: 'CART-456' }
});

// 2. Internal events follow
const validation = await patternedStore.storeInternal({
  user: 'system',
  ip: '127.0.0.1',
  cmd: 'validateCart',
  data: { cartId: 'CART-456' }
}, userClick);

// 3. More internal events can chain off each other
const calculation = await patternedStore.storeInternal({
  user: 'system',
  ip: '127.0.0.1',
  cmd: 'calculateTotals',
  data: { cartId: 'CART-456' }
}, validation);
```

## Correlation ID Patterns

Correlation IDs track related events across complex workflows.

### Primary Correlation ID

The main correlation ID that groups all events in a business transaction:

```javascript
// All events in an order flow share the same correlation ID
const correlationId = 'ORDER-789-20240115';

await eventQueue.store({
  correlationId,
  user: 'user123',
  cmd: 'orderPlaced',
  data: { orderId: 'ORDER-789' }
});
```

### Secondary Correlation IDs

Track multiple contexts through metadata:

```javascript
await patternedStore.storeInternalWithContexts(
  {
    user: 'system',
    cmd: 'applyDiscount',
    data: { amount: 10 }
  },
  parentEvent,
  {
    primary: 'ORDER-789-20240115',          // Main business flow
    userCorrelationId: 'USER-123-activity',  // Track user activity
    ruleCorrelationId: 'RULE-DISCOUNT-50',   // Track rule applications
    batchCorrelationId: 'BATCH-2024-01-15'   // Track batch processing
  }
);
```

### Transaction Contexts

Group related operations:

```javascript
const transaction = patternedStore.createTransaction('checkout-flow', {
  userId: 'USER-123',
  sessionId: 'SESSION-456'
});

// All events share the transaction's correlation ID
await transaction.external({
  user: 'user123',
  cmd: 'checkoutStarted',
  data: { cartId: 'CART-789' }
});

await transaction.internal({
  user: 'system',
  cmd: 'validateShipping',
  data: { cartId: 'CART-789' }
}, parentEvent);
```

### Querying by Correlation

```javascript
// Get all events in a transaction
const events = eventQueue.getTransaction(correlationId);

// Find events by secondary correlation
const userEvents = queries.findBySecondaryCorrelation(
  'userCorrelationId',
  'USER-123-activity'
);

// Get complete lineage
const lineage = eventQueue.getEventLineage(eventId);
```

## GDPR Compliance

Handling user data deletion requests in an immutable event log requires special strategies. EventLite Sourcing supports several approaches:

### Crypto-Shredding (Recommended)

Encrypt personal data with per-user keys. Delete the keys to make data unrecoverable:

```javascript
import { CryptoShredder } from './examples/gdpr-compliance.js';

const cryptoShredder = new CryptoShredder();

// Encrypt sensitive data
const keyId = await cryptoShredder.generateUserKey(userId);
const encrypted = cryptoShredder.encrypt({ ssn, creditCard }, keyId);

// Store only encrypted reference in events
await eventQueue.store({
  cmd: 'userRegistered',
  data: { userId, encryptedRef: encrypted.id }
});

// Delete upon request
await cryptoShredder.deleteUserData(userId);
```

### Segregated Storage

Keep personal data in a separate, mutable store:

```javascript
// Events contain only references
await eventQueue.store({
  cmd: 'userRegistered',
  data: { userId, profileRef: 'profile-123' }
});

// Personal data in separate store
personalStore.set('profile-123', { email, name, phone });

// Delete from personal store only
personalStore.delete('profile-123');
```

### Data Classification

Classify data by sensitivity:

- **Highly Sensitive**: SSN, credit cards → Crypto-shred
- **Personal Data**: Email, name → Separate store
- **Preferences**: Settings → Can remain in events
- **Non-Personal**: User IDs, timestamps → Always in events

See the [GDPR compliance guide](docs/gdpr-compliance.md) and [example implementation](examples/gdpr-compliance.js) for detailed patterns.

## Replay Mechanics

### How Replays Work

Event replay is the process of rebuilding state by re-executing events from the event log. The key aspects are:

1. **Events are immutable** - Once stored, events never change
2. **Data is preserved** - All event data (including random values) is stored and reused
3. **Model methods receive stored data** - During replay, methods get the exact same data

### Handling Non-Deterministic Operations

**No code modification needed!** The pattern is to generate random values when creating the event, not in the model method:

```javascript
// ✅ CORRECT: Generate before storing the event
const password = generateSecurePassword();
await eventQueue.store({
  user: 'system',
  cmd: 'createUserPassword',
  data: { 
    userId: 'USER-123',
    password: password,  // Random value stored in event
    salt: generateSalt()
  }
}, model, callbacks);

// Model method just uses what's in the event
methods(queries) {
  return {
    createUserPassword({ userId, password, salt }) {
      // During replay, password and salt come from stored event
      const hash = hashPassword(password, salt);
      queries.updatePassword.run({ userId, hash });
      return { userId, passwordSet: true };
    }
  };
}
```

```javascript
// ❌ WRONG: Don't generate in the model method
methods(queries) {
  return {
    createUserPassword({ userId }) {
      // This would generate different values on replay!
      const password = generateSecurePassword();
      const salt = generateSalt();
      // Don't do this!
    }
  };
}
```

### Replays and Triggered Events

During replay, callbacks are controlled to prevent duplicate side effects and events:

```javascript
// Normal operation - callbacks fire and can trigger new events
await eventQueue.store(eventData, model, {
  userCreated(result, row) {
    // Side effects
    sendWelcomeEmail(result.email);  
    updateAnalytics(result.userId);   
    
    // Trigger follow-up events (these should ONLY be in callbacks!)
    eventQueue.store({
      cmd: 'sendWelcomeEmail',
      data: { userId: result.userId, email: result.email },
      causationId: row.id  // Links to parent event
    }, model, callbacks);
  }
});

// Replay operation - use void callbacks
await eventQueue.cycleThrough(
  model,
  () => console.log('Replay complete'),
  eventCallbacks.void  // No side effects or new events during replay
);
```

**Key Point**: Events that are triggered by other events MUST be created in callbacks, not in model methods. This prevents duplicate events during replay.

### Replay Strategies

1. **Full Replay** - Rebuild everything from event 0
```javascript
// Reset model database
model.reset();

// Replay all events
eventQueue.cycleThrough(model, () => {
  console.log('Full replay complete');
});
```

2. **Partial Replay** - Replay from a specific point
```javascript
// Replay events 1000-2000
eventQueue.cycleThrough(model, () => {
  console.log('Partial replay complete');
}, eventCallbacks.void, { start: 1000, stop: 2000 });
```

3. **Selective Replay** - Custom processing during replay
```javascript
const replayCallbacks = {
  _error(err) { console.error('Replay error:', err); },
  _default() { /* silent for most events */ },
  
  // Only process specific events
  orderCreated(result, row) {
    console.log(`Replaying order ${result.orderId} from ${row.datetime}`);
  }
};

eventQueue.cycleThrough(model, done, replayCallbacks);
```

### Preventing Duplicate Events During Replay

Internal events triggered during replay are automatically prevented because:

1. Events are append-only - replaying doesn't create new events
2. The `cycleThrough` method only executes existing events
3. Model methods should be pure data transformations

```javascript
// This is safe - during replay, the event already exists
methods(queries) {
  return {
    orderPlaced({ orderId, items }, context) {
      // Update model state
      queries.createOrder.run({ orderId, items });
      
      // During normal operation, callbacks might trigger new events
      // During replay, we use void callbacks so no new events are created
      return { orderId, itemCount: items.length };
    }
  };
}
```

## Examples

### Event Versioning and Migrations

```javascript
import { initQueue, modelSetup } from 'eventlite-sourcing';

const eventQueue = initQueue({ dbName: 'data/events.sqlite' });

const model = modelSetup({
  dbName: 'data/model.sqlite',
  tables(db) {
    db.query('CREATE TABLE users (id INTEGER PRIMARY KEY, status TEXT)').run();
  },
  methods(queries) {
    return {
      updateStatus({ userId, status }) {
        queries.updateStatus.run({ id: userId, status });
        return { userId, status };
      }
    };
  },
  migrations() {
    return {
      updateStatus: [
        // Version 1 -> Version 2: Rename old status values
        (data) => {
          const statusMap = {
            'inactive': 'disabled',
            'active': 'enabled'
          };
          return {
            ...data,
            status: statusMap[data.status] || data.status
          };
        }
      ]
    };
  }
});

// Old events with version 1 will be automatically migrated
await eventQueue.store({
  cmd: 'updateStatus',
  data: { userId: 1, status: 'inactive' },
  version: 1
}, model, eventCallbacks.stub);
```

### Snapshots for Large Event Stores

```javascript
import { initQueue, modelSetup, initSnapshots } from 'eventlite-sourcing';

const eventQueue = initQueue({ dbName: 'data/events.sqlite' });
const snapshots = initSnapshots({ dbName: 'data/snapshots.sqlite' });

// Create snapshot after processing many events
const snapshotResult = await snapshots.createSnapshot(
  'order-model',
  1000, // After event 1000
  orderModel,
  { description: 'Daily snapshot' }
);

// Later, restore from snapshot instead of replaying all events
const restoreResult = await snapshots.restoreSnapshot(
  'order-model',
  2000, // Find snapshot at or before event 2000
  freshModel
);

// Only replay events after the snapshot
eventQueue.cycleThrough(
  freshModel,
  () => console.log('State restored'),
  eventCallbacks.void,
  { start: restoreResult.replayFrom }
);
```

### Correlation and Causation IDs

```javascript
// Track a complete business transaction
const correlationId = crypto.randomUUID();

// Initial event
const orderResult = await eventQueue.store({
  correlationId,
  cmd: 'createOrder',
  data: { customerId: 'CUST001', items: [...] }
}, model, callbacks);

// Related events inherit the correlation ID
await eventQueue.storeWithContext(
  {
    cmd: 'processPayment',
    data: { orderId: orderResult.orderId, amount: 99.99 }
  },
  {
    correlationId,
    parentEventId: 1, // This creates the causation link
    metadata: { service: 'payment-service' }
  },
  model,
  callbacks
);

// Query all events in the transaction
const allEvents = eventQueue.methods.getTransaction(correlationId);

// See what events were caused by the order creation
const causedEvents = eventQueue.methods.getChildEvents(1);

// Get complete lineage of an event
const lineage = eventQueue.methods.getEventLineage(2);
console.log(`Event ${lineage.event.cmd} was caused by ${lineage.parent.cmd}`);
```

### User Management System

```javascript
import { initQueue, modelSetup } from 'eventlite-sourcing';

const eventQueue = initQueue({
  dbName: 'data/user-events.sqlite',
  hash: { algorithm: 'argon2id' } // Enable password hashing
});

const userModel = modelSetup({
  dbName: 'data/users.sqlite',
  tables(db) {
    db.query(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY,
        username TEXT UNIQUE,
        email TEXT,
        password_hash TEXT,
        created_at INTEGER,
        updated_at INTEGER
      )
    `).run();
  },
  queries(db) {
    return {
      createUser: db.query('INSERT INTO users (username, email, password_hash, created_at) VALUES ($username, $email, $password_hash, $created_at)'),
      updateEmail: db.query('UPDATE users SET email = $email, updated_at = $updated_at WHERE username = $username'),
      getUser: db.query('SELECT id, username, email FROM users WHERE username = $username')
    };
  },
  methods(queries) {
    return {
      createUser({ username, email, user_password }, _, { datetime }) {
        // Password is automatically hashed if hash option is enabled
        queries.createUser.run({
          username,
          email,
          password_hash: user_password, // This will be the hash
          created_at: Date.parse(datetime)
        });
        return { success: true, username };
      },

      updateEmail({ username, email }, _, { datetime }) {
        queries.updateEmail.run({
          username,
          email,
          updated_at: Date.parse(datetime)
        });
        return { success: true, username, email };
      }
    };
  }
});

// Usage
await eventQueue.store({
  user: 'admin',
  ip: '192.168.1.1',
  cmd: 'createUser',
  data: {
    username: 'alice',
    email: 'alice@example.com',
    user_password: 'secretpassword' // Will be hashed automatically
  }
}, userModel, eventCallbacks.stub);
```

### Shopping Cart with Event Replay

```javascript
const cartModel = modelSetup({
  tables(db) {
    db.query('CREATE TABLE carts (user_id TEXT PRIMARY KEY, items TEXT, total REAL)').run();
  },
  queries(db) {
    return {
      getCart: db.query('SELECT * FROM carts WHERE user_id = $userId'),
      saveCart: db.query('INSERT OR REPLACE INTO carts (user_id, items, total) VALUES ($userId, $items, $total)')
    };
  },
  methods(queries) {
    return {
      addItem({ userId, item, price }) {
        const cart = queries.getCart.get({ userId }) || { items: '[]', total: 0 };
        const items = JSON.parse(cart.items);
        items.push({ item, price });
        const total = items.reduce((sum, i) => sum + i.price, 0);

        queries.saveCart.run({
          userId,
          items: JSON.stringify(items),
          total
        });

        return { userId, itemCount: items.length, total };
      },

      clearCart({ userId }) {
        queries.saveCart.run({
          userId,
          items: '[]',
          total: 0
        });
        return { userId, cleared: true };
      }
    };
  }
});

// Replay events from a specific point
const checkpointId = 1000;
eventQueue.cycleThrough(
  cartModel,
  () => console.log('Cart state rebuilt'),
  eventCallbacks.void,
  checkpointId
);
```

## Testing

EventLite includes a comprehensive test suite with 97.83% code coverage, including tests for all new features (versioning, snapshots, correlation/causation IDs).

### Running Tests

```bash
# Run all tests
bun test

# Run tests in watch mode
bun test --watch

# Run tests with coverage
bun test --coverage

# Run a specific test file
bun test tests/event-source.test.js
```

### Writing Tests

```javascript
import { initQueue, modelSetup } from 'eventlite-sourcing';

describe('My Feature', () => {
  let eventQueue;
  let model;

  beforeEach(() => {
    eventQueue = initQueue({ dbName: ':memory:', risky: true });
    model = modelSetup({ dbName: ':memory:', stub: true });
  });

  afterEach(() => {
    eventQueue.reset();
  });

  test('should process events correctly', async () => {
    const result = await eventQueue.store(
      { cmd: 'testCmd', data: { value: 42 } },
      model,
      eventCallbacks.void
    );

    expect(result).toBeDefined();
  });
});
```

## Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

### Development Setup

1. Clone the repository
2. Install dependencies: `bun install`
3. Run tests: `bun test`
4. Make your changes
5. Submit a pull request

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Acknowledgments

Built with [Bun](https://bun.sh) and [SQLite](https://sqlite.org/).

### AI
Documentation, tests, and some code generated by Claude Opus 4 via Zed Agent.
