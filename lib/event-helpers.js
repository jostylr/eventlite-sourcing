import { eventCallbacks } from "../index.js";

/**
 * Helper utilities for enforcing external/internal event patterns
 * and managing complex correlations
 */

/**
 * Enhanced event store that enforces external/internal patterns
 */
export class PatternedEventStore {
  constructor(eventQueue, model, options = {}) {
    this.eventQueue = eventQueue;
    this.model = model;
    this.options = {
      enforcePatterns: true,
      validateRelationships: true,
      autoCorrelation: true,
      ...options,
    };

    // Track external event prefixes for validation
    this.externalEventPrefixes = new Set([
      "user",
      "time",
      "webhook",
      "api",
      "manual",
      "scheduled",
      "motion",
      "vote",
      "decision",
      "external",
    ]);

    // Track known external event patterns
    this.externalEventPatterns = new Set([
      "Clicked",
      "Submitted",
      "Started",
      "Ended",
      "Passed",
      "Failed",
      "Received",
      "Expired",
      "Reached",
      "Occurred",
    ]);
  }

  /**
   * Store an external event (no causationId allowed)
   */
  async storeExternal(
    eventData,
    metadata = {},
    callbacks = eventCallbacks.void,
  ) {
    if (this.options.enforcePatterns) {
      if (eventData.causationId) {
        throw new Error(
          `External event '${eventData.cmd}' cannot have causationId`,
        );
      }

      if (!this._looksLikeExternalEvent(eventData.cmd)) {
        console.warn(
          `Warning: '${eventData.cmd}' doesn't follow external event naming convention`,
        );
      }
    }

    // Auto-generate correlation ID if not provided
    if (this.options.autoCorrelation && !eventData.correlationId) {
      eventData.correlationId = crypto.randomUUID();
    }

    // Enrich metadata for external events
    const enrichedMetadata = {
      eventType: "external",
      timestamp: Date.now(),
      ...metadata,
    };

    const result = await this.eventQueue.store(
      {
        ...eventData,
        metadata: { ...eventData.metadata, ...enrichedMetadata },
      },
      this.model,
      callbacks,
    );

    // Return the full event for chaining
    const lastEvent = this.eventQueue.retrieveByID(
      this.eventQueue._queries.getLastRow.get().id,
    );

    return {
      id: lastEvent.id,
      correlationId: lastEvent.correlation_id,
      event: lastEvent,
    };
  }

  /**
   * Store an internal event (causationId required)
   */
  async storeInternal(
    eventData,
    parentEvent,
    metadata = {},
    callbacks = eventCallbacks.void,
  ) {
    if (this.options.enforcePatterns) {
      if (!parentEvent && !eventData.causationId) {
        throw new Error(
          `Internal event '${eventData.cmd}' must have a parent event or causationId`,
        );
      }

      if (this._looksLikeExternalEvent(eventData.cmd)) {
        console.warn(
          `Warning: '${eventData.cmd}' looks like external event but stored as internal`,
        );
      }
    }

    // Extract parent info
    const parentId = parentEvent?.id || parentEvent || eventData.causationId;
    let parentCorrelationId =
      parentEvent?.correlationId || parentEvent?.correlation_id;

    // Validate parent exists
    if (this.options.validateRelationships) {
      const parentRecord = this.eventQueue.retrieveByID(parentId);
      if (!parentRecord) {
        throw new Error(`Parent event ${parentId} not found`);
      }
      parentCorrelationId = parentCorrelationId || parentRecord.correlation_id;
    }

    // Enrich metadata for internal events
    const enrichedMetadata = {
      eventType: "internal",
      parentId: parentId,
      generatedAt: Date.now(),
      ...metadata,
    };

    const result = await this.eventQueue.store(
      {
        ...eventData,
        causationId: parentId,
        correlationId: eventData.correlationId || parentCorrelationId,
        metadata: { ...eventData.metadata, ...enrichedMetadata },
      },
      this.model,
      callbacks,
    );

    // Return the full event for chaining
    const lastEvent = this.eventQueue.retrieveByID(
      this.eventQueue._queries.getLastRow.get().id,
    );

    return {
      id: lastEvent.id,
      correlationId: lastEvent.correlation_id,
      event: lastEvent,
    };
  }

  /**
   * Store an internal event with multiple correlation contexts
   */
  async storeInternalWithContexts(
    eventData,
    parentEvent,
    contexts = {},
    callbacks = eventCallbacks.void,
  ) {
    const { primary, ...secondaryContexts } = contexts;

    return this.storeInternal(
      {
        ...eventData,
        correlationId: primary?.correlationId || primary,
      },
      parentEvent,
      {
        // Store all secondary correlations
        correlations: secondaryContexts,
        ...eventData.metadata,
      },
      callbacks,
    );
  }

  /**
   * Batch process internal events from one external trigger
   */
  async batchInternal(parentEvent, events, callbacks = eventCallbacks.void) {
    const results = [];
    const batchId = crypto.randomUUID();

    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      const result = await this.storeInternal(
        event,
        parentEvent,
        {
          batchId,
          batchPosition: i + 1,
          batchTotal: events.length,
          ...event.metadata,
        },
        callbacks,
      );
      results.push(result);
    }

    return {
      batchId,
      count: results.length,
      events: results,
    };
  }

  /**
   * Check if event name looks like external event
   */
  _looksLikeExternalEvent(cmd) {
    // Check if starts with known external prefix
    const prefix = cmd
      .split(/(?=[A-Z])/)
      .shift()
      .toLowerCase();
    if (this.externalEventPrefixes.has(prefix)) {
      return true;
    }

    // Check if contains external event pattern
    for (const pattern of this.externalEventPatterns) {
      if (cmd.includes(pattern)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Create a transaction context for related events
   */
  createTransaction(name, metadata = {}) {
    const correlationId = crypto.randomUUID();
    const transactionMeta = {
      transactionName: name,
      startedAt: Date.now(),
      ...metadata,
    };

    // Capture this for use in closures
    const self = this;

    return {
      correlationId,
      metadata: transactionMeta,

      // Helper to store external event in this transaction
      async external(eventData, metadata = {}) {
        return self.storeExternal({
          ...eventData,
          correlationId,
          metadata: { ...transactionMeta, ...metadata, ...eventData.metadata },
        });
      },

      // Helper to store internal event in this transaction
      async internal(eventData, parentEvent, metadata = {}) {
        return self.storeInternal(
          {
            ...eventData,
            correlationId,
            metadata: {
              ...transactionMeta,
              ...metadata,
              ...eventData.metadata,
            },
          },
          parentEvent,
        );
      },
    };
  }
}

/**
 * Query helpers for finding events by pattern
 */
export class EventPatternQueries {
  constructor(eventQueue) {
    this.eventQueue = eventQueue;
  }

  /**
   * Find all external events (no causationId)
   */
  findExternalEvents(options = {}) {
    const { since, until, cmd } = options;
    // In a real implementation, this would use SQL queries
    // For now, we'll show the pattern
    const events = []; // Would query: WHERE causation_id IS NULL
    return events.filter((e) => {
      if (cmd && e.cmd !== cmd) return false;
      if (since && e.datetime < since) return false;
      if (until && e.datetime > until) return false;
      return true;
    });
  }

  /**
   * Find all internal events caused by a specific external event
   */
  findCausedBy(externalEventId, options = {}) {
    const { recursive = true, maxDepth = 10 } = options;
    const results = [];
    const visited = new Set();

    const findChildren = (parentId, depth = 0) => {
      if (visited.has(parentId) || depth > maxDepth) return;
      visited.add(parentId);

      const children = this.eventQueue.getChildEvents(parentId);
      results.push(...children);

      if (recursive && depth < maxDepth) {
        children.forEach((child) => findChildren(child.id, depth + 1));
      }
    };

    findChildren(externalEventId);
    return results;
  }

  /**
   * Find all events with a specific secondary correlation
   */
  findBySecondaryCorrelation(correlationType, correlationId) {
    // Would query: WHERE metadata->>'$.correlations.{correlationType}' = correlationId
    // For now, showing the pattern
    return [];
  }

  /**
   * Build a complete event tree from an external trigger
   */
  buildEventTree(externalEventId) {
    const root = this.eventQueue.retrieveByID(externalEventId);
    if (!root || root.causation_id) {
      throw new Error("Not an external event");
    }

    const buildNode = (event) => {
      const children = this.eventQueue.getChildEvents(event.id);
      return {
        event,
        eventType: event.causation_id ? "internal" : "external",
        children: children.map((child) => buildNode(child)),
      };
    };

    return buildNode(root);
  }
}

/**
 * Validation helpers
 */
export class EventPatternValidator {
  constructor(options = {}) {
    this.options = {
      strict: true,
      ...options,
    };
  }

  /**
   * Validate event follows patterns
   */
  validate(event) {
    const errors = [];
    const warnings = [];

    // Check causation rules
    if (this._isExternalEvent(event)) {
      if (event.causationId) {
        errors.push("External events cannot have causationId");
      }
    } else {
      if (!event.causationId) {
        errors.push("Internal events must have causationId");
      }
    }

    // Check naming conventions
    if (this.options.strict) {
      if (
        this._isExternalEvent(event) &&
        !this._followsExternalNaming(event.cmd)
      ) {
        warnings.push(
          `External event '${event.cmd}' should use past tense, subject-first naming`,
        );
      }
      if (
        !this._isExternalEvent(event) &&
        this._followsExternalNaming(event.cmd)
      ) {
        warnings.push(
          `Internal event '${event.cmd}' should use action-focused naming`,
        );
      }
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  _isExternalEvent(event) {
    return !event.causationId;
  }

  _followsExternalNaming(cmd) {
    // Simple heuristic - improve as needed
    return (
      /^(user|time|webhook|external|motion)/.test(cmd.toLowerCase()) ||
      /(Passed|Started|Ended|Received)$/.test(cmd)
    );
  }
}

/**
 * Correlation context builder
 */
export class CorrelationContext {
  constructor(primary) {
    this.primary = primary;
    this.secondary = {};
  }

  add(name, correlationId) {
    this.secondary[name] = correlationId;
    return this;
  }

  addRule(ruleId) {
    return this.add("ruleCorrelationId", `RULE-${ruleId}-history`);
  }

  addUser(userId) {
    return this.add("userCorrelationId", `USER-${userId}-activity`);
  }

  addBatch(batchId) {
    return this.add("batchCorrelationId", batchId);
  }

  addTransaction(transactionId) {
    return this.add("transactionCorrelationId", transactionId);
  }

  build() {
    return {
      primary: this.primary,
      ...this.secondary,
    };
  }

  toMetadata() {
    return {
      correlations: this.secondary,
    };
  }
}

/**
 * Event chain builder for complex workflows
 */
export class EventChainBuilder {
  constructor(eventStore) {
    this.eventStore = eventStore;
    this.steps = [];
  }

  startWith(externalEvent, metadata = {}) {
    this.steps.push({
      type: "external",
      event: externalEvent,
      metadata,
    });
    return this;
  }

  then(internalEvent, metadata = {}) {
    if (this.steps.length === 0) {
      throw new Error("Chain must start with external event");
    }

    this.steps.push({
      type: "internal",
      event: internalEvent,
      metadata,
      parentIndex: this.steps.length - 1,
    });
    return this;
  }

  thenEach(events, metadata = {}) {
    const parentIndex = this.steps.length - 1;
    events.forEach((event) => {
      this.steps.push({
        type: "internal",
        event,
        metadata,
        parentIndex,
      });
    });
    return this;
  }

  async execute(callbacks = eventCallbacks.void) {
    const results = [];

    for (const step of this.steps) {
      if (step.type === "external") {
        const result = await this.eventStore.storeExternal(
          step.event,
          step.metadata,
          callbacks,
        );
        results.push(result);
      } else {
        const parent = results[step.parentIndex];
        const result = await this.eventStore.storeInternal(
          step.event,
          parent,
          step.metadata,
          callbacks,
        );
        results.push(result);
      }
    }

    return {
      count: results.length,
      events: results,
      rootEvent: results[0],
      leafEvents: results.filter(
        (_, i) => !this.steps.some((s) => s.parentIndex === i),
      ),
    };
  }
}

// Export convenience factory functions
export function createPatternedEventStore(eventQueue, model, options) {
  return new PatternedEventStore(eventQueue, model, options);
}

export function createEventChain(eventStore) {
  return new EventChainBuilder(eventStore);
}

export function createCorrelationContext(primary) {
  return new CorrelationContext(primary);
}
