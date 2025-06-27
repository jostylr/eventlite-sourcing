# Event Querying and Relationship Analysis

The EventQueryEngine provides powerful capabilities for analyzing event relationships, generating reports, and understanding complex event sourcing workflows. This addresses TODO items #10-13 and includes bonus visualization features.

## Overview

The EventQueryEngine enables deep analysis of event relationships through:

- **Root Event Detection**: Finding entry points and external triggers
- **Child Event Analysis**: Understanding event causation chains  
- **Cousin Event Detection**: Discovering related events in the same correlation
- **Advanced Relationship Queries**: Analyzing depth, influence, and critical paths
- **Event Visualization**: Generating reports and visual representations

## Quick Start

```javascript
import { EventQueryEngine } from "eventlite-sourcing";

// Initialize with your event database
const queryEngine = new EventQueryEngine("path/to/events.sqlite");

// Find all root events (external triggers)
const rootEvents = queryEngine.getRootEvents();

// Analyze event relationships
const children = queryEngine.getDirectChildren(eventId);
const descendants = queryEngine.getDescendantEvents(eventId);
const siblings = queryEngine.getSiblingEvents(eventId);

// Generate comprehensive reports
const report = queryEngine.generateEventReport({
  correlationId: "order-001",
  format: "text"
});

// Create visual event trees
const tree = queryEngine.generateVisualEventTree("order-001");

// Clean up
queryEngine.close();
```

## Root Event Detection (#10)

Root events are entry points into your system - events with no causation_id that represent external triggers.

### getRootEvents()
```javascript
const rootEvents = queryEngine.getRootEvents();
// Returns all events where causation_id IS NULL
```

### getRootEventsInTimeRange(startId, endId)
```javascript
const recentRoots = queryEngine.getRootEventsInTimeRange(1000, 2000);
// Returns root events with IDs between start and end
```

### getRootEventsByType(eventType)
```javascript
const userRegistrations = queryEngine.getRootEventsByType("userRegistered");
// Returns all root events of specified type
```

### getRootEventsByUser(userId)
```javascript
const userInitiatedEvents = queryEngine.getRootEventsByUser("user123");
// Returns root events initiated by specific user (searches JSON data)
```

## Enhanced Child Event Methods (#11)

Analyze event causation chains and hierarchies.

### getDirectChildren(eventId)
```javascript
const immediateChildren = queryEngine.getDirectChildren(eventId);
// Returns events where causation_id = eventId
```

### getDescendantEvents(eventId)
```javascript
const allDescendants = queryEngine.getDescendantEvents(eventId);
// Returns ALL descendants recursively (children, grandchildren, etc.)
```

### getChildrenByType(eventId, eventType)
```javascript
const emailEvents = queryEngine.getChildrenByType(eventId, "sendEmail");
// Returns only children of specified type
```

## Cousin Event Detection (#12)

Discover relationships between events in the same correlation but different causation chains.

### getSiblingEvents(eventId)
```javascript
const siblings = queryEngine.getSiblingEvents(eventId);
// Returns events with same causation_id (same parent)
```

### getCousinEvents(eventId)
```javascript
const cousins = queryEngine.getCousinEvents(eventId);
// Returns events in same correlation but different causation branch
```

### getRelatedEvents(eventId)
```javascript
const allRelated = queryEngine.getRelatedEvents(eventId);
// Returns ALL events in same correlation (excluding the event itself)
```

### getEventFamily(eventId)
```javascript
const family = queryEngine.getEventFamily(eventId);
// Returns ancestors, descendants, AND cousins
```

## Advanced Event Relationship Queries (#13)

Deep analysis of event structures and patterns.

### getEventDepth(eventId)
```javascript
const depth = queryEngine.getEventDepth(eventId);
// Returns how deep in the causation chain (0 = root, 1 = child, etc.)
```

### getEventInfluence(eventId)
```javascript
const influence = queryEngine.getEventInfluence(eventId);
// Returns count of ALL descendants (measures impact)
```

### getEventBranches(correlationId)
```javascript
const branches = queryEngine.getEventBranches(correlationId);
// Returns all causation branches with path information
```

### getCriticalPath(correlationId)
```javascript
const criticalPath = queryEngine.getCriticalPath(correlationId);
// Returns the longest causation chain in the correlation
```

### findOrphanedEvents()
```javascript
const orphaned = queryEngine.findOrphanedEvents();
// Returns events with invalid causation_ids (data integrity check)
```

## Event Visualization and Reporting

Generate comprehensive reports and visual representations.

### generateEventReport(options)
```javascript
const report = queryEngine.generateEventReport({
  correlationId: "order-001",    // or eventId: 123
  includeMetrics: true,          // Include statistical analysis
  includeRelationships: true,    // Include relationship analysis
  format: "text"                 // "text", "json", "markdown"
});
```

**Report includes:**
- Event listing with causation information
- Metrics (total events, types, depth analysis)
- Relationship analysis (chains, branch points, leaf events)
- Time span and type distribution

### generateVisualEventTree(correlationId)
```javascript
const tree = queryEngine.generateVisualEventTree("order-001");
```

**Example output:**
```
Event Tree for Correlation ID: order-001
══════════════════════════════════════════════════

└── [6] orderPlaced
    ├── [7] validateOrder
    ├── [8] processPayment
    │   └── [10] paymentApproved
    └── [9] reserveInventory
        └── [11] inventoryReserved
```

## Real-World Use Cases

### 1. Debugging Complex Workflows
```javascript
// Find all events in a failed transaction
const events = queryEngine.getEventsByCorrelationId("failed-order-123");

// Analyze where the failure occurred
const report = queryEngine.generateEventReport({
  correlationId: "failed-order-123",
  format: "text"
});
```

### 2. Performance Analysis
```javascript
// Find events that create many branches (potential bottlenecks)
const rootEvents = queryEngine.getRootEvents();
rootEvents.forEach(event => {
  const children = queryEngine.getDirectChildren(event.id);
  if (children.length > 5) {
    console.log(`High branching: ${event.cmd} -> ${children.length} children`);
  }
});
```

### 3. Event Replay Impact Analysis
```javascript
// Understand what would be affected by replaying an event
const eventId = 123;
const descendants = queryEngine.getDescendantEvents(eventId);
console.log(`Replaying event ${eventId} would affect ${descendants.length} events`);
```

### 4. Data Lifecycle Management
```javascript
// Find complete event families for archival
const family = queryEngine.getEventFamily(eventId);
console.log(`Event family contains ${family.length} related events`);

// Find orphaned events for cleanup
const orphaned = queryEngine.findOrphanedEvents();
console.log(`Found ${orphaned.length} orphaned events`);
```

### 5. Audit and Compliance
```javascript
// Generate comprehensive audit reports
const auditReport = queryEngine.generateEventReport({
  correlationId: "audit-transaction-001",
  format: "markdown",
  includeMetrics: true,
  includeRelationships: true
});

// Analyze event depth for compliance (e.g., max depth limits)
const depth = queryEngine.getEventDepth(eventId);
if (depth > MAX_ALLOWED_DEPTH) {
  console.warn(`Event ${eventId} exceeds maximum depth: ${depth}`);
}
```

## Advanced Features

### Event Metrics
The reporting system calculates comprehensive metrics:

- **Total Events**: Count of all events in correlation
- **Root vs Child Events**: Distribution analysis
- **Event Type Distribution**: Frequency of each command type
- **Average Depth**: Mean depth across all events
- **Time Span**: Range of event IDs (temporal scope)

### Relationship Analysis
Automatic analysis of event relationships:

- **Chains**: Longest causation sequences
- **Branch Points**: Events that spawn multiple children
- **Leaf Events**: Terminal events with no children
- **Critical Paths**: Longest sequences in each correlation

### Multi-Format Output
Reports available in multiple formats:

- **Text**: Human-readable console output
- **JSON**: Structured data for programmatic use
- **Markdown**: Documentation-ready format

## Performance Considerations

The EventQueryEngine uses recursive SQL queries (CTEs) for complex relationship analysis. For large event stores:

1. **Index Optimization**: Ensure proper indexes on causation_id and correlation_id
2. **Correlation Scope**: Analyze specific correlations rather than entire database
3. **Batch Processing**: Process large result sets in chunks
4. **Caching**: Cache frequently accessed relationship data

## Integration Examples

### With Express.js API
```javascript
app.get('/api/events/:correlationId/report', (req, res) => {
  const report = queryEngine.generateEventReport({
    correlationId: req.params.correlationId,
    format: req.query.format || 'json'
  });
  
  if (req.query.format === 'json') {
    res.json(JSON.parse(report));
  } else {
    res.text(report);
  }
});
```

### With Monitoring Systems
```javascript
// Check for orphaned events
const orphaned = queryEngine.findOrphanedEvents();
if (orphaned.length > 0) {
  monitoring.alert(`Found ${orphaned.length} orphaned events`);
}

// Monitor event depth
const maxDepth = Math.max(...events.map(e => queryEngine.getEventDepth(e.id)));
monitoring.metric('event.max_depth', maxDepth);
```

### With Event Replay Systems
```javascript
function safeReplay(eventId) {
  const descendants = queryEngine.getDescendantEvents(eventId);
  
  console.log(`Replaying event ${eventId} will affect ${descendants.length} events:`);
  descendants.forEach(event => {
    console.log(`  - ${event.cmd} (${event.id})`);
  });
  
  // Proceed with replay after confirmation
  return replayEvent(eventId);
}
```

## Error Handling

```javascript
try {
  const queryEngine = new EventQueryEngine(dbPath);
  
  // Queries return empty arrays for no results
  const children = queryEngine.getDirectChildren(999); // []
  const depth = queryEngine.getEventDepth(999); // 0
  
  // Reports handle missing data gracefully
  const report = queryEngine.generateEventReport({
    correlationId: "non-existent"
  }); // Returns "Error: No events found"
  
} catch (error) {
  console.error("Database error:", error.message);
} finally {
  queryEngine.close();
}
```

## TypeScript Support

Full TypeScript definitions are provided:

```typescript
interface EventQueryOptions {
  correlationId?: string;
  eventId?: string;
  includeMetrics?: boolean;
  includeRelationships?: boolean;
  format?: 'text' | 'json' | 'markdown';
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

class EventQueryEngine {
  constructor(dbPath: string);
  
  // Root Event Detection
  getRootEvents(): EventRow[];
  getRootEventsByType(eventType: string): EventRow[];
  
  // Child Event Methods
  getDirectChildren(eventId: number): EventRow[];
  getDescendantEvents(eventId: number): EventRow[];
  
  // Cousin Detection
  getSiblingEvents(eventId: number): EventRow[];
  getCousinEvents(eventId: number): EventRow[];
  
  // Advanced Queries
  getEventDepth(eventId: number): number;
  getEventInfluence(eventId: number): number;
  
  // Visualization
  generateEventReport(options?: EventQueryOptions): string;
  generateVisualEventTree(correlationId: string): string;
  
  close(): void;
}
```

## Conclusion

The EventQueryEngine provides a comprehensive toolkit for understanding and analyzing event relationships in complex event sourcing systems. It enables debugging, performance analysis, compliance checking, and data lifecycle management through a rich set of querying and visualization capabilities.