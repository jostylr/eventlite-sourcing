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
- 📘 **TypeScript Support** - Full type definitions included

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [Core Concepts](#core-concepts)
- [API Reference](#api-reference)
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

// 3. Define callbacks for events
const callbacks = {
  createUser(result, row) {
    console.log(`User created: ${result.name} at ${row.datetime}`);
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

// 5. Replay events to rebuild state
eventQueue.cycleThrough(model, () => console.log('Replay complete'), callbacks);
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
- **Methods** - Functions that process events and update state

### Callbacks

Callbacks handle side effects when events are processed:

- Send notifications
- Update caches
- Trigger webhooks
- Generate static files

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
