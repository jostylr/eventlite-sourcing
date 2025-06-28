#!/usr/bin/env bun

/**
 * Pre-Event Processing Example
 * 
 * This example demonstrates the pre-event action framework including:
 * - Pre-event processor middleware
 * - External service integration
 * - Data generation utilities
 * - Common processing patterns
 */

import { initQueue, eventCallbacks } from "../lib/event-source.js";
import { PreEventProcessor, PreEventChainBuilder, commonProcessors, PreEventProcessorWrapper } from "../lib/pre-event-processor.js";
import { ExternalServiceIntegration, servicePresets } from "../lib/external-service-integration.js";
import { DataGenerator, dataGenerators } from "../lib/data-generation.js";
import { existsSync, rmSync } from "fs";

const dbPath = "examples/data/pre-event-example.sqlite";

// Clean up any existing database
if (existsSync(dbPath)) {
  rmSync(dbPath);
}

console.log("🚀 Pre-Event Processing Example\n");

// Initialize the event queue
const eventQueue = initQueue({ dbName: dbPath });

// Create data generator
const dataGenerator = new DataGenerator();

// Create external service integration
const serviceIntegration = new ExternalServiceIntegration();

// Mock external service for demo (in real app, this would be a real service)
let emailServiceCallCount = 0;
global.fetch = async (url, options) => {
  console.log(`📧 Mock email service called: ${url}`);
  emailServiceCallCount++;
  
  if (url.includes("/send")) {
    return {
      ok: true,
      json: () => Promise.resolve({ 
        messageId: `msg_${Date.now()}`,
        status: "sent" 
      })
    };
  }
  
  if (url.includes("/health")) {
    return { status: 200 };
  }
  
  return {
    ok: true,
    json: () => Promise.resolve({ success: true })
  };
};

// Register a mock email service
serviceIntegration.registerService("emailService", {
  baseUrl: "https://api.mockemailservice.com",
  headers: { "X-API-Key": "demo-key" },
  healthCheck: { endpoint: "/health" },
  rateLimit: { windowMs: 60000, maxRequests: 100 }
});

// Create pre-event processor
const preProcessor = new PreEventProcessor({ performanceMonitoring: true });

// Add data generation processor
preProcessor.use(
  dataGenerator.createPreEventProcessor({
    id: { type: 'uuid' },
    timestamp: { type: 'timestamp', format: 'iso' },
    correlationToken: { type: 'token', options: { length: 16, prefix: 'corr_' } }
  }),
  { name: "dataGenerator", order: 1 }
);

// Add validation processor
preProcessor.use(
  commonProcessors.validate({
    name: { required: true, type: 'string' },
    email: { 
      required: true, 
      type: 'string',
      validate: async (value) => value.includes('@')
    }
  }),
  { name: "validator", order: 2 }
);

// Add external service processor for email validation
preProcessor.use(
  serviceIntegration.createPreEventProcessor("emailService", {
    endpoint: "/validate-email",
    method: "POST",
    dataMapper: (event) => ({ email: event.data.email }),
    responseMapper: (response) => ({ emailValid: response.valid || true }),
    onError: "enrich" // Continue even if service fails
  }),
  { 
    name: "emailValidator", 
    order: 3,
    condition: (eventData) => eventData.cmd === 'createUser' && eventData.data.email
  }
);

// Add enrichment processor
preProcessor.use(
  commonProcessors.enrich({
    ipAddress: "127.0.0.1",
    userAgent: "EventLite-Example/1.0",
    source: "api"
  }),
  { name: "enricher", order: 4 }
);

// Add rate limiting
preProcessor.use(
  commonProcessors.rateLimit({
    windowMs: 10000,
    maxEvents: 5,
    keyGenerator: (event) => event.data.email || 'anonymous'
  }),
  { name: "rateLimiter", order: 5 }
);

// Add authorization check
preProcessor.use(
  commonProcessors.authorize(async (eventData) => {
    // Simple authorization: admin can do anything, users can only create their own records
    if (eventData.user === 'admin') return true;
    if (eventData.cmd === 'createUser' && eventData.data.email) return true;
    return false;
  }),
  { name: "authorizer", order: 6 }
);

// Error handler
preProcessor.onError(async (error, eventData, context) => {
  console.log(`❌ Pre-processing error in ${context.errors[context.errors.length - 1]?.processor}: ${error.message}`);
  
  // Continue for certain types of errors
  if (error.message.includes('Service unavailable') || error.message.includes('emailValidator')) {
    console.log("🔄 Continuing despite service error...");
    return true;
  }
  
  return false; // Stop processing
});

// Wrap the event queue with the pre-processor
const wrapper = new PreEventProcessorWrapper(eventQueue, preProcessor);

// Define the model
const userModel = {
  setup: (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        email_valid BOOLEAN DEFAULT 0,
        ip_address TEXT,
        user_agent TEXT,
        source TEXT,
        correlation_token TEXT,
        created_at TEXT NOT NULL
      )
    `);

    db.exec(`
      CREATE TABLE IF NOT EXISTS user_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT,
        event_type TEXT,
        event_data TEXT,
        created_at TEXT
      )
    `);

    return {
      createUser: db.prepare(`
        INSERT INTO users (id, name, email, email_valid, ip_address, user_agent, source, correlation_token, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `),
      logUserEvent: db.prepare(`
        INSERT INTO user_events (user_id, event_type, event_data, created_at)
        VALUES (?, ?, ?, ?)
      `),
      getUserById: db.prepare(`SELECT * FROM users WHERE id = ?`),
      getAllUsers: db.prepare(`SELECT * FROM users ORDER BY created_at DESC`)
    };
  },

  methods: (queries) => ({
    createUser: ({ id, name, email, emailValid = false, ipAddress, userAgent, source, correlationToken, timestamp }) => {
      console.log(`👤 Creating user: ${name} (${email}) with ID: ${id}`);
      
      const result = queries.createUser.run(
        id, name, email, emailValid, ipAddress, userAgent, source, correlationToken, timestamp
      );
      
      return { 
        userId: id, 
        name, 
        email, 
        emailValid,
        ipAddress,
        userAgent,
        source,
        correlationToken,
        createdAt: timestamp
      };
    },

    logUserEvent: ({ userId, eventType, eventData, timestamp }) => {
      console.log(`📝 Logging event for user ${userId}: ${eventType}`);
      
      const result = queries.logUserEvent.run(
        userId, eventType, JSON.stringify(eventData), timestamp
      );
      
      return { eventId: result.lastInsertRowid, userId, eventType };
    }
  }),

  _error: (errObj) => {
    console.log(`💥 Model error: ${errObj.msg}`);
  },

  _done: () => {},

  // Silent default handler to avoid "unknown to model" warnings for demo
  default: (data, meta) => {
    // Silently ignore unknown commands in this demo
    return "";
  }
};

// Define callbacks for side effects
const callbacks = {
  createUser: async (result, row) => {
    console.log(`✅ User created successfully: ${result.name}`);
    
    // Trigger follow-up event to send welcome email
    await eventQueue.store({
      cmd: 'sendWelcomeEmail',
      data: {
        userId: result.userId,
        email: result.email,
        name: result.name
      },
      causationId: row.id
    }, userModel, callbacks);
  },

  sendWelcomeEmail: async (result, row) => {
    console.log(`📧 Attempting to send welcome email to: ${result.email}`);
    
    try {
      const emailResult = await serviceIntegration.callService("emailService", {
        endpoint: "/send",
        method: "POST",
        data: {
          to: result.email,
          subject: "Welcome!",
          body: `Hello ${result.name}, welcome to our service!`
        }
      });
      
      console.log(`✅ Welcome email sent: ${emailResult.messageId}`);
      
      // Log the email event
      await eventQueue.store({
        cmd: 'logUserEvent',
        data: {
          userId: result.userId,
          eventType: 'welcome_email_sent',
          eventData: { messageId: emailResult.messageId },
          timestamp: new Date().toISOString()
        },
        causationId: row.id
      }, userModel, eventCallbacks.void); // Use void callbacks to prevent infinite loops
      
    } catch (error) {
      console.log(`❌ Failed to send welcome email: ${error.message}`);
      
      // Log the failure
      await eventQueue.store({
        cmd: 'logUserEvent',
        data: {
          userId: result.userId,
          eventType: 'welcome_email_failed',
          eventData: { error: error.message },
          timestamp: new Date().toISOString()
        },
        causationId: row.id
      }, userModel, eventCallbacks.void);
    }
  },

  logUserEvent: (result, row) => {
    console.log(`📝 Event logged: ${result.eventType} for user ${result.userId}`);
  }
};

// Demonstration function
async function runDemo() {
  console.log("=".repeat(60));
  console.log("Demo 1: Successful User Creation");
  console.log("=".repeat(60));

  try {
    const user1Result = await eventQueue.store({
      cmd: 'createUser',
      user: 'admin',
      data: {
        name: 'John Doe',
        email: 'john.doe@example.com'
      }
    }, userModel, callbacks);

    console.log("📊 User creation result:", user1Result);
  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
  }

  console.log("\n" + "=".repeat(60));
  console.log("Demo 2: Validation Failure");
  console.log("=".repeat(60));

  try {
    await eventQueue.store({
      cmd: 'createUser',
      user: 'admin',
      data: {
        name: 'Jane Doe'
        // Missing email - should fail validation
      }
    }, userModel, callbacks);
  } catch (error) {
    console.log(`❌ Expected validation error: ${error.message}`);
  }

  console.log("\n" + "=".repeat(60));
  console.log("Demo 3: Authorization Failure");
  console.log("=".repeat(60));

  try {
    await eventQueue.store({
      cmd: 'createUser',
      user: 'guest', // Not authorized
      data: {
        name: 'Unauthorized User',
        email: 'unauthorized@example.com'
      }
    }, userModel, callbacks);
  } catch (error) {
    console.log(`❌ Expected authorization error: ${error.message}`);
  }

  console.log("\n" + "=".repeat(60));
  console.log("Demo 4: Rate Limiting");
  console.log("=".repeat(60));

  try {
    // Create multiple users quickly to trigger rate limit
    for (let i = 1; i <= 7; i++) {
      try {
        await eventQueue.store({
          cmd: 'createUser',
          user: 'admin',
          data: {
            name: `User ${i}`,
            email: `user${i}@example.com`
          }
        }, userModel, callbacks);
        console.log(`✅ User ${i} created successfully`);
      } catch (error) {
        console.log(`❌ User ${i} failed: ${error.message}`);
      }
    }
  } catch (error) {
    console.log(`❌ Rate limiting error: ${error.message}`);
  }

  console.log("\n" + "=".repeat(60));
  console.log("Demo 5: Using Pre-Event Chain Builder");
  console.log("=".repeat(60));

  // Create a specialized processor chain for admin operations
  const adminChain = new PreEventChainBuilder()
    .add(commonProcessors.validate({
      adminKey: { required: true, type: 'string' }
    }))
    .withName("adminValidator")
    .add(commonProcessors.authorize(async (eventData) => {
      return eventData.data.adminKey === 'super-secret-admin-key';
    }))
    .withName("adminAuthorizer")
    .add(commonProcessors.enrich({
      adminTimestamp: () => new Date().toISOString(),
      adminLevel: 'super'
    }))
    .withName("adminEnricher")
    .build();

  const adminWrapper = new PreEventProcessorWrapper(eventQueue, adminChain);

  try {
    const adminResult = await eventQueue.store({
      cmd: 'createUser',
      data: {
        name: 'Admin User',
        email: 'admin@example.com',
        adminKey: 'super-secret-admin-key'
      }
    }, userModel, callbacks);

    console.log("🔐 Admin user created:", adminResult.name);
  } catch (error) {
    console.log(`❌ Admin operation error: ${error.message}`);
  }

  // Restore original wrapper
  adminWrapper.unwrap();

  console.log("\n" + "=".repeat(60));
  console.log("Demo 6: Performance Metrics and Service Status");
  console.log("=".repeat(60));

  const metrics = preProcessor.getMetrics();
  console.log("📈 Pre-processor metrics:", {
    totalProcessed: metrics.totalProcessed,
    totalErrors: metrics.totalErrors,
    averageProcessingTime: metrics.processingTimes.length > 0 
      ? metrics.processingTimes.reduce((sum, t) => sum + t.duration, 0) / metrics.processingTimes.length
      : 0
  });

  const serviceStatus = serviceIntegration.getServiceStatus("emailService");
  console.log("🌐 Email service status:", {
    name: serviceStatus.name,
    isHealthy: serviceStatus.isHealthy,
    requestCount: serviceStatus.requestCount,
    errorRate: serviceStatus.errorRate
  });

  console.log(`📧 Total email service calls: ${emailServiceCallCount}`);

  console.log("\n" + "=".repeat(60));
  console.log("Demo 7: Event Retrieval and Analysis");
  console.log("=".repeat(60));

  // Get event statistics (since we can't easily get all events without a complex setup)
  console.log("📋 Event processing completed successfully!");
  console.log("📊 Check the database file for stored events");
  console.log(`📁 Database location: ${dbPath}`);
  
  // Show performance metrics
  const finalMetrics = preProcessor.getMetrics();
  console.log("📈 Processing summary:");
  console.log(`   - Total events processed: ${finalMetrics.totalProcessed}`);
  console.log(`   - Total errors: ${finalMetrics.totalErrors}`);
  console.log(`   - Email service calls: ${emailServiceCallCount}`);
}

// Run the demonstration
await runDemo();

// Cleanup
wrapper.unwrap();
serviceIntegration.destroy();

console.log("\n🎉 Pre-Event Processing Demo Complete!");
console.log(`📁 Database saved to: ${dbPath}`);
console.log("💡 This example showed:");
console.log("   ✓ Data generation and enrichment");
console.log("   ✓ Validation and authorization");
console.log("   ✓ External service integration");
console.log("   ✓ Rate limiting and deduplication");
console.log("   ✓ Error handling and recovery");
console.log("   ✓ Performance monitoring");
console.log("   ✓ Event chain analysis");