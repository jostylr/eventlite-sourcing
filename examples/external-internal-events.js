import { initQueue, modelSetup, eventCallbacks } from '../index.js';

// Example: External vs Internal Events with Complex Correlations
// Demonstrates the pattern where external events have no parents,
// while internal events are always caused by other events

const eventQueue = initQueue({
  dbName: 'data/external-internal.sqlite',
  reset: true // Clear for demo
});

const systemModel = modelSetup({
  dbName: 'data/system-state.sqlite',
  reset: ['delete'], // Start fresh

  tables(db) {
    // Rules table
    db.query(`
      CREATE TABLE rules (
        id TEXT PRIMARY KEY,
        content TEXT NOT NULL,
        status TEXT DEFAULT 'active',
        version INTEGER DEFAULT 1,
        updated_at INTEGER
      )
    `).run();

    // Users table with daily reset fields
    db.query(`
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        daily_allowance INTEGER DEFAULT 100,
        daily_actions_count INTEGER DEFAULT 0,
        last_reset INTEGER,
        status TEXT DEFAULT 'active'
      )
    `).run();

    // Time-limited actions
    db.query(`
      CREATE TABLE limited_actions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        action_type TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        status TEXT DEFAULT 'active',
        created_at INTEGER,
        ended_at INTEGER,
        end_reason TEXT
      )
    `).run();

    // System state
    db.query(`
      CREATE TABLE system_state (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at INTEGER
      )
    `).run();
  },

  queries(db) {
    return {
      // Rules
      updateRule: db.query('UPDATE rules SET content = $content, version = version + 1, updated_at = $updatedAt WHERE id = $id'),
      getRule: db.query('SELECT * FROM rules WHERE id = $id'),

      // Users
      createUser: db.query('INSERT INTO users (id, name, last_reset) VALUES ($id, $name, $lastReset)'),
      resetUserDaily: db.query('UPDATE users SET daily_allowance = 100, daily_actions_count = 0, last_reset = $resetTime WHERE id = $id'),
      getAllUsers: db.query('SELECT * FROM users'),

      // Actions
      createAction: db.query('INSERT INTO limited_actions (id, user_id, action_type, expires_at, created_at) VALUES ($id, $userId, $actionType, $expiresAt, $createdAt)'),
      endAction: db.query('UPDATE limited_actions SET status = "ended", ended_at = $endedAt, end_reason = $reason WHERE id = $id AND status = "active"'),
      getExpiredActions: db.query('SELECT * FROM limited_actions WHERE expires_at <= $currentTime AND status = "active"'),

      // System state
      updateSystemState: db.query('INSERT OR REPLACE INTO system_state (key, value, updated_at) VALUES ($key, $value, $updatedAt)'),
      getSystemState: db.query('SELECT * FROM system_state WHERE key = $key')
    };
  },

  methods(queries) {
    return {
      // EXTERNAL: Motion passes (no parent - comes from outside the system)
      motionPassed({ motionId, ruleId, newContent, votes }, metadata) {
        console.log(`  [EXTERNAL] Motion ${motionId} passed`);
        return { motionId, ruleId, newContent, votes };
      },

      // INTERNAL: Update rule (always has parent - the motion)
      updateRule({ ruleId, content }, metadata) {
        console.log(`  [INTERNAL] Updating rule ${ruleId} (caused by event ${metadata.causationId})`);
        queries.updateRule.run({
          id: ruleId,
          content,
          updatedAt: metadata.datetime
        });
        return { ruleId, updated: true };
      },

      // EXTERNAL: New day starts (no parent - time is external)
      newDayStarted({ date, dayOfWeek }, metadata) {
        console.log(`  [EXTERNAL] New day started: ${date}`);
        queries.updateSystemState.run({
          key: 'last_day_start',
          value: date,
          updatedAt: metadata.datetime
        });
        return { date, dayOfWeek };
      },

      // INTERNAL: Reset user daily values (parent is new day event)
      resetUserDaily({ userId }, metadata) {
        console.log(`  [INTERNAL] Resetting daily values for user ${userId} (caused by event ${metadata.causationId})`);
        queries.resetUserDaily.run({
          id: userId,
          resetTime: metadata.datetime
        });
        return { userId, reset: true };
      },

      // INTERNAL: End expired action (parent is new day event)
      endExpiredAction({ actionId, reason }, metadata) {
        console.log(`  [INTERNAL] Ending expired action ${actionId} (caused by event ${metadata.causationId})`);
        queries.endAction.run({
          id: actionId,
          endedAt: metadata.datetime,
          reason
        });
        return { actionId, ended: true };
      },

      // EXTERNAL: User initiates action (no parent - user action is external)
      userStartedAction({ userId, actionType, duration }, metadata) {
        console.log(`  [EXTERNAL] User ${userId} started ${actionType}`);
        const actionId = `ACTION-${Date.now()}`;
        queries.createAction.run({
          id: actionId,
          userId,
          actionType,
          expiresAt: metadata.datetime + duration,
          createdAt: metadata.datetime
        });
        return { actionId, userId, actionType };
      },

      // Setup users for demo
      createUser({ userId, name }, metadata) {
        queries.createUser.run({
          id: userId,
          name,
          lastReset: metadata.datetime
        });
        return { userId, name };
      },

      // Get expired actions
      getExpiredActions({ currentTime }) {
        return queries.getExpiredActions.all({ currentTime });
      },

      // Get all users
      getAllUsers() {
        return queries.getAllUsers.all();
      }
    };
  }
});

// Demonstration
async function demo() {
  console.log('=== External vs Internal Events Demo ===\n');

  // Setup some initial data
  console.log('Setup: Creating users...');
  await eventQueue.store({
    cmd: 'createUser',
    data: { userId: 'USER-001', name: 'Alice' }
  }, systemModel, eventCallbacks.void);

  await eventQueue.store({
    cmd: 'createUser',
    data: { userId: 'USER-002', name: 'Bob' }
  }, systemModel, eventCallbacks.void);

  console.log('✓ Users created\n');

  // 1. EXTERNAL EVENT: Motion passes
  console.log('1. External Event: Motion Passes');
  console.log('   (No causationId - this is triggered by real-world voting)\n');

  const motionEvent = await eventQueue.store({
    cmd: 'motionPassed',
    data: {
      motionId: 'MOTION-2024-001',
      ruleId: 'RULE-PARKING',
      newContent: 'No parking 2-4 AM except holidays',
      votes: { for: 7, against: 2 }
    },
    // No causationId - this is an external event!
    metadata: {
      source: 'city-council-meeting',
      meetingId: 'MEETING-2024-01-15'
    }
  }, systemModel, eventCallbacks.void);

  const motionEventRow = eventQueue.retrieveByID(eventQueue._queries.getLastRow.get().id);
  const motionCorrelationId = motionEventRow.correlation_id;

  // 2. INTERNAL EVENT: Rule update (caused by motion)
  console.log('\n2. Internal Event: Rule Update');
  console.log('   (Has causationId - generated by the system in response to motion)\n');

  await eventQueue.store({
    cmd: 'updateRule',
    data: {
      ruleId: 'RULE-PARKING',
      content: 'No parking 2-4 AM except holidays'
    },
    causationId: motionEventRow.id,  // This is CAUSED BY the motion
    correlationId: motionCorrelationId,  // Same business transaction
    metadata: {
      ruleCorrelationId: 'RULE-PARKING-history',  // Secondary correlation
      previousVersion: 1
    }
  }, systemModel, eventCallbacks.void);

  // 3. EXTERNAL EVENT: User starts time-limited action
  console.log('\n3. External Event: User Starts Action');
  console.log('   (No causationId - this is triggered by user interaction)\n');

  const userActionEvent = await eventQueue.store({
    cmd: 'userStartedAction',
    data: {
      userId: 'USER-001',
      actionType: 'premium-trial',
      duration: 7 * 24 * 60 * 60 * 1000  // 7 days in ms
    },
    // No causationId - user action is external!
    metadata: {
      source: 'web-ui',
      ip: '192.168.1.100',
      userAgent: 'Mozilla/5.0...'
    }
  }, systemModel, eventCallbacks.void);

  const actionEventRow = eventQueue.retrieveByID(eventQueue._queries.getLastRow.get().id);

  // 4. EXTERNAL EVENT: New day starts
  console.log('\n4. External Event: New Day Starts');
  console.log('   (No causationId - time is external to the system)\n');

  const newDayEvent = await eventQueue.store({
    cmd: 'newDayStarted',
    data: {
      date: '2024-01-16',
      dayOfWeek: 'Tuesday'
    },
    // No causationId - time is external!
    metadata: {
      source: 'cron-scheduler',
      timezone: 'UTC'
    }
  }, systemModel, eventCallbacks.void);

  const newDayEventRow = eventQueue.retrieveByID(eventQueue._queries.getLastRow.get().id);
  const newDayCorrelationId = newDayEventRow.correlation_id;

  // 5. INTERNAL EVENTS: Generated by new day
  console.log('\n5. Internal Events: Daily Resets and Expirations');
  console.log('   (All have causationId pointing to new day event)\n');

  // Reset all users (internal events caused by new day)
  const users = systemModel.getAllUsers();
  for (const user of users) {
    await eventQueue.store({
      cmd: 'resetUserDaily',
      data: { userId: user.id },
      causationId: newDayEventRow.id,  // CAUSED BY new day
      correlationId: newDayCorrelationId,  // Primary: new day transaction
      metadata: {
        userCorrelationId: `USER-${user.id}-daily`,  // Secondary: user's daily history
        resetType: 'scheduled-daily'
      }
    }, systemModel, eventCallbacks.void);
  }

  // Check for expired actions (in real system, this would find expired ones)
  // For demo, we'll simulate finding an expired action
  await eventQueue.store({
    cmd: 'endExpiredAction',
    data: {
      actionId: 'ACTION-OLD-001',
      reason: 'expired'
    },
    causationId: newDayEventRow.id,  // CAUSED BY new day
    correlationId: actionEventRow.correlation_id,  // Primary: original action correlation
    metadata: {
      dailyRunCorrelationId: newDayCorrelationId,  // Secondary: part of daily run
      actionCorrelationId: 'ACTION-OLD-001-lifecycle',  // Tertiary: action's history
      expirationBatch: '2024-01-16-daily'
    }
  }, systemModel, eventCallbacks.void);

  // 6. Show the event relationships
  console.log('\n6. Event Relationship Analysis:\n');

  // Analyze motion transaction
  console.log('Motion Transaction:');
  const motionTx = eventQueue.getTransaction(motionCorrelationId);
  motionTx.forEach(event => {
    const parentInfo = event.causation_id ? ` (parent: ${event.causation_id})` : ' (EXTERNAL)';
    console.log(`  - Event ${event.id}: ${event.cmd}${parentInfo}`);
  });

  // Analyze new day transaction
  console.log('\nNew Day Transaction:');
  const newDayTx = eventQueue.getTransaction(newDayCorrelationId);
  newDayTx.forEach(event => {
    const parentInfo = event.causation_id ? ` (parent: ${event.causation_id})` : ' (EXTERNAL)';
    console.log(`  - Event ${event.id}: ${event.cmd}${parentInfo}`);
  });

  // Show correlation patterns
  console.log('\n7. Correlation Patterns:\n');

  console.log('Primary Correlations:');
  console.log('  - Motion events use motion correlation');
  console.log('  - Daily reset events use new day correlation');
  console.log('  - BUT: Expired action uses original action correlation (stronger relationship)');

  console.log('\nSecondary Correlations (in metadata):');
  console.log('  - Rule updates track: ruleCorrelationId');
  console.log('  - User resets track: userCorrelationId');
  console.log('  - Expired actions track: dailyRunCorrelationId AND actionCorrelationId');

  console.log('\n=== Key Insights ===\n');
  console.log('1. External events (motions, user actions, time) have NO causationId');
  console.log('2. Internal events ALWAYS have causationId pointing to what triggered them');
  console.log('3. Primary correlationId = strongest business relationship');
  console.log('4. Secondary correlations in metadata = other important relationships');
  console.log('5. This creates a clear chain of causation while preserving multiple contexts');

  console.log('\n=== Demo Complete ===');
}

// Run the demo
demo().catch(console.error);
