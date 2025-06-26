# EventLite Sourcing - Codebase Analysis

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Changes to the repository by claude should be recorded in a brief fashion in ai-changelog.md A major new change should be under its own heading. Each change should have the model and date/time, a single summary sentence, and then a small paragraph if more details are necessary. Tests should be done in a fashion for bun tests and stored in the tests folder. Examples have an examples folder and docs should contain the docs.


## Project Overview

**EventLite Sourcing** is a lightweight, fast event sourcing library built specifically for Bun and SQLite, designed for Node.js applications. It provides a simple yet powerful implementation of the event sourcing pattern with minimal dependencies.

### Key Features
- Lightweight and fast, built on SQLite with minimal overhead
- Event replay capability for rebuilding state from any point in history
- Built-in security with password hashing and user/IP tracking
- Well tested with 97.83% code coverage
- Event versioning with built-in migrations
- Snapshot support for efficient state restoration
- Correlation & causation IDs for tracking event relationships
- Full TypeScript support with comprehensive type definitions
- GDPR compliance support through crypto-shredding and segregated storage

## Project Structure

```
/Users/jostylr/repos/event-sourcing/
├── index.js                      # Main entry point - exports core functions
├── index.d.ts                    # TypeScript definitions
├── package.json                  # Project configuration and dependencies
├── lib/                          # Core library modules
│   ├── event-source.js           # Event queue implementation
│   ├── model.js                  # Model setup and state management
│   ├── snapshot.js               # Snapshot functionality
│   └── event-helpers.js          # Event pattern helpers and utilities
├── examples/                     # Practical usage examples
├── tests/                        # Comprehensive test suite
├── docs/                         # Detailed documentation
├── data/                         # SQLite database files
└── sample/                       # Basic usage sample
```

## Core Architecture

### 1. Event Queue (`lib/event-source.js`)
The event queue is the heart of the system - an append-only log that stores all events:

**Key Components:**
- SQLite-based event storage with WAL mode for performance
- Built-in password hashing (argon2id, bcrypt support)
- Event execution and replay mechanisms
- Correlation and causation tracking
- Transaction grouping capabilities

**Main Methods:**
- `store()` - Store and execute new events
- `execute()` - Execute previously stored events
- `cycleThrough()` - Replay events for state reconstruction
- `retrieveByID()` - Get specific events
- `getTransaction()` - Get related events by correlation ID
- `getEventLineage()` - Track parent-child event relationships

### 2. Model System (`lib/model.js`)
The model represents current application state and defines how events are processed:

**Structure:**
- **Tables**: Database schema definition
- **Queries**: Prepared SQL statements for performance
- **Methods**: Pure state transformation functions (no side effects!)
- **Migrations**: Event versioning and data transformation

**Key Principle:** Model methods should only transform state, never trigger new events or cause side effects.

### 3. Event Helpers (`lib/event-helpers.js`)
Advanced utilities for complex event patterns:

**Components:**
- `PatternedEventStore` - Enforces external/internal event patterns
- `EventChainBuilder` - Fluent API for building event chains
- `CorrelationContext` - Manages multiple correlation contexts
- `EventPatternQueries` - Query events by patterns
- `EventPatternValidator` - Validate event relationships

### 4. Snapshot System (`lib/snapshot.js`)
Efficient state restoration for large event stores:
- Create snapshots at specific event points
- Restore model state from snapshots
- List and manage snapshot history
- Optimize replay by starting from snapshots

## Key Architectural Patterns

### Event Sourcing Fundamentals
1. **Events are immutable** - Once stored, never changed
2. **Events vs State** - Events record what happened, state shows current view
3. **Event Replay** - Rebuild state by re-executing events
4. **Audit Trail** - Complete history of all changes

### External vs Internal Events
**External Events** (User-initiated):
- No causationId (root events)
- Examples: `userClicked`, `orderSubmitted`, `paymentReceived`
- Naming: Subject-first, past tense

**Internal Events** (System reactions):
- Must have causationId (always caused by another event)
- Examples: `validateOrder`, `calculateTax`, `updateInventory`
- Naming: Action-focused, descriptive

### Critical Separation: State Changes vs Side Effects
```javascript
// ✅ CORRECT: Model methods only transform state
methods(queries) {
  return {
    createUser({ name, email }) {
      const result = queries.createUser.run({ name, email });
      return { userId: result.lastInsertRowid, name, email };
      // NO side effects or event triggering here!
    }
  };
}

// ✅ CORRECT: Callbacks handle side effects and trigger new events
const callbacks = {
  createUser(result, row) {
    // Side effects: emails, notifications, etc.
    sendWelcomeEmail(result.email);

    // Trigger follow-up events
    eventQueue.store({
      cmd: 'sendWelcomeEmail',
      data: { userId: result.userId },
      causationId: row.id  // Links to parent event
    }, model, callbacks);
  }
};
```

This separation ensures:
- Model methods are replay-safe (no duplicate events during replay)
- Side effects can be controlled during replay with `eventCallbacks.void`
- Event causation chains are properly tracked

## Build & Test Commands

From `package.json`:
```json
{
  "scripts": {
    "test": "bun test",
    "test:watch": "bun test --watch",
    "test:coverage": "bun test --coverage",
    "example:user": "bun run examples/user-management.js",
    "example:sample": "bun run sample/sample.js"
  }
}
```

## Key Entry Points

1. **Main Entry** - `/Users/jostylr/repos/event-sourcing/index.js`
   - Exports: `initQueue`, `eventCallbacks`, `modelSetup`, `initSnapshots`, `SnapshotManager`

2. **TypeScript Definitions** - `/Users/jostylr/repos/event-sourcing/index.d.ts`
   - Complete type definitions for all interfaces and functions

3. **Basic Example** - `/Users/jostylr/repos/event-sourcing/sample/sample.js`
   - Simple variable storage and arithmetic operations

## Component Interactions

```
User Input/External Event
       ↓
Event Queue (store)
       ↓
Model Method (pure state transformation)
       ↓
Callback (side effects, trigger new events)
       ↓
New Events → Event Queue (recursive)
```

**During Replay:**
```
Event Queue (cycleThrough)
       ↓
Model Method (same pure transformation)
       ↓
Void Callbacks (no side effects, no new events)
```

## Advanced Features

### 1. Event Versioning & Migrations
- Events include version numbers
- Migrations transform old event data during replay
- Supports gradual schema evolution

### 2. Correlation & Causation Tracking
- **Correlation ID**: Groups related events in a business transaction
- **Causation ID**: Links child events to their parent
- **Event Lineage**: Complete parent-child relationship tracking

### 3. GDPR Compliance
- **Crypto-shredding**: Encrypt personal data, delete keys for "deletion"
- **Segregated storage**: Keep personal data in separate, mutable stores
- **Data classification**: Different strategies for different sensitivity levels

### 4. Non-Deterministic Operations
Events store generated values (passwords, UUIDs, etc.) rather than generating them in model methods, ensuring replay consistency.

## Development Workflow

1. **Initialize Queue**: Set up event storage
2. **Define Model**: Tables, queries, and pure methods
3. **Create Callbacks**: Handle side effects and event chaining
4. **Store Events**: Process user actions and external triggers
5. **Replay Events**: Rebuild state for debugging or recovery

## Testing Strategy

The project maintains 97.83% test coverage with comprehensive tests for:
- Core event sourcing functionality
- Event versioning and migrations
- Snapshot creation and restoration
- Correlation and causation tracking
- Event pattern validation
- Integration scenarios

Test files are organized by feature area and include both unit and integration tests.

## Documentation

Extensive documentation in `/docs/` covering:
- Getting started guide
- Complete API reference
- Advanced patterns and best practices
- Migration guides
- GDPR compliance strategies
- Complex event relationships

## Summary

EventLite Sourcing is a well-architected, production-ready event sourcing library that balances simplicity with powerful features. Its clear separation of concerns, comprehensive testing, and extensive documentation make it suitable for both learning event sourcing concepts and building production applications.
