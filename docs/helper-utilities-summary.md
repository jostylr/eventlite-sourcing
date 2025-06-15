# Event Helper Utilities Summary

The helper utilities in `lib/event-helpers.js` provide tools to enforce and simplify the external/internal event pattern in your event-sourced applications.

## What The Helpers Do

### 1. **Pattern Enforcement** (`PatternedEventStore`)

Prevents common mistakes by enforcing rules:
- External events CANNOT have a `causationId`
- Internal events MUST have a `causationId`
- Validates naming conventions (warnings)
- Validates parent event existence

```javascript
// This will throw an error - external events can't have parents
await eventStore.storeExternal({
  cmd: 'userClicked',
  causationId: 123  // ERROR!
});

// This will throw an error - internal events need parents
await eventStore.storeInternal({
  cmd: 'updateDatabase'
  // ERROR - no parent!
});
```

### 2. **Cleaner API**

Instead of remembering which fields to include/exclude:

```javascript
// Before (easy to mess up)
await eventQueue.store({
  cmd: 'motionPassed',
  data: { ... },
  // Oops, accidentally added causationId to external event!
});

// After (clear intent)
await eventStore.storeExternal({
  cmd: 'motionPassed',
  data: { ... }
});
```

### 3. **Transaction Contexts**

Group related events with shared metadata:

```javascript
const transaction = eventStore.createTransaction('user-registration', {
  source: 'web-app',
  ip: '192.168.1.1'
});

// All events in transaction share correlation and metadata
const externalEvent = await transaction.external({
  cmd: 'userSubmittedRegistration',
  data: { email: 'user@example.com' }
});

await transaction.internal({
  cmd: 'createUserAccount',
  data: { email: 'user@example.com' }
}, externalEvent);
```

### 4. **Multiple Correlation Management**

Handle complex correlation patterns elegantly:

```javascript
// Build correlation context with fluent API
const context = createCorrelationContext(primaryCorrelationId)
  .addUser('USER-123')
  .addRule('RULE-456')
  .addBatch('BATCH-789')
  .build();

// Store with all correlations
await eventStore.storeInternalWithContexts(
  { cmd: 'applyRuleChange', data: { ... } },
  parentEvent,
  context
);
```

### 5. **Event Chain Builder**

Declaratively define workflows:

```javascript
const result = await createEventChain(eventStore)
  .startWith({
    cmd: 'orderPlaced',
    data: { orderId: '123', total: 99.99 }
  })
  .then({
    cmd: 'validateInventory',
    data: { orderId: '123' }
  })
  .then({
    cmd: 'processPayment',
    data: { orderId: '123', amount: 99.99 }
  })
  .then({
    cmd: 'sendConfirmation',
    data: { orderId: '123' }
  })
  .execute();

// Returns structured result with root and leaf events
```

### 6. **Batch Processing**

Efficiently process multiple internal events from one trigger:

```javascript
const trigger = await eventStore.storeExternal({
  cmd: 'dailyResetRequested'
});

// Process batch with automatic parent/correlation/metadata
const result = await eventStore.batchInternal(trigger, [
  { cmd: 'resetUserQuota', data: { userId: 'USER-1' } },
  { cmd: 'resetUserQuota', data: { userId: 'USER-2' } },
  { cmd: 'resetUserQuota', data: { userId: 'USER-3' } }
]);

// Each event automatically gets:
// - causationId pointing to trigger
// - Same correlationId
// - Batch metadata (batchId, position, total)
```

### 7. **Query Helpers**

Find events by their patterns:

```javascript
const queries = new EventPatternQueries(eventQueue);

// Find all external events (entry points)
const externalEvents = queries.findExternalEvents({
  since: yesterday,
  cmd: 'userAction'
});

// Find everything caused by an external event
const cascade = queries.findCausedBy(externalEventId, {
  recursive: true,
  maxDepth: 10
});

// Build complete event tree
const tree = queries.buildEventTree(externalEventId);
// Returns hierarchical structure showing all effects
```

### 8. **Validation**

Ensure consistency across your system:

```javascript
const validator = new EventPatternValidator({ strict: true });

// Validate events before storing
const result = validator.validate(eventData);
if (!result.valid) {
  console.error('Validation errors:', result.errors);
  console.warn('Warnings:', result.warnings);
}

// Catches:
// - External events with causationId
// - Internal events without causationId
// - Naming convention violations
```

## Benefits

1. **Prevents Mistakes**: Can't accidentally violate the external/internal pattern
2. **Self-Documenting**: Code clearly shows which events are external vs internal
3. **Reduces Boilerplate**: No need to manually manage correlations and metadata
4. **Improves Consistency**: Naming conventions and patterns enforced automatically
5. **Simplifies Complex Flows**: Declarative APIs for chains and batches
6. **Better Querying**: Purpose-built methods for pattern-based queries
7. **Easier Testing**: Validation ensures events follow expected patterns

## When to Use

- **Large Teams**: Ensures everyone follows the same patterns
- **Complex Domains**: Multiple correlations and relationships
- **High Reliability**: Pattern enforcement prevents subtle bugs
- **Audit Requirements**: Clear external/internal distinction for compliance

## Example Usage

```javascript
// Initialize with your event queue and model
const eventStore = createPatternedEventStore(eventQueue, model, {
  enforcePatterns: true,
  validateRelationships: true,
  autoCorrelation: true
});

// Use throughout your application
export async function handleMotionPassed(motionData) {
  // External event - from the real world
  const motion = await eventStore.storeExternal({
    cmd: 'motionPassed',
    data: motionData
  });

  // Internal events - system's response
  for (const rule of motionData.affectedRules) {
    await eventStore.storeInternal({
      cmd: 'updateRule',
      data: { ruleId: rule.id, content: rule.newContent }
    }, motion);
  }
}
```

The utilities make the external/internal pattern natural to use while preventing common mistakes that could compromise your event sourcing system's integrity.