# Migration Guide: v0.1.0 to v0.2.0

This guide covers the new features and changes introduced in EventLite Sourcing v0.2.0.

## Overview of Changes

Version 0.2.0 introduces several powerful new features while maintaining backward compatibility:

1. **Event Versioning & Migrations** - Handle evolving event schemas
2. **Snapshot Support** - Efficient state restoration for large event stores
3. **Correlation & Causation IDs** - Track relationships between events
4. **TypeScript Support** - Full type definitions
5. **Enhanced Metadata** - Additional context for every event

## Breaking Changes

**None!** Version 0.2.0 is fully backward compatible. Existing code will continue to work without modifications.

## New Features

### 1. Event Versioning & Migrations

Events now support versioning, allowing you to evolve your event schemas over time.

#### What's New

- Events have a `version` field (defaults to 1)
- Models can define migrations to upgrade old event data
- Migrations are applied automatically during event execution

#### How to Use

```javascript
const model = modelSetup({
  // ... other options ...
  
  migrations() {
    return {
      // Define migrations for each command
      updateUserStatus: [
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
        // Version 2 -> 3: Add default priority
        (data) => {
          return {
            ...data,
            priority: data.priority || 'normal'
          };
        }
      ]
    };
  }
});

// Store events with specific versions
await eventQueue.store({
  cmd: 'updateUserStatus',
  data: { userId: 1, status: 'inactive' },
  version: 1  // Old version - will be migrated
}, model, callbacks);
```

### 2. Snapshot Support

Snapshots allow you to save and restore model state, dramatically improving performance for systems with many events.

#### What's New

- New `initSnapshots()` function creates a snapshot manager
- Save complete model state at any point
- Restore state and replay only recent events
- Manage snapshot lifecycle (list, delete, clean up)

#### How to Use

```javascript
import { initSnapshots } from 'eventlite-sourcing';

// Initialize snapshot manager
const snapshots = initSnapshots({
  dbName: 'data/snapshots.sqlite'
});

// Create a snapshot after processing events
const result = await snapshots.createSnapshot(
  'my-model',     // Model identifier
  1000,           // After event ID 1000
  model,          // The model instance
  { description: 'Daily backup' }  // Optional metadata
);

// Restore from snapshot
const restoreResult = await snapshots.restoreSnapshot(
  'my-model',
  2000,           // Find snapshot at or before event 2000
  freshModel      // Model to restore into
);

// Replay only events after the snapshot
eventQueue.cycleThrough(
  freshModel,
  () => console.log('Restored!'),
  callbacks,
  { start: restoreResult.replayFrom }
);
```

#### Best Practices

- Create snapshots during off-peak hours
- Keep recent snapshots, delete old ones
- Consider snapshot frequency based on event volume
- Test restore process regularly

### 3. Correlation & Causation IDs

Track relationships between events to understand complex workflows and debug issues.

#### What's New

- `correlationId` - Groups related events across a business transaction
- `causationId` - Links an event to the event that caused it
- New query methods to explore event relationships
- Automatic correlation ID inheritance

#### How to Use

```javascript
// Start a new transaction (correlation ID auto-generated)
const orderResult = await eventQueue.store({
  cmd: 'createOrder',
  data: { customerId: 'CUST001', total: 99.99 }
}, model, callbacks);

// Related events can reference the cause
await eventQueue.store({
  cmd: 'processPayment',
  data: { orderId: orderResult.orderId },
  causationId: 1  // Caused by event ID 1
}, model, callbacks);

// Or use the context helper
await eventQueue.storeWithContext(
  {
    cmd: 'sendEmail',
    data: { orderId: orderResult.orderId }
  },
  {
    parentEventId: 2,  // Caused by the payment
    metadata: { emailType: 'receipt' }
  },
  model,
  callbacks
);

// Query related events
const transaction = eventQueue.methods.getTransaction(correlationId);
const children = eventQueue.methods.getChildEvents(1);
const lineage = eventQueue.methods.getEventLineage(2);
```

#### Use Cases

- **Distributed Tracing**: Track requests across microservices
- **Debugging**: Find all events related to an issue
- **Auditing**: Complete audit trail of business transactions
- **Compensation**: Implement saga patterns with rollback

### 4. Enhanced Metadata

Events now support arbitrary metadata for additional context.

#### What's New

- `metadata` field on all events
- Preserved during replay
- Available in event handlers

#### How to Use

```javascript
await eventQueue.store({
  cmd: 'updateUser',
  data: { userId: 1, name: 'Alice' },
  metadata: {
    source: 'admin-panel',
    adminId: 'ADMIN001',
    reason: 'Name correction',
    timestamp: Date.now()
  }
}, model, callbacks);

// Metadata is available in methods
methods(queries) {
  return {
    updateUser(data, eventMeta) {
      console.log(`Update by ${eventMeta.metadata.adminId}`);
      // ... handle update ...
    }
  };
}
```

### 5. TypeScript Support

Full TypeScript definitions are now included for better developer experience.

#### What's New

- Complete type definitions in `index.d.ts`
- IntelliSense support in VS Code and other IDEs
- Type checking for all public APIs

#### How to Use

```typescript
import { 
  EventQueue, 
  Model, 
  EventData,
  CallbackObject 
} from 'eventlite-sourcing';

// TypeScript now understands all types
const eventData: EventData = {
  cmd: 'createUser',
  data: { name: 'Alice' },
  correlationId: '123',
  version: 2
};

// Type checking for callbacks
const callbacks: CallbackObject = {
  createUser(result, row) {
    // result and row are properly typed
  },
  _default(result, row) {},
  _error(error) {
    // error has all fields typed
  }
};
```

## Migration Steps

### For Existing Applications

1. **Update the package**:
   ```bash
   bun update eventlite-sourcing
   ```

2. **No code changes required** - Your existing code will continue to work

3. **Optionally adopt new features**:
   - Add migrations for evolving schemas
   - Implement snapshots for performance
   - Add correlation IDs for better tracking
   - Switch to TypeScript for type safety

### For New Applications

Take advantage of all new features from the start:

```javascript
import { initQueue, modelSetup, initSnapshots } from 'eventlite-sourcing';

// Initialize with all features
const eventQueue = initQueue({ dbName: 'data/events.sqlite' });
const snapshots = initSnapshots({ dbName: 'data/snapshots.sqlite' });

const model = modelSetup({
  dbName: 'data/model.sqlite',
  tables(db) { /* ... */ },
  queries(db) { /* ... */ },
  methods(queries) { /* ... */ },
  migrations() { /* ... */ }  // New!
});

// Use correlation IDs from the start
await eventQueue.store({
  cmd: 'startProcess',
  data: { /* ... */ },
  version: 1,
  metadata: { service: 'my-service' }
}, model, callbacks);
```

## Performance Considerations

### Snapshots

- For < 10,000 events: Snapshots optional
- For 10,000 - 100,000 events: Daily snapshots recommended
- For > 100,000 events: Multiple snapshots, consider partitioning

### Correlation IDs

- Indexed for fast queries
- Minimal storage overhead (UUID = 36 chars)
- No performance impact on event storage

### Migrations

- Applied during event execution
- Keep migrations simple and fast
- Test thoroughly before deployment

## Troubleshooting

### Issue: Old events causing errors

**Solution**: Add migrations to handle schema changes

```javascript
migrations() {
  return {
    myCommand: [
      (data) => {
        // Ensure required fields exist
        return {
          ...data,
          requiredField: data.requiredField || 'default'
        };
      }
    ]
  };
}
```

### Issue: Slow event replay

**Solution**: Implement snapshots

```javascript
// Create snapshot after batch processing
const eventCount = eventQueue.methods.getLastRow().id;
if (eventCount % 10000 === 0) {
  await snapshots.createSnapshot('model', eventCount, model);
}
```

### Issue: Lost event relationships

**Solution**: Use correlation IDs consistently

```javascript
// Create a context for related operations
const context = {
  correlationId: crypto.randomUUID(),
  metadata: { operation: 'user-registration' }
};

// Use context for all related events
await eventQueue.storeWithContext(
  { cmd: 'createUser', data: userData },
  context,
  model,
  callbacks
);
```

## Resources

- [API Documentation](./API.md) - Updated with new methods
- [Examples](../examples/) - New examples for all features
- [Tests](../tests/) - Comprehensive test coverage
- [TypeScript Definitions](../index.d.ts) - Full type definitions

## Getting Help

If you encounter any issues during migration:

1. Check the [examples](../examples/) directory
2. Review the [test files](../tests/) for usage patterns
3. Open an issue on GitHub with:
   - Your current version
   - The error message
   - Minimal reproduction code

## Summary

Version 0.2.0 brings powerful new capabilities while maintaining the simplicity that makes EventLite Sourcing easy to use. The new features are optional and can be adopted gradually as needed. Your existing code will continue to work without any changes.