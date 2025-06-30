/**
 * EventLite Developer Tools Demo
 * 
 * This example demonstrates all the developer tools features:
 * - Event relationship visualization
 * - GDPR compliance checking
 * - Event sourcing debugging
 * - Schema migration helpers
 * - Integrated developer tools suite
 */

import { 
  initQueue, 
  eventCallbacks, 
  modelSetup,
  EventVisualizerPro,
  GDPRComplianceChecker,
  EventSourcingDebugger,
  SchemaMigrationHelper,
  DeveloperToolsSuite
} from "../index.js";

const dbPath = "./data/developer-tools-demo.db";

// Demo model for user management
const userModel = {
  tables: () => `
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      created_at TEXT NOT NULL,
      preferences TEXT DEFAULT '{}'
    );
    
    CREATE TABLE IF NOT EXISTS user_sessions (
      id INTEGER PRIMARY KEY,
      user_id INTEGER NOT NULL,
      session_token TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );
    
    CREATE TABLE IF NOT EXISTS user_consent (
      id INTEGER PRIMARY KEY,
      user_id TEXT NOT NULL,
      consent_type TEXT NOT NULL,
      granted BOOLEAN NOT NULL,
      timestamp TEXT NOT NULL
    );
    
    CREATE TABLE IF NOT EXISTS retention_policies (
      id INTEGER PRIMARY KEY,
      data_type TEXT NOT NULL,
      retention_period_days INTEGER NOT NULL
    );
  `,
  
  queries: (db) => ({
    createUser: db.prepare(`INSERT INTO users (name, email, created_at) VALUES (?, ?, ?)`),
    getUser: db.prepare(`SELECT * FROM users WHERE id = ?`),
    updateUser: db.prepare(`UPDATE users SET name = ?, email = ?, preferences = ? WHERE id = ?`),
    deleteUser: db.prepare(`DELETE FROM users WHERE id = ?`),
    createSession: db.prepare(`INSERT INTO user_sessions (user_id, session_token, created_at, expires_at) VALUES (?, ?, ?, ?)`),
    getUserSessions: db.prepare(`SELECT * FROM user_sessions WHERE user_id = ?`),
    endSession: db.prepare(`DELETE FROM user_sessions WHERE session_token = ?`)
  }),
  
  methods: (queries) => ({
    createUser: ({ name, email }) => {
      const created_at = new Date().toISOString();
      const result = queries.createUser.run(name, email, created_at);
      return { 
        userId: result.lastInsertRowid, 
        name, 
        email, 
        created_at 
      };
    },
    
    getUser: ({ userId }) => {
      return queries.getUser.get(userId);
    },
    
    updateUser: ({ userId, name, email, preferences = {} }) => {
      const result = queries.updateUser.run(
        name, 
        email, 
        JSON.stringify(preferences), 
        userId
      );
      return { 
        userId, 
        updated: result.changes > 0,
        name,
        email,
        preferences 
      };
    },
    
    deleteUser: ({ userId }) => {
      const result = queries.deleteUser.run(userId);
      return { deleted: result.changes > 0, userId };
    },
    
    createSession: ({ userId, sessionToken }) => {
      const created_at = new Date().toISOString();
      const expires_at = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24 hours
      const result = queries.createSession.run(userId, sessionToken, created_at, expires_at);
      return {
        sessionId: result.lastInsertRowid,
        userId,
        sessionToken,
        created_at,
        expires_at
      };
    },
    
    endSession: ({ sessionToken }) => {
      const result = queries.endSession.run(sessionToken);
      return { ended: result.changes > 0, sessionToken };
    }
  })
};

// Demo callbacks that create realistic event chains
const demoCallbacks = {
  ...eventCallbacks.stub,
  
  createUser: (result, row) => {
    console.log(`✅ User created: ${result.name} (ID: ${result.userId})`);
    
    // Trigger welcome email event
    eventQueue.store({
      cmd: 'sendWelcomeEmail',
      data: { 
        userId: result.userId, 
        email: result.email,
        name: result.name
      },
      causationId: row.id
    }, model, demoCallbacks);
    
    // Create user profile event
    eventQueue.store({
      cmd: 'createUserProfile',
      data: { 
        userId: result.userId,
        defaultPreferences: {
          notifications: true,
          theme: 'light',
          language: 'en'
        }
      },
      causationId: row.id
    }, model, demoCallbacks);
  },
  
  sendWelcomeEmail: (result, row) => {
    console.log(`📧 Welcome email sent to: ${result.email}`);
    
    // Log email delivery
    eventQueue.store({
      cmd: 'logEmailDelivery',
      data: {
        userId: result.userId,
        emailType: 'welcome',
        status: 'delivered',
        timestamp: new Date().toISOString()
      },
      causationId: row.id
    }, model, demoCallbacks);
  },
  
  createUserProfile: (result, row) => {
    console.log(`👤 User profile created for user: ${result.userId}`);
    
    // Set default consent
    eventQueue.store({
      cmd: 'recordConsent',
      data: {
        userId: result.userId,
        consentType: 'privacy_policy',
        granted: true,
        timestamp: new Date().toISOString()
      },
      causationId: row.id
    }, model, demoCallbacks);
  },
  
  updateUser: (result, row) => {
    console.log(`🔄 User updated: ${result.userId}`);
    
    // Log profile change
    eventQueue.store({
      cmd: 'logProfileChange',
      data: {
        userId: result.userId,
        changes: ['name', 'email', 'preferences'],
        timestamp: new Date().toISOString()
      },
      causationId: row.id
    }, model, demoCallbacks);
  },
  
  deleteUser: (result, row) => {
    console.log(`🗑️  User deleted: ${result.userId}`);
    
    // Clean up user sessions
    eventQueue.store({
      cmd: 'cleanupUserSessions',
      data: {
        userId: result.userId,
        timestamp: new Date().toISOString()
      },
      causationId: row.id
    }, model, demoCallbacks);
    
    // Log GDPR deletion
    eventQueue.store({
      cmd: 'logGDPRDeletion',
      data: {
        userId: result.userId,
        requestType: 'right_to_be_forgotten',
        timestamp: new Date().toISOString()
      },
      causationId: row.id
    }, model, demoCallbacks);
  },
  
  // Stub handlers for generated events
  logEmailDelivery: (result) => console.log(`📊 Email delivery logged`),
  recordConsent: (result) => console.log(`✅ Consent recorded for user: ${result.userId}`),
  logProfileChange: (result) => console.log(`📝 Profile change logged for user: ${result.userId}`),
  cleanupUserSessions: (result) => console.log(`🧹 Sessions cleaned up for user: ${result.userId}`),
  logGDPRDeletion: (result) => console.log(`🔒 GDPR deletion logged for user: ${result.userId}`)
};

// Initialize the system
const eventQueue = initQueue({ dbName: dbPath });
const model = modelSetup({ 
  model: userModel,
  default: (data, meta) => {
    // Return empty string to suppress "unknown to model" messages
    return "";
  }
});

console.log("🚀 EventLite Developer Tools Demo");
console.log("===================================\n");

async function demonstrateVisualization() {
  console.log("📊 DEMONSTRATION: Event Relationship Visualization");
  console.log("─".repeat(55));
  
  const visualizer = new EventVisualizerPro(dbPath);
  
  // Create a complex event scenario
  console.log("Creating complex user workflow...");
  
  const userCreationEvent = eventQueue.store({
    cmd: 'createUser',
    data: { 
      name: 'Alice Johnson', 
      email: 'alice@example.com',
      password: 'hashed_password_123',
      ip: '192.168.1.100'
    },
    correlationId: 'user-registration-flow-1'
  }, model, demoCallbacks);
  
  // Create additional events to show branching
  eventQueue.store({
    cmd: 'createSession',
    data: { 
      userId: userCreationEvent.id,
      sessionToken: 'session_abc123',
      userAgent: 'Mozilla/5.0 Chrome/91.0'
    },
    correlationId: 'user-registration-flow-1',
    causationId: userCreationEvent.id
  }, model, demoCallbacks);
  
  // Wait a moment for all events to be processed
  await new Promise(resolve => setTimeout(resolve, 100));
  
  console.log("\n🌳 Tree Visualization:");
  const treeViz = visualizer.generateInteractiveEventMap('user-registration-flow-1', {
    format: 'tree',
    showMetrics: true,
    includeData: false,
    showDepth: true
  });
  console.log(treeViz.content);
  
  console.log("\n📈 Timeline Visualization:");
  const timelineViz = visualizer.generateInteractiveEventMap('user-registration-flow-1', {
    format: 'timeline',
    showMetrics: true,
    includeData: true
  });
  console.log(timelineViz.content);
  
  console.log("\n🔗 Graph Visualization (DOT format):");
  const graphViz = visualizer.generateInteractiveEventMap('user-registration-flow-1', {
    format: 'graph',
    includeData: false
  });
  console.log(graphViz.content);
  
  visualizer.close();
  console.log("\n✅ Visualization demonstration completed\n");
}

async function demonstrateComplianceChecking() {
  console.log("🔒 DEMONSTRATION: GDPR Compliance Checking");
  console.log("─".repeat(45));
  
  const complianceChecker = new GDPRComplianceChecker(dbPath);
  
  // Create some events with potentially sensitive data
  console.log("Creating events with potentially sensitive data...");
  
  eventQueue.store({
    cmd: 'updateUserProfile',
    data: {
      userId: 'user-123',
      email: 'user@example.com',
      phone: '555-123-4567',
      ssn: '123-45-6789', // Sensitive data
      address: '123 Main St, Anytown, USA'
    },
    correlationId: 'profile-update-1'
  }, model, demoCallbacks);
  
  console.log("\n🔍 Running compliance check...");
  const complianceReport = await complianceChecker.runComplianceCheck({
    checkDataIntegrity: true,
    checkRetentionPolicies: true,
    checkConsentTracking: true,
    checkDataClassification: true,
    generateReport: true
  });
  
  console.log(complianceReport);
  
  console.log("\n📊 Running targeted compliance check for specific user...");
  const userComplianceCheck = await complianceChecker.runComplianceCheck({
    userId: 'user-123',
    checkDataIntegrity: true,
    checkDataClassification: true,
    generateReport: false
  });
  
  console.log("User-specific compliance results:");
  console.log(`- Overall Compliance: ${userComplianceCheck.overallCompliance}`);
  console.log(`- Compliance Score: ${userComplianceCheck.summary.complianceScore}%`);
  console.log(`- Issues Found: ${userComplianceCheck.summary.issueCount}`);
  console.log(`- Recommendations: ${userComplianceCheck.summary.recommendationCount}`);
  
  if (userComplianceCheck.issues.length > 0) {
    console.log("\n⚠️  Issues Found:");
    userComplianceCheck.issues.forEach((issue, index) => {
      console.log(`${index + 1}. [${issue.severity}] ${issue.message}`);
    });
  }
  
  complianceChecker.close();
  console.log("\n✅ Compliance checking demonstration completed\n");
}

async function demonstrateEventSourcingDebugger() {
  console.log("🐛 DEMONSTRATION: Event Sourcing Debugger");
  console.log("─".repeat(42));
  
  const eventDebugger = new EventSourcingDebugger(dbPath);
  
  // Create a problematic event scenario
  console.log("Creating problematic event scenario for debugging...");
  
  const correlationId = 'debug-scenario-1';
  
  // Create a very long causation chain
  let lastEventId = null;
  for (let i = 0; i < 25; i++) {
    const event = eventQueue.store({
      cmd: `processStep${i}`,
      data: { 
        stepNumber: i,
        processingTime: Math.random() * 1000,
        memoryUsage: Math.random() * 100
      },
      correlationId,
      causationId: lastEventId
    }, model, demoCallbacks);
    lastEventId = event.id;
  }
  
  // Add some duplicate events
  eventQueue.store({
    cmd: 'duplicateEvent',
    data: { duplicate: true },
    correlationId
  }, model, demoCallbacks);
  
  eventQueue.store({
    cmd: 'duplicateEvent',
    data: { duplicate: true },
    correlationId
  }, model, demoCallbacks);
  
  console.log("\n🔍 Starting debug session...");
  const session = eventDebugger.startDebugSession('demo-debug-session', {
    correlationId,
    trackPerformance: true,
    verboseLogging: false
  });
  
  console.log(`Debug session started with ${session.events.length} events`);
  
  console.log("\n🔗 Analyzing causation chains...");
  const chainAnalysis = eventDebugger.analyzeCausationChains(session.id);
  
  console.log("Chain Analysis Results:");
  console.log(`- Total Chains: ${chainAnalysis.statistics.totalChains}`);
  console.log(`- Average Chain Length: ${chainAnalysis.statistics.averageChainLength.toFixed(2)}`);
  console.log(`- Longest Chain: ${chainAnalysis.statistics.longestChain}`);
  console.log(`- Issues Found: ${chainAnalysis.issues.length}`);
  
  if (chainAnalysis.issues.length > 0) {
    console.log("\n⚠️  Chain Issues:");
    chainAnalysis.issues.forEach((issue, index) => {
      console.log(`${index + 1}. [${issue.severity}] ${issue.message}`);
      console.log(`   💡 ${issue.recommendation}`);
    });
  }
  
  console.log("\n🔍 Detecting replay anomalies...");
  const anomalies = eventDebugger.detectReplayAnomalies(session.id);
  
  console.log("Anomaly Detection Results:");
  console.log(`- Ordering Issues: ${anomalies.orderingIssues.length}`);
  console.log(`- Duplicate Events: ${anomalies.duplicateEvents.length}`);
  console.log(`- Missing Events: ${anomalies.missingEvents.length}`);
  
  if (anomalies.duplicateEvents.length > 0) {
    console.log("\n🔄 Duplicate Events Found:");
    anomalies.duplicateEvents.forEach((duplicate, index) => {
      console.log(`${index + 1}. Events ${duplicate.eventIds.join(', ')} appear to be duplicates`);
    });
  }
  
  console.log("\n📊 Generating debug report...");
  const debugReport = eventDebugger.generateDebugReport(session.id, 'text');
  console.log(debugReport);
  
  eventDebugger.endDebugSession(session.id);
  eventDebugger.close();
  console.log("\n✅ Event sourcing debugging demonstration completed\n");
}

async function demonstrateSchemaMigration() {
  console.log("🔄 DEMONSTRATION: Schema Migration Helper");
  console.log("─".repeat(42));
  
  const migrationHelper = new SchemaMigrationHelper(dbPath);
  
  console.log("Creating a schema migration...");
  
  // Create a migration to add user preferences
  const migration = migrationHelper.createMigration(
    'add_user_activity_log',
    'Add table to track user activity for analytics'
  );
  
  console.log(`Created migration: ${migration.id}`);
  
  // Add SQL migration
  migrationHelper.addSQLMigration(migration, 'up', `
    CREATE TABLE user_activity_log (
      id INTEGER PRIMARY KEY,
      user_id INTEGER NOT NULL,
      activity_type TEXT NOT NULL,
      activity_data TEXT,
      timestamp TEXT NOT NULL,
      ip_address TEXT,
      user_agent TEXT
    );
    
    CREATE INDEX idx_user_activity_user_id ON user_activity_log(user_id);
    CREATE INDEX idx_user_activity_timestamp ON user_activity_log(timestamp);
  `);
  
  migrationHelper.addSQLMigration(migration, 'down', `
    DROP INDEX IF EXISTS idx_user_activity_timestamp;
    DROP INDEX IF EXISTS idx_user_activity_user_id;
    DROP TABLE IF EXISTS user_activity_log;
  `);
  
  // Add event migration
  migrationHelper.addEventMigration(migration, 'up', {
    fromVersion: 1,
    toVersion: 2,
    eventType: 'createUser',
    transformation: (data) => ({
      ...data,
      activityTracking: true,
      trackingConsent: data.trackingConsent || false
    }),
    validator: (data) => {
      return data.activityTracking !== undefined && 
             typeof data.trackingConsent === 'boolean';
    }
  });
  
  console.log("\n🧪 Executing migration in dry-run mode...");
  const dryRunExecution = await migrationHelper.executeMigration(migration, 'up', true);
  
  console.log("Dry Run Results:");
  console.log(`- Status: ${dryRunExecution.status}`);
  console.log(`- Steps: ${dryRunExecution.steps.length}`);
  console.log(`- Errors: ${dryRunExecution.errors.length}`);
  
  dryRunExecution.steps.forEach((step, index) => {
    console.log(`  ${index + 1}. ${step.type}: ${step.success ? '✅' : '❌'} ${step.message || ''}`);
  });
  
  if (dryRunExecution.status === 'COMPLETED') {
    console.log("\n🚀 Executing migration for real...");
    const realExecution = await migrationHelper.executeMigration(migration, 'up', false);
    
    console.log("Real Execution Results:");
    console.log(`- Status: ${realExecution.status}`);
    console.log(`- Duration: ${realExecution.endTime - realExecution.startTime}ms`);
    
    // Check migration status
    const status = migrationHelper.getMigrationStatus();
    console.log(`\n📋 Migration Status:`);
    console.log(`- Applied Migrations: ${status.applied.length}`);
    console.log(`- Pending Migrations: ${status.pending.length}`);
    if (status.lastMigration) {
      console.log(`- Last Migration: ${status.lastMigration.name} (${status.lastMigration.executed_at})`);
    }
  }
  
  console.log("\n📝 Generating migration templates...");
  
  const schemaTemplate = migrationHelper.generateMigrationTemplate('add_new_feature', 'schema');
  console.log("Schema Migration Template:");
  console.log("─".repeat(30));
  console.log(schemaTemplate.substring(0, 300) + "...");
  
  const eventTemplate = migrationHelper.generateMigrationTemplate('migrate_user_data', 'event');
  console.log("\nEvent Migration Template:");
  console.log("─".repeat(30));
  console.log(eventTemplate.substring(0, 300) + "...");
  
  migrationHelper.close();
  console.log("\n✅ Schema migration demonstration completed\n");
}

async function demonstrateDeveloperToolsSuite() {
  console.log("🛠️  DEMONSTRATION: Developer Tools Suite");
  console.log("─".repeat(40));
  
  const developerTools = new DeveloperToolsSuite(dbPath);
  
  console.log("🏥 Running quick health check...");
  const healthCheck = await developerTools.quickHealthCheck();
  
  console.log("System Health Report:");
  console.log(`- Overall Health: ${healthCheck.overall}`);
  console.log(`- Database Status: ${healthCheck.checks.database?.status || 'Unknown'}`);
  console.log(`- Event Count: ${healthCheck.checks.database?.eventCount || 0}`);
  
  if (healthCheck.checks.compliance) {
    console.log(`- Compliance Status: ${healthCheck.checks.compliance.status}`);
    console.log(`- Compliance Score: ${healthCheck.checks.compliance.score}%`);
  }
  
  if (healthCheck.recommendations.length > 0) {
    console.log("\n💡 Recommendations:");
    healthCheck.recommendations.forEach((rec, index) => {
      console.log(`${index + 1}. ${rec}`);
    });
  }
  
  console.log("\n🔧 Accessing individual tools through suite...");
  
  // Demonstrate accessing tools through the suite
  const correlationId = 'suite-demo-1';
  
  eventQueue.store({
    cmd: 'suiteDemo',
    data: { demo: true, timestamp: new Date().toISOString() },
    correlationId
  }, model, demoCallbacks);
  
  // Use visualizer through suite
  console.log("\n📊 Using visualizer through suite:");
  const viz = developerTools.visualizer.generateInteractiveEventMap(correlationId, {
    format: 'tree',
    showMetrics: true
  });
  console.log(`Generated visualization with ${viz.events} events`);
  
  // Use debugger through suite
  console.log("\n🐛 Using debugger through suite:");
  const debugSession = developerTools.debugger.startDebugSession('suite-debug', {
    correlationId
  });
  console.log(`Started debug session with ${debugSession.events.length} events`);
  
  const report = developerTools.debugger.generateDebugReport(debugSession.id);
  console.log("Debug report generated:", report.substring(0, 200) + "...");
  
  developerTools.debugger.endDebugSession(debugSession.id);
  
  developerTools.close();
  console.log("\n✅ Developer tools suite demonstration completed\n");
}

async function runFullDemo() {
  try {
    console.log("Starting comprehensive developer tools demonstration...\n");
    
    await demonstrateVisualization();
    await demonstrateComplianceChecking();
    await demonstrateEventSourcingDebugger();
    await demonstrateSchemaMigration();
    await demonstrateDeveloperToolsSuite();
    
    console.log("🎉 ALL DEMONSTRATIONS COMPLETED SUCCESSFULLY!");
    console.log("\nThe EventLite Developer Tools provide comprehensive debugging,");
    console.log("analysis, and maintenance capabilities for event sourcing applications.");
    console.log("\nKey features demonstrated:");
    console.log("✅ Advanced event relationship visualization (tree, graph, timeline, flowchart)");
    console.log("✅ Comprehensive GDPR compliance checking and reporting");
    console.log("✅ Sophisticated event sourcing debugging and anomaly detection");
    console.log("✅ Powerful schema and event migration management");
    console.log("✅ Integrated developer tools suite with health monitoring");
    
  } catch (error) {
    console.error("❌ Demo failed:", error.message);
    console.error(error.stack);
  } finally {
    // EventQueue doesn't have a close method - the database is managed internally
    console.log("\n🔚 Demo completed");
  }
}

// Handle command line execution
if (import.meta.main) {
  runFullDemo();
}

export {
  demonstrateVisualization,
  demonstrateComplianceChecking,
  demonstrateEventSourcingDebugger,
  demonstrateSchemaMigration,
  demonstrateDeveloperToolsSuite,
  runFullDemo
};