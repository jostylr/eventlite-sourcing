import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { unlink } from "fs/promises";
import { 
  EventVisualizerPro, 
  GDPRComplianceChecker, 
  EventSourcingDebugger, 
  SchemaMigrationHelper, 
  DeveloperToolsSuite 
} from "../lib/developer-tools.js";
import { initQueue, eventCallbacks, modelSetup } from "../index.js";

const testDbPath = "./test-developer-tools.db";

// Test model setup
const testModel = {
  tables: () => `
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL
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
    createUser: db.prepare(`INSERT INTO users (name, email) VALUES (?, ?)`),
    getUser: db.prepare(`SELECT * FROM users WHERE id = ?`),
    deleteUser: db.prepare(`DELETE FROM users WHERE id = ?`)
  }),
  methods: (queries) => ({
    createUser: ({ name, email }) => {
      const result = queries.createUser.run(name, email);
      return { userId: result.lastInsertRowid, name, email };
    },
    getUser: ({ userId }) => {
      return queries.getUser.get(userId);
    },
    deleteUser: ({ userId }) => {
      const result = queries.deleteUser.run(userId);
      return { deleted: result.changes > 0, userId };
    }
  })
};

describe("EventVisualizerPro", () => {
  let eventQueue;
  let model;
  let visualizer;

  beforeEach(async () => {
    try {
      await unlink(testDbPath);
    } catch {}
    
    eventQueue = initQueue({ dbName: testDbPath });
    model = modelSetup({ 
      model: testModel,
      default: () => "" // Suppress "unknown to model" messages during testing
    });
    visualizer = new EventVisualizerPro(testDbPath);
  });

  afterEach(async () => {
    visualizer?.close();
    if (eventQueue?._queries?.db) {
      eventQueue._queries.db.close();
    }
    try {
      await unlink(testDbPath);
    } catch {}
  });

  describe("generateInteractiveEventMap", () => {
    it("should generate tree visualization for event chain", async () => {
      // Create a correlation of events
      const correlationId = "test-correlation-1";
      
      // Create a custom callback that will create child events
      const testCallbacks = {
        ...eventCallbacks.void,
        createUser: (result, row) => {
          // Create child events with proper causation
          eventQueue.store({
            cmd: "sendWelcomeEmail",
            data: { userId: result?.userId || "user123" },
            correlationId,
            causationId: row.id
          }, model, eventCallbacks.void);

          eventQueue.store({
            cmd: "createProfile", 
            data: { userId: result?.userId || "user123" },
            correlationId,
            causationId: row.id
          }, model, eventCallbacks.void);
        }
      };
      
      // Root event - this will trigger the child events via callback
      eventQueue.store({
        cmd: "createUser",
        data: { name: "John Doe", email: "john@example.com" },
        correlationId
      }, model, testCallbacks);

      const visualization = visualizer.generateInteractiveEventMap(correlationId, {
        format: 'tree',
        showMetrics: true,
        includeData: false
      });

      expect(visualization).toBeDefined();
      expect(visualization.correlationId).toBe(correlationId);
      expect(visualization.format).toBe('tree');
      expect(visualization.events).toBe(3);
      expect(visualization.content).toContain('EVENT RELATIONSHIP TREE');
      expect(visualization.content).toContain('createUser');
      expect(visualization.content).toContain('sendWelcomeEmail');
      expect(visualization.content).toContain('createProfile');
      expect(visualization.content).toContain('🚀'); // Root event marker
      expect(visualization.content).toContain('⚡'); // Child event marker
    });

    it("should generate graph visualization in DOT format", async () => {
      const correlationId = "test-correlation-2";
      
      const rootEvent = eventQueue.store({
        cmd: "processOrder",
        data: { orderId: 12345 },
        correlationId
      }, model, eventCallbacks.void);

      const visualization = visualizer.generateInteractiveEventMap(correlationId, {
        format: 'graph',
        includeData: false
      });

      expect(visualization.content).toContain('GRAPH VISUALIZATION (DOT Format)');
      expect(visualization.content).toContain('digraph EventGraph');
      expect(visualization.content).toContain('processOrder');
      expect(visualization.content).toContain('lightblue'); // Root node color
    });

    it("should generate timeline visualization", async () => {
      const correlationId = "test-correlation-3";
      
      eventQueue.store({
        cmd: "startProcess",
        data: { processId: 1 },
        correlationId
      }, model, eventCallbacks.void);

      const visualization = visualizer.generateInteractiveEventMap(correlationId, {
        format: 'timeline',
        showMetrics: true
      });

      expect(visualization.content).toContain('EVENT TIMELINE');
      expect(visualization.content).toContain('startProcess');
      expect(visualization.content).toContain('🚀'); // Timeline marker
    });

    it("should generate flowchart visualization in Mermaid format", async () => {
      const correlationId = "test-correlation-4";
      
      eventQueue.store({
        cmd: "initWorkflow",
        data: { workflowId: 1 },
        correlationId
      }, model, eventCallbacks.void);

      const visualization = visualizer.generateInteractiveEventMap(correlationId, {
        format: 'flowchart',
        groupByType: true
      });

      expect(visualization.content).toContain('FLOWCHART VISUALIZATION (Mermaid Format)');
      expect(visualization.content).toContain('```mermaid');
      expect(visualization.content).toContain('flowchart TD');
      expect(visualization.content).toContain('initWorkflow');
    });

    it("should handle empty correlation ID", async () => {
      const visualization = visualizer.generateInteractiveEventMap("nonexistent-correlation");
      
      expect(visualization).toHaveProperty('error');
      expect(visualization.error).toContain('No events found');
    });
  });
});

describe("GDPRComplianceChecker", () => {
  let eventQueue;
  let model;
  let complianceChecker;

  beforeEach(async () => {
    try {
      await unlink(testDbPath);
    } catch {}
    
    eventQueue = initQueue({ dbName: testDbPath });
    model = modelSetup({ 
      model: testModel,
      default: () => "" // Suppress "unknown to model" messages during testing
    });
    complianceChecker = new GDPRComplianceChecker(testDbPath);
  });

  afterEach(async () => {
    complianceChecker?.close();
    if (eventQueue?._queries?.db) {
      eventQueue._queries.db.close();
    }
    try {
      await unlink(testDbPath);
    } catch {}
  });

  describe("runComplianceCheck", () => {
    it("should perform basic compliance check", async () => {
      // Add some test events
      eventQueue.store({
        cmd: "createUser",
        data: { name: "John Doe", email: "john@example.com", userId: "user123" },
        correlationId: "compliance-test-1"
      }, model, eventCallbacks.void);

      const result = await complianceChecker.runComplianceCheck({
        checkDataIntegrity: true,
        checkRetentionPolicies: false,
        checkConsentTracking: false,
        checkDataClassification: false,
        generateReport: false
      });

      expect(result).toBeDefined();
      expect(result.timestamp).toBeDefined();
      expect(result.overallCompliance).toMatch(/EXCELLENT|GOOD|FAIR|POOR|UNKNOWN/);
      expect(result.checks).toBeDefined();
      expect(result.checks.dataIntegrity).toBeDefined();
      expect(result.summary).toBeDefined();
      expect(typeof result.summary.complianceScore).toBe('number');
    });

    it("should detect data integrity issues", async () => {
      // Create events with orphaned causation references
      eventQueue.store({
        cmd: "createUser",
        data: { userId: "user123" },
        correlationId: "integrity-test-1"
      }, model, eventCallbacks.void);

      // Manually insert an event with invalid causation_id using the compliance checker's database
      complianceChecker.db.prepare(`
        INSERT INTO queue (version, datetime, user, ip, cmd, data, correlation_id, causation_id)
        VALUES (1, ?, 'test-user', '127.0.0.1', 'orphanedEvent', '{}', 'integrity-test-1', 99999)
      `).run(Date.now());

      const result = await complianceChecker.runComplianceCheck({
        checkDataIntegrity: true,
        generateReport: false
      });

      const dataIntegrityCheck = result.checks.dataIntegrity;
      expect(dataIntegrityCheck.passed).toBe(false);
      expect(dataIntegrityCheck.issues.length).toBeGreaterThan(0);
      expect(dataIntegrityCheck.issues[0].type).toBe('DATA_INTEGRITY');
      expect(dataIntegrityCheck.issues[0].message).toContain('orphaned events');
    });

    it("should generate formatted compliance report", async () => {
      eventQueue.store({
        cmd: "testEvent",
        data: { test: true },
        correlationId: "report-test-1"
      }, model, eventCallbacks.void);

      const report = await complianceChecker.runComplianceCheck({
        generateReport: true
      });

      expect(typeof report).toBe('string');
      expect(report).toContain('GDPR COMPLIANCE REPORT');
      expect(report).toContain('Overall Compliance:');
      expect(report).toContain('CHECK RESULTS');
    });

    it("should check for sensitive data patterns", async () => {
      // Store event with potential sensitive data
      eventQueue.store({
        cmd: "updateProfile",
        data: { 
          userId: "user123",
          email: "john@example.com",
          phone: "123-456-7890",
          password: "secret123"
        },
        correlationId: "sensitive-data-test"
      }, model, eventCallbacks.void);

      const result = await complianceChecker.runComplianceCheck({
        checkDataClassification: true,
        generateReport: false
      });

      const dataClassificationCheck = result.checks.dataClassification;
      expect(dataClassificationCheck).toBeDefined();
      
      if (!dataClassificationCheck.passed) {
        expect(dataClassificationCheck.issues.length).toBeGreaterThan(0);
        const sensitiveDataIssues = dataClassificationCheck.issues.filter(
          issue => issue.type === 'DATA_CLASSIFICATION'
        );
        expect(sensitiveDataIssues.length).toBeGreaterThan(0);
      }
    });
  });
});

describe("EventSourcingDebugger", () => {
  let eventQueue;
  let model;
  let eventDebugger;

  beforeEach(async () => {
    try {
      await unlink(testDbPath);
    } catch {}
    
    eventQueue = initQueue({ dbName: testDbPath });
    model = modelSetup({ 
      model: testModel,
      default: () => "" // Suppress "unknown to model" messages during testing
    });
    eventDebugger = new EventSourcingDebugger(testDbPath);
  });

  afterEach(async () => {
    eventDebugger?.close();
    if (eventQueue?._queries?.db) {
      eventQueue._queries.db.close();
    }
    try {
      await unlink(testDbPath);
    } catch {}
  });

  describe("startDebugSession", () => {
    it("should start debug session with correlation ID", async () => {
      const correlationId = "debug-test-1";
      
      // Create test events
      const rootEvent = eventQueue.store({
        cmd: "startWorkflow",
        data: { workflowId: 1 },
        correlationId
      }, model, eventCallbacks.void);

      eventQueue.store({
        cmd: "processStep1",
        data: { stepId: 1 },
        correlationId,
        causationId: rootEvent.id
      }, model, eventCallbacks.void);

      const session = eventDebugger.startDebugSession("test-session-1", {
        correlationId,
        trackPerformance: true,
        verboseLogging: false
      });

      expect(session).toBeDefined();
      expect(session.id).toBe("test-session-1");
      expect(session.events.length).toBe(2);
      expect(session.status).toBe('ACTIVE');
      expect(session.analysis.correlationId).toBe(correlationId);
      expect(session.logs.length).toBeGreaterThan(0);
    });

    it("should start debug session with specific event ID", async () => {
      const correlationId = "debug-test-2";
      
      eventQueue.store({
        cmd: "testEvent",
        data: { test: true },
        correlationId
      }, model, eventCallbacks.void);

      // Use the first event ID (1) since events are created sequentially
      const session = eventDebugger.startDebugSession("test-session-2", {
        eventId: 1
      });

      expect(session.analysis.eventId).toBe(1);
      expect(session.analysis.correlationId).toBe(correlationId);
    });
  });

  describe("analyzeCausationChains", () => {
    it("should analyze causation chains and detect issues", async () => {
      const correlationId = "chain-test-1";
      
      // Create a long causation chain using hardcoded IDs
      // We'll create a chain where each event references the previous one
      let lastEventId = null;
      for (let i = 0; i < 25; i++) {
        eventQueue.store({
          cmd: `step${i}`,
          data: { stepNumber: i },
          correlationId,
          causationId: lastEventId
        }, model, eventCallbacks.void);
        // For this test, we'll use sequential IDs (assuming they start from 1)
        lastEventId = i + 1;
      }

      const session = eventDebugger.startDebugSession("chain-session", {
        correlationId
      });

      const analysis = eventDebugger.analyzeCausationChains(session.id);

      expect(analysis).toBeDefined();
      expect(analysis.chains.length).toBeGreaterThan(0);
      expect(analysis.statistics.totalChains).toBeGreaterThan(0);
      expect(analysis.statistics.longestChain).toBe(25);
      expect(analysis.statistics.averageChainLength).toBeGreaterThan(20);
      
      // Should detect excessive chain length issue
      const excessiveLengthIssues = analysis.issues.filter(
        issue => issue.type === 'EXCESSIVE_CHAIN_LENGTH'
      );
      expect(excessiveLengthIssues.length).toBeGreaterThan(0);
    });

    it("should provide recommendations for chain issues", async () => {
      const correlationId = "chain-recommendations-test";
      
      // Create problematic chain structure
      const rootEvent = eventQueue.store({
        cmd: "rootEvent",
        data: {},
        correlationId
      }, model, eventCallbacks.void);

      // Create very long chain - use hardcoded sequential IDs
      let lastEventId = 1; // Root event ID
      for (let i = 0; i < 22; i++) {
        eventQueue.store({
          cmd: `longChainStep${i}`,
          data: { step: i },
          correlationId,
          causationId: lastEventId
        }, model, eventCallbacks.void);
        lastEventId++; // Next event will have the next ID
      }

      const session = eventDebugger.startDebugSession("recommendations-session", {
        correlationId
      });

      const analysis = eventDebugger.analyzeCausationChains(session.id);
      
      expect(analysis.recommendations.length).toBeGreaterThan(0);
      const performanceRecommendations = analysis.recommendations.filter(
        rec => rec.category === 'PERFORMANCE'
      );
      expect(performanceRecommendations.length).toBeGreaterThan(0);
    });
  });

  describe("detectReplayAnomalies", () => {
    it("should detect ordering issues", async () => {
      const correlationId = "anomaly-test-1";
      
      // Create events with proper causation first
      eventQueue.store({
        cmd: "rootEvent",
        data: {},
        correlationId
      }, model, eventCallbacks.void);

      // Manually insert an event with future causation reference using the debugger's database
      const futureEventId = 1000; // Future ID that doesn't exist
      eventDebugger.db.prepare(`
        INSERT INTO queue (version, datetime, user, ip, cmd, data, correlation_id, causation_id)
        VALUES (1, ?, 'test-user', '127.0.0.1', 'futureReference', '{}', ?, ?)
      `).run(Date.now(), correlationId, futureEventId);

      const session = eventDebugger.startDebugSession("anomaly-session", {
        correlationId
      });

      const anomalies = eventDebugger.detectReplayAnomalies(session.id);

      expect(anomalies).toBeDefined();
      expect(anomalies.orderingIssues.length).toBeGreaterThan(0);
      
      const futureReferenceIssues = anomalies.orderingIssues.filter(
        issue => issue.type === 'FUTURE_CAUSATION'
      );
      expect(futureReferenceIssues.length).toBeGreaterThan(0);
    });

    it("should detect duplicate events", async () => {
      const correlationId = "duplicate-test-1";
      
      // Create identical events
      const eventData = {
        cmd: "duplicateTest",
        data: { test: "duplicate" },
        correlationId
      };

      eventQueue.store(eventData, model, eventCallbacks.stub);
      eventQueue.store(eventData, model, eventCallbacks.stub);

      const session = eventDebugger.startDebugSession("duplicate-session", {
        correlationId
      });

      const anomalies = eventDebugger.detectReplayAnomalies(session.id);

      expect(anomalies.duplicateEvents.length).toBeGreaterThan(0);
      expect(anomalies.duplicateEvents[0].eventIds.length).toBe(2);
    });
  });

  describe("generateDebugReport", () => {
    it("should generate text format debug report", async () => {
      const correlationId = "report-test-1";
      
      eventQueue.store({
        cmd: "reportTest",
        data: { test: true },
        correlationId
      }, model, eventCallbacks.void);

      const session = eventDebugger.startDebugSession("report-session", {
        correlationId
      });

      eventDebugger.analyzeCausationChains(session.id);
      eventDebugger.detectReplayAnomalies(session.id);

      const report = eventDebugger.generateDebugReport(session.id, 'text');

      expect(typeof report).toBe('string');
      expect(report).toContain('EVENT SOURCING DEBUG REPORT');
      expect(report).toContain('Session ID: report-session');
      expect(report).toContain('Events Analyzed: 1');
    });

    it("should generate JSON format debug report", async () => {
      const correlationId = "json-report-test";
      
      eventQueue.store({
        cmd: "jsonReportTest",
        data: { test: true },
        correlationId
      }, model, eventCallbacks.void);

      const session = eventDebugger.startDebugSession("json-session", {
        correlationId
      });

      const report = eventDebugger.generateDebugReport(session.id, 'json');
      const reportData = JSON.parse(report);

      expect(reportData).toBeDefined();
      expect(reportData.sessionId).toBe('json-session');
      expect(reportData.eventCount).toBe(1);
      expect(reportData.summary).toBeDefined();
    });
  });

  describe("endDebugSession", () => {
    it("should properly end debug session", async () => {
      const session = eventDebugger.startDebugSession("end-test-session", {
        correlationId: "test-correlation"
      });

      expect(session.status).toBe('ACTIVE');

      const endedSession = eventDebugger.endDebugSession("end-test-session");
      
      expect(endedSession).toBeDefined();
      expect(endedSession.status).toBe('COMPLETED');
      expect(endedSession.endTime).toBeDefined();
    });
  });
});

describe("SchemaMigrationHelper", () => {
  let migrationHelper;

  beforeEach(async () => {
    try {
      await unlink(testDbPath);
    } catch {}
    
    migrationHelper = new SchemaMigrationHelper(testDbPath);
  });

  afterEach(async () => {
    migrationHelper?.close();
    try {
      await unlink(testDbPath);
    } catch {}
  });

  describe("createMigration", () => {
    it("should create migration with proper structure", async () => {
      const migration = migrationHelper.createMigration(
        "add_user_preferences",
        "Add user preferences table"
      );

      expect(migration).toBeDefined();
      expect(migration.id).toContain("add_user_preferences");
      expect(migration.name).toBe("add_user_preferences");
      expect(migration.description).toBe("Add user preferences table");
      expect(migration.status).toBe('PENDING');
      expect(migration.up).toBeDefined();
      expect(migration.down).toBeDefined();
      expect(migration.up.sql).toEqual([]);
      expect(migration.up.eventMigrations).toEqual([]);
    });
  });

  describe("addSQLMigration", () => {
    it("should add SQL migration steps", async () => {
      const migration = migrationHelper.createMigration("test_sql_migration");
      
      migrationHelper.addSQLMigration(migration, 'up', `
        CREATE TABLE user_preferences (
          id INTEGER PRIMARY KEY,
          user_id TEXT NOT NULL,
          preference_key TEXT NOT NULL,
          preference_value TEXT
        );
      `);

      migrationHelper.addSQLMigration(migration, 'down', `
        DROP TABLE user_preferences;
      `);

      expect(migration.up.sql.length).toBe(1);
      expect(migration.down.sql.length).toBe(1);
      expect(migration.up.sql[0].sql).toContain('CREATE TABLE user_preferences');
      expect(migration.down.sql[0].sql).toContain('DROP TABLE user_preferences');
    });
  });

  describe("addEventMigration", () => {
    it("should add event migration steps", async () => {
      const migration = migrationHelper.createMigration("test_event_migration");
      
      migrationHelper.addEventMigration(migration, 'up', {
        fromVersion: 1,
        toVersion: 2,
        eventType: 'userCreated',
        transformation: (data) => ({
          ...data,
          newField: 'defaultValue'
        }),
        validator: (data) => data.newField !== undefined
      });

      expect(migration.up.eventMigrations.length).toBe(1);
      const eventMigration = migration.up.eventMigrations[0];
      expect(eventMigration.fromVersion).toBe(1);
      expect(eventMigration.toVersion).toBe(2);
      expect(eventMigration.eventType).toBe('userCreated');
      expect(typeof eventMigration.transformation).toBe('function');
      expect(typeof eventMigration.validator).toBe('function');
    });
  });

  describe("executeMigration", () => {
    it("should execute SQL migration in dry run mode", async () => {
      const migration = migrationHelper.createMigration("dry_run_test");
      
      migrationHelper.addSQLMigration(migration, 'up', `
        CREATE TABLE test_table (
          id INTEGER PRIMARY KEY,
          name TEXT NOT NULL
        );
      `);

      const execution = await migrationHelper.executeMigration(migration, 'up', true);

      expect(execution).toBeDefined();
      expect(execution.dryRun).toBe(true);
      expect(execution.status).toBe('COMPLETED');
      expect(execution.steps.length).toBe(1);
      expect(execution.steps[0].type).toBe('SQL');
      expect(execution.steps[0].success).toBe(true);
    });

    it("should execute SQL migration for real", async () => {
      const migration = migrationHelper.createMigration("real_execution_test");
      
      migrationHelper.addSQLMigration(migration, 'up', `
        CREATE TABLE test_execution_table (
          id INTEGER PRIMARY KEY,
          name TEXT NOT NULL
        );
      `);

      const execution = await migrationHelper.executeMigration(migration, 'up', false);

      expect(execution.dryRun).toBe(false);
      expect(execution.status).toBe('COMPLETED');
      expect(execution.steps[0].success).toBe(true);

      // Verify migration was recorded
      const status = migrationHelper.getMigrationStatus();
      expect(status.applied.length).toBe(1);
      expect(status.applied[0].id).toBe(migration.id);
    });

    it("should handle SQL migration errors", async () => {
      const migration = migrationHelper.createMigration("error_test");
      
      migrationHelper.addSQLMigration(migration, 'up', `
        CREATE TABLE invalid_sql_syntax ( this is not valid SQL );
      `);

      const execution = await migrationHelper.executeMigration(migration, 'up', true);

      expect(execution.status).toBe('FAILED');
      expect(execution.errors.length).toBeGreaterThan(0);
      expect(execution.steps[0].success).toBe(false);
    });
  });

  describe("getMigrationStatus", () => {
    it("should return migration status information", async () => {
      const status = migrationHelper.getMigrationStatus();

      expect(status).toBeDefined();
      expect(status.applied).toEqual([]);
      expect(status.pending).toEqual([]);
      expect(status.total).toBe(0);
      expect(status.lastMigration).toBeNull();
    });
  });

  describe("generateMigrationTemplate", () => {
    it("should generate schema migration template", async () => {
      const template = migrationHelper.generateMigrationTemplate(
        "add_new_table",
        "schema"
      );

      expect(typeof template).toBe('string');
      expect(template).toContain('Schema Migration: add_new_table');
      expect(template).toContain('export function up(migration)');
      expect(template).toContain('export function down(migration)');
      expect(template).toContain('addSQLMigration');
    });

    it("should generate event migration template", async () => {
      const template = migrationHelper.generateMigrationTemplate(
        "migrate_user_events",
        "event"
      );

      expect(template).toContain('Event Migration: migrate_user_events');
      expect(template).toContain('addEventMigration');
      expect(template).toContain('transformation');
      expect(template).toContain('validator');
    });
  });
});

describe("DeveloperToolsSuite", () => {
  let eventQueue;
  let model;
  let developerTools;

  beforeEach(async () => {
    try {
      await unlink(testDbPath);
    } catch {}
    
    eventQueue = initQueue({ dbName: testDbPath });
    model = modelSetup({ 
      model: testModel,
      default: () => "" // Suppress "unknown to model" messages during testing
    });
    developerTools = new DeveloperToolsSuite(testDbPath);
  });

  afterEach(async () => {
    developerTools?.close();
    if (eventQueue?._queries?.db) {
      eventQueue._queries.db.close();
    }
    try {
      await unlink(testDbPath);
    } catch {}
  });

  describe("constructor", () => {
    it("should initialize all developer tools", async () => {
      expect(developerTools.visualizer).toBeDefined();
      expect(developerTools.complianceChecker).toBeDefined();
      expect(developerTools.debugger).toBeDefined();
      expect(developerTools.migrationHelper).toBeDefined();
    });
  });

  describe("quickHealthCheck", () => {
    it("should perform quick health assessment", async () => {
      // Add some test data
      eventQueue.store({
        cmd: "healthCheckTest",
        data: { test: true },
        correlationId: "health-check-1"
      }, model, eventCallbacks.void);

      const health = await developerTools.quickHealthCheck();

      expect(health).toBeDefined();
      expect(health.timestamp).toBeDefined();
      expect(health.overall).toMatch(/EXCELLENT|GOOD|FAIR|POOR|ERROR|UNKNOWN/);
      expect(health.checks).toBeDefined();
      expect(health.checks.database).toBeDefined();
      expect(health.checks.database.status).toBe('OK');
      expect(health.checks.database.eventCount).toBeGreaterThan(0);
      expect(health.recommendations).toBeDefined();
    });

    it("should provide recommendations for poor health", async () => {
      // Create conditions that might trigger recommendations
      const health = await developerTools.quickHealthCheck();

      expect(Array.isArray(health.recommendations)).toBe(true);
      
      // If health is not excellent, should have recommendations
      if (health.overall !== 'EXCELLENT') {
        expect(health.recommendations.length).toBeGreaterThan(0);
      }
    });
  });

  describe("integrated workflow", () => {
    it("should support complete debugging workflow", async () => {
      const correlationId = "integrated-test-1";
      
      // Create test scenario
      const rootEvent = eventQueue.store({
        cmd: "startProcess",
        data: { processId: 1 },
        correlationId
      }, model, eventCallbacks.void);

      eventQueue.store({
        cmd: "processStep",
        data: { step: 1 },
        correlationId,
        causationId: rootEvent.id
      }, model, eventCallbacks.void);

      // 1. Visualize events
      const visualization = developerTools.visualizer.generateInteractiveEventMap(
        correlationId,
        { format: 'tree', showMetrics: true }
      );
      expect(visualization.events).toBe(2);

      // 2. Check compliance
      const complianceResult = await developerTools.complianceChecker.runComplianceCheck({
        checkDataIntegrity: true,
        generateReport: false
      });
      expect(complianceResult.checks.dataIntegrity.passed).toBe(true);

      // 3. Debug the events
      const session = developerTools.debugger.startDebugSession("integrated-session", {
        correlationId
      });
      expect(session.events.length).toBe(2);

      const chainAnalysis = developerTools.debugger.analyzeCausationChains(session.id);
      expect(chainAnalysis.chains.length).toBeGreaterThan(0);

      const anomalies = developerTools.debugger.detectReplayAnomalies(session.id);
      expect(anomalies).toBeDefined();

      const debugReport = developerTools.debugger.generateDebugReport(session.id);
      expect(debugReport).toContain('EVENT SOURCING DEBUG REPORT');

      // 4. Create migration if needed
      const migration = developerTools.migrationHelper.createMigration("test_migration");
      expect(migration.id).toContain("test_migration");

      // 5. Overall health check
      const health = await developerTools.quickHealthCheck();
      expect(health.overall).toMatch(/EXCELLENT|GOOD|FAIR|POOR|ERROR|UNKNOWN/);
    });
  });
});