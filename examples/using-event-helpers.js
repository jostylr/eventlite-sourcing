import { initQueue, modelSetup, eventCallbacks } from '../index.js';
import {
  createPatternedEventStore,
  createEventChain,
  createCorrelationContext,
  EventPatternQueries,
  EventPatternValidator
} from '../lib/event-helpers.js';

// Example: Using helper utilities to enforce external/internal patterns

const eventQueue = initQueue({
  dbName: 'data/helpers-demo.sqlite',
  reset: true
});

const model = modelSetup({
  dbName: 'data/helpers-model.sqlite',
  reset: ['delete'],

  tables(db) {
    db.query(`
      CREATE TABLE rules (
        id TEXT PRIMARY KEY,
        content TEXT NOT NULL,
        status TEXT DEFAULT 'active'
      )
    `).run();

    db.query(`
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        daily_credits INTEGER DEFAULT 100
      )
    `).run();
  },

  queries(db) {
    return {
      updateRule: db.query('UPDATE rules SET content = $content WHERE id = $id'),
      createUser: db.query('INSERT INTO users (id, name) VALUES ($id, $name)'),
      resetUserCredits: db.query('UPDATE users SET daily_credits = 100 WHERE id = $id')
    };
  },

  methods(queries) {
    return {
      // External events (no parent)
      motionPassed(data) {
        console.log(`[EXTERNAL] Motion ${data.motionId} passed`);
        return data;
      },

      userClickedReset(data) {
        console.log(`[EXTERNAL] User ${data.userId} clicked reset`);
        return data;
      },

      newDayStarted(data) {
        console.log(`[EXTERNAL] New day started: ${data.date}`);
        return data;
      },

      // Internal events (always have parent)
      updateRule(data, metadata) {
        console.log(`[INTERNAL] Updating rule ${data.ruleId} (caused by: ${metadata.causationId})`);
        queries.updateRule.run({ id: data.ruleId, content: data.content });
        return { updated: true };
      },

      resetUserCredits(data, metadata) {
        console.log(`[INTERNAL] Resetting credits for ${data.userId} (caused by: ${metadata.causationId})`);
        queries.resetUserCredits.run({ id: data.userId });
        return { reset: true };
      },

      notifyUser(data, metadata) {
        console.log(`[INTERNAL] Notifying user ${data.userId}: ${data.message} (caused by: ${metadata.causationId})`);
        return { notified: true };
      },

      // Setup
      createUser(data) {
        queries.createUser.run(data);
        return data;
      }
    };
  }
});

async function demonstrateHelpers() {
  console.log('=== Event Helper Utilities Demo ===\n');

  // 1. Create patterned event store
  const eventStore = createPatternedEventStore(eventQueue, model, {
    enforcePatterns: true,
    validateRelationships: true
  });

  // Setup some users
  await eventQueue.store({ cmd: 'createUser', data: { id: 'USER-001', name: 'Alice' } }, model, eventCallbacks.void);
  await eventQueue.store({ cmd: 'createUser', data: { id: 'USER-002', name: 'Bob' } }, model, eventCallbacks.void);

  console.log('1. Basic External/Internal Pattern Enforcement\n');

  // Store external event (no parent allowed)
  const motionEvent = await eventStore.storeExternal({
    cmd: 'motionPassed',
    data: {
      motionId: 'MOTION-001',
      ruleId: 'RULE-PARKING',
      content: 'Updated parking rules'
    }
  }, {
    source: 'city-council',
    meetingId: 'MEETING-2024-01'
  });

  console.log(`   ✓ External event stored: ${motionEvent.id} (correlation: ${motionEvent.correlationId})\n`);

  // Store internal event (parent required)
  const ruleUpdate = await eventStore.storeInternal({
    cmd: 'updateRule',
    data: {
      ruleId: 'RULE-PARKING',
      content: 'Updated parking rules'
    }
  }, motionEvent, {
    reason: 'Motion approved',
    previousVersion: 1
  });

  console.log(`   ✓ Internal event stored: ${ruleUpdate.id} (parent: ${motionEvent.id})\n`);

  // Try to break the pattern (will throw error)
  console.log('2. Pattern Enforcement (Catching Errors)\n');

  try {
    // External event with causationId - should fail
    await eventStore.storeExternal({
      cmd: 'motionPassed',
      data: { motionId: 'MOTION-002' },
      causationId: 1  // This should cause error!
    });
  } catch (error) {
    console.log(`   ✓ Correctly rejected: ${error.message}\n`);
  }

  try {
    // Internal event without parent - should fail
    await eventStore.storeInternal({
      cmd: 'updateRule',
      data: { ruleId: 'RULE-002' }
    }, null);  // No parent!
  } catch (error) {
    console.log(`   ✓ Correctly rejected: ${error.message}\n`);
  }

  console.log('3. Transaction Context Helper\n');

  // Create a transaction context
  const transaction = eventStore.createTransaction('rule-update-workflow', {
    initiatedBy: 'admin',
    reason: 'Policy change'
  });

  // Store events within transaction
  const txMotion = await transaction.external({
    cmd: 'motionPassed',
    data: { motionId: 'MOTION-003', ruleId: 'RULE-003' }
  });

  const txUpdate = await transaction.internal({
    cmd: 'updateRule',
    data: { ruleId: 'RULE-003', content: 'New rule content' }
  }, txMotion);

  console.log(`   ✓ Transaction ${transaction.correlationId} completed\n`);

  console.log('4. Complex Correlations with Context Builder\n');

  // External event: new day
  const newDay = await eventStore.storeExternal({
    cmd: 'newDayStarted',
    data: { date: '2024-01-16', dayOfWeek: 'Tuesday' }
  });

  // Build correlation context for user reset
  const userContext = createCorrelationContext(newDay.correlationId)
    .addUser('USER-001')
    .addBatch(`daily-reset-${newDay.event.data.date}`)
    .build();

  // Store with multiple correlations
  await eventStore.storeInternalWithContexts({
    cmd: 'resetUserCredits',
    data: { userId: 'USER-001' }
  }, newDay, userContext);

  console.log(`   ✓ Stored with correlations: ${JSON.stringify(userContext)}\n`);

  console.log('5. Event Chain Builder\n');

  // Build a complex event chain
  const chain = createEventChain(eventStore)
    .startWith({
      cmd: 'userClickedReset',
      data: { userId: 'USER-002', buttonId: 'reset-credits' }
    }, { source: 'web-ui' })
    .then({
      cmd: 'resetUserCredits',
      data: { userId: 'USER-002' }
    })
    .then({
      cmd: 'notifyUser',
      data: { userId: 'USER-002', message: 'Credits reset successfully' }
    });

  const chainResult = await chain.execute();

  console.log(`   ✓ Chain executed: ${chainResult.count} events`);
  console.log(`   - Root: ${chainResult.rootEvent.event.cmd}`);
  console.log(`   - Leaves: ${chainResult.leafEvents.map(e => e.event.cmd).join(', ')}\n`);

  console.log('6. Batch Processing Helper\n');

  // External trigger for batch
  const batchTrigger = await eventStore.storeExternal({
    cmd: 'batchResetRequested',
    data: { requestedBy: 'admin' }
  });

  // Batch process multiple internal events
  const batchResult = await eventStore.batchInternal(
    batchTrigger,
    [
      { cmd: 'resetUserCredits', data: { userId: 'USER-001' } },
      { cmd: 'resetUserCredits', data: { userId: 'USER-002' } },
      { cmd: 'notifyUser', data: { userId: 'USER-001', message: 'Batch reset complete' } },
      { cmd: 'notifyUser', data: { userId: 'USER-002', message: 'Batch reset complete' } }
    ]
  );

  console.log(`   ✓ Batch processed: ${batchResult.count} events`);
  console.log(`   - Batch ID: ${batchResult.batchId}\n`);

  console.log('7. Event Pattern Queries\n');

  const queries = new EventPatternQueries(eventQueue);

  // Find all events caused by the new day event
  const causedByNewDay = queries.findCausedBy(newDay.id, { recursive: true });
  console.log(`   ✓ Events caused by new day: ${causedByNewDay.length}`);

  // Build event tree
  const tree = queries.buildEventTree(batchTrigger.id);
  console.log(`   ✓ Event tree from batch trigger:`);
  printTree(tree, '     ');

  console.log('\n8. Event Validation\n');

  const validator = new EventPatternValidator({ strict: true });

  // Validate good external event
  const validExternal = validator.validate({
    cmd: 'userSubmittedForm',
    data: { formId: 'contact' }
    // No causationId - correct!
  });
  console.log(`   ✓ External event validation: ${validExternal.valid ? 'PASS' : 'FAIL'}`);

  // Validate good internal event
  const validInternal = validator.validate({
    cmd: 'processFormData',
    data: { formId: 'contact' },
    causationId: 123  // Has parent - correct!
  });
  console.log(`   ✓ Internal event validation: ${validInternal.valid ? 'PASS' : 'FAIL'}`);

  // Validate bad pattern
  const invalid = validator.validate({
    cmd: 'updateDatabase',  // Internal-looking name
    data: { table: 'users' }
    // Missing causationId!
  });
  console.log(`   ✓ Invalid pattern detected: ${invalid.errors.join(', ')}`);

  console.log('\n=== Benefits of Helper Utilities ===\n');
  console.log('1. **Pattern Enforcement**: Prevents accidental violations');
  console.log('2. **Cleaner API**: Simple methods for external vs internal');
  console.log('3. **Transaction Support**: Easy grouping of related events');
  console.log('4. **Correlation Management**: Multiple contexts without complexity');
  console.log('5. **Chain Building**: Declarative workflow definitions');
  console.log('6. **Batch Operations**: Efficient bulk processing');
  console.log('7. **Query Helpers**: Find events by pattern relationships');
  console.log('8. **Validation**: Ensure consistency across the system');

  console.log('\n=== Demo Complete ===');
}

// Helper function to print event tree
function printTree(node, indent = '') {
  console.log(`${indent}${node.event.cmd} (${node.eventType})`);
  node.children.forEach(child => printTree(child, indent + '  '));
}

// Run the demo
demonstrateHelpers().catch(console.error);
