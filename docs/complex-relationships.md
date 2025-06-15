# Handling Complex Event Relationships

This guide explores patterns for managing complex relationships between events that go beyond simple parent-child causation.

## The Challenge

The current event sourcing system provides:
- **correlationId**: Groups related events in a business transaction
- **causationId**: Points to the single event that directly caused this event

However, real-world scenarios often involve:
- Multiple parent events contributing to a single outcome
- Events that belong to multiple logical groupings
- Complex relationship types beyond simple causation

## Example: Rule Change Tracking

Consider a municipal rule tracking system where:
1. An agenda item proposes changes to multiple rules
2. A motion approves the agenda item
3. The rule changes are applied
4. New rules may supersede old ones

### The Relationships

```
Agenda Item (proposes changes)
    ├── Affects Rule A
    ├── Affects Rule B
    └── Causes → Motion
                    └── Causes → Apply Changes
                                    ├── Updates Rule A (v1 → v2)
                                    └── Updates Rule B (v1 → v2)
```

Each rule update logically has multiple parents:
- The motion that approved it (direct cause)
- The original rule being modified (version parent)
- The agenda item that proposed it (business context)

## Pattern 1: Metadata for Additional Relationships

Store additional parent references and relationship types in the metadata field:

```javascript
await eventQueue.store({
  cmd: 'applyRuleChange',
  data: {
    ruleId: 'RULE-001',
    newContent: 'Updated rule content...'
  },
  causationId: motionEvent.id,  // Direct cause: the motion
  correlationId: agendaCorrelationId,  // Business transaction
  metadata: {
    // Multiple parent references
    originalRuleEventId: originalRule.id,
    previousVersionEventId: lastUpdate.id,
    agendaItemEventId: agendaItem.id,
    
    // Relationship types
    relationships: {
      'caused-by': motionEvent.id,
      'modifies': originalRule.id,
      'proposed-by': agendaItem.id
    }
  }
}, model, callbacks);
```

### Advantages
- No schema changes required
- Flexible relationship types
- Can query metadata with database JSON functions

### Disadvantages
- Relationships not indexed by default
- No referential integrity
- Requires application-level management

## Pattern 2: Multiple Correlation IDs

Store additional correlation IDs in metadata for different grouping contexts:

```javascript
await eventQueue.store({
  cmd: 'updateRule',
  data: { ruleId: 'RULE-001', content: 'New content' },
  correlationId: agendaTransactionId,  // Primary: agenda workflow
  metadata: {
    // Additional correlations
    ruleCorrelationId: `RULE-001-history`,  // All events for this rule
    meetingCorrelationId: `MEETING-2024-01`,  // All events from this meeting
    authorCorrelationId: `AUTHOR-smith-proposals`  // All proposals by this author
  }
}, model, callbacks);
```

### Querying Multiple Correlations

```javascript
// Get all events related to a specific rule's history
function getRuleHistory(ruleId) {
  const allEvents = eventQueue.methods.getAllEvents(); // You'd implement this
  return allEvents.filter(event => 
    event.metadata?.ruleCorrelationId === `${ruleId}-history`
  );
}

// Get all events from a meeting
function getMeetingEvents(meetingId) {
  const allEvents = eventQueue.methods.getAllEvents();
  return allEvents.filter(event => 
    event.metadata?.meetingCorrelationId === meetingId
  );
}
```

## Pattern 3: Explicit Relationship Events

Create dedicated events to record relationships:

```javascript
// Record that a new rule supersedes an old one
await eventQueue.store({
  cmd: 'createRelationship',
  data: {
    type: 'supersedes',
    fromEntity: { type: 'rule', id: 'RULE-003' },
    toEntity: { type: 'rule', id: 'RULE-001' },
    effectiveDate: '2024-03-01'
  },
  correlationId: ruleChangeTransactionId,
  metadata: {
    fromEventId: newRule.id,
    toEventId: oldRule.id
  }
}, model, callbacks);
```

### Advantages
- Relationships are first-class events
- Can be queried and analyzed
- Maintains full audit trail

## Pattern 4: Graph-Like Relationships

For very complex relationships, maintain a graph structure in metadata:

```javascript
await eventQueue.store({
  cmd: 'complexRuleUpdate',
  data: { /* ... */ },
  metadata: {
    eventGraph: {
      nodes: [
        { id: 'agenda-001', type: 'agenda', eventId: 123 },
        { id: 'motion-001', type: 'motion', eventId: 124 },
        { id: 'rule-001-v1', type: 'rule', eventId: 100 },
        { id: 'rule-001-v2', type: 'rule', eventId: 125 }
      ],
      edges: [
        { from: 'agenda-001', to: 'motion-001', type: 'proposed' },
        { from: 'motion-001', to: 'rule-001-v2', type: 'approved' },
        { from: 'rule-001-v1', to: 'rule-001-v2', type: 'updated-to' }
      ]
    }
  }
}, model, callbacks);
```

## Pattern 5: Domain-Specific Extensions

Create helper functions that understand your domain's relationships:

```javascript
class RuleEventStore {
  constructor(eventQueue, model) {
    this.eventQueue = eventQueue;
    this.model = model;
  }

  async updateRuleWithContext({
    ruleId,
    newContent,
    motion,
    originalRuleEvent,
    agendaItem
  }) {
    return await this.eventQueue.store({
      cmd: 'updateRule',
      data: { ruleId, newContent },
      causationId: motion.id,
      correlationId: motion.correlationId,
      metadata: {
        ruleHistory: {
          originalEventId: originalRuleEvent.id,
          previousVersion: originalRuleEvent.data.version,
          agendaItemId: agendaItem.id
        },
        relationships: [
          { type: 'modifies', targetId: originalRuleEvent.id },
          { type: 'approved-by', targetId: motion.id },
          { type: 'proposed-in', targetId: agendaItem.id }
        ]
      }
    }, this.model, callbacks);
  }

  async getRuleHistory(ruleId) {
    // Get all events that touched this rule
    const allEvents = await this.eventQueue.methods.getAllEvents();
    
    return allEvents.filter(event => {
      // Direct rule events
      if (event.data?.ruleId === ruleId) return true;
      
      // Events that reference this rule in metadata
      if (event.metadata?.ruleHistory?.ruleId === ruleId) return true;
      
      // Relationship events
      if (event.data?.fromEntity?.id === ruleId || 
          event.data?.toEntity?.id === ruleId) return true;
      
      return false;
    });
  }
}
```

## Best Practices

### 1. Choose Consistent Patterns
Pick one or two patterns and use them consistently across your application.

### 2. Document Relationships
Clearly document what each relationship type means:

```javascript
const RELATIONSHIP_TYPES = {
  SUPERSEDES: 'New version completely replaces old version',
  MODIFIES: 'Partial update to existing content',
  DEPENDS_ON: 'Cannot be applied without the target',
  CONFLICTS_WITH: 'Cannot coexist with target',
  APPROVED_BY: 'Was authorized by target event'
};
```

### 3. Consider Query Performance
If you frequently query by certain relationships, consider:
- Adding database indexes on JSON paths
- Creating materialized views
- Maintaining relationship tables in your model

### 4. Validate Relationship Integrity
Add validation to ensure relationships are valid:

```javascript
function validateRelationships(event, eventQueue) {
  const relationships = event.metadata?.relationships || [];
  
  for (const rel of relationships) {
    const targetEvent = eventQueue.retrieveByID(rel.targetId);
    if (!targetEvent) {
      throw new Error(`Invalid relationship: target ${rel.targetId} not found`);
    }
  }
}
```

## Future Considerations

These patterns work within the current system, but future versions might benefit from:

1. **Native Multiple Parents**: `parentIds: [1, 2, 3]` instead of single `causationId`
2. **Multiple Correlation Types**: `correlations: { business: 'id1', entity: 'id2' }`
3. **Relationship Tables**: Dedicated storage for event relationships
4. **Graph Database Integration**: For complex relationship queries

## Example Implementation

See [examples/rule-tracking.js](../examples/rule-tracking.js) for a complete implementation demonstrating these patterns in a rule change tracking system.

## Summary

While the current system provides single parent and correlation, complex scenarios can be handled through:

1. **Metadata** for additional relationships and correlations
2. **Explicit relationship events** for auditable connections
3. **Domain-specific abstractions** that hide complexity
4. **Consistent patterns** that match your use case

Choose the approach that best fits your domain's complexity and query patterns.