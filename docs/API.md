# API Documentation

This document provides a comprehensive reference for all functions, methods, and options available in EventLite Sourcing.

## Table of Contents

- [Core Functions](#core-functions)
  - [initQueue](#initqueue)
  - [modelSetup](#modelsetup)
  - [eventCallbacks](#eventcallbacks)
- [Event Queue Methods](#event-queue-methods)
  - [store](#store)
  - [execute](#execute)
  - [retrieveByID](#retrievebyid)
  - [cycleThrough](#cyclethrough)
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
| `reset` | `array` | `undefined` | Reset strategy: `['move']`, `['rename']`, or `['delete']` |
| `done` | `function` | `undefined` | Called when model is successfully set up |
| `error` | `function` | `undefined` | Called if setup fails |
| `stub` | `boolean` | `false` | Create a stub model for testing |
| `_default` | `function` | `undefined` | Default handler for unknown commands |

#### Returns

A `Model` object containing:

```javascript
{
  queries: object,     // Prepared database queries
  methods: object,     // Event handler methods
  _done?: function,    // Success callback
  _error?: function,   // Error callback
  _default?: function  // Default command handler
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
  1000  // Start from event ID 1000
);
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
methodName(data: object, queries: object, metadata: object): any
```

| Parameter | Description |
|-----------|-------------|
| `data` | The data object from the event |
| `queries` | The prepared database queries |
| `metadata` | Event metadata: `{ datetime, user, ip, cmd, id }` |

#### Example

```javascript
methods(queries) {
  return {
    createUser({ username, email }, queries, { datetime }) {
      const created_at = Date.parse(datetime);
      const result = queries.createUser.run({ username, email, created_at });
      return { userId: result.lastInsertRowid, username, email };
    },
    
    createPost({ userId, title, content }, queries, { datetime, user }) {
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
    _default(data, queries, metadata) {
      console.warn(`Unknown command: ${metadata.cmd}`);
      return { error: 'Unknown command' };
    }
  };
}
```

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
  datetime: string;    // ISO 8601 timestamp
  user: string;        // User identifier
  ip: string;          // IP address
  cmd: string;         // Command name
  data: object;        // Command data (JSON)
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

### Error Handling Best Practices

1. Always implement the `_error` callback
2. Throw meaningful errors in model methods
3. Use try-catch in complex methods
4. Log errors for debugging
5. Consider error recovery strategies

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
