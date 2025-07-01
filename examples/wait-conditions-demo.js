#!/usr/bin/env bun

/**
 * EventLite Wait Conditions Demo
 * 
 * This example demonstrates the powerful wait conditions feature that allows
 * events to execute only after specific prerequisite events have occurred.
 * 
 * We'll implement several real-world scenarios:
 * 1. E-commerce order processing (payment + inventory + shipping)
 * 2. Document approval workflow (multiple approvers)
 * 3. Data processing pipeline (sequential steps)
 * 4. Conference registration (counting participants)
 * 5. Manual monitoring and debugging
 */

import { initQueue, eventCallbacks } from "../lib/event-source.js";
import { modelSetup } from "../lib/model.js";

// ===========================
// 1. DATABASE SETUP
// ===========================

const orderModel = modelSetup({
  dbName: "examples/data/wait-conditions-demo.sqlite",
  reset: [""], // Clean start

  tables(db) {
    db.exec(`
      -- Orders table
      CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY,
        user_id TEXT NOT NULL,
        total_amount REAL NOT NULL,
        status TEXT DEFAULT 'pending',
        payment_status TEXT DEFAULT 'pending',
        inventory_status TEXT DEFAULT 'pending',
        shipping_status TEXT DEFAULT 'pending',
        created_at INTEGER DEFAULT (strftime('%s', 'now'))
      );

      -- Approvals table
      CREATE TABLE IF NOT EXISTS approvals (
        id INTEGER PRIMARY KEY,
        document_id TEXT NOT NULL,
        approver_id TEXT NOT NULL,
        decision TEXT NOT NULL,
        approved_at INTEGER DEFAULT (strftime('%s', 'now'))
      );

      -- Pipeline steps table
      CREATE TABLE IF NOT EXISTS pipeline_steps (
        id INTEGER PRIMARY KEY,
        pipeline_id TEXT NOT NULL,
        step_name TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        completed_at INTEGER
      );

      -- Conference registrations
      CREATE TABLE IF NOT EXISTS registrations (
        id INTEGER PRIMARY KEY,
        conference_id TEXT NOT NULL,
        participant_name TEXT NOT NULL,
        registration_type TEXT NOT NULL,
        registered_at INTEGER DEFAULT (strftime('%s', 'now'))
      );
    `);
  },

  queries(db) {
    return {
      // Order queries
      createOrder: db.prepare(`
        INSERT INTO orders (user_id, total_amount, status) 
        VALUES (?, ?, 'pending') RETURNING *
      `),
      updateOrderPayment: db.prepare(`
        UPDATE orders SET payment_status = ? WHERE id = ? RETURNING *
      `),
      updateOrderInventory: db.prepare(`
        UPDATE orders SET inventory_status = ? WHERE id = ? RETURNING *
      `),
      updateOrderShipping: db.prepare(`
        UPDATE orders SET shipping_status = ? WHERE id = ? RETURNING *
      `),
      finalizeOrder: db.prepare(`
        UPDATE orders SET status = 'completed' WHERE id = ? RETURNING *
      `),
      getOrder: db.prepare(`SELECT * FROM orders WHERE id = ?`),

      // Approval queries
      recordApproval: db.prepare(`
        INSERT INTO approvals (document_id, approver_id, decision) 
        VALUES (?, ?, ?) RETURNING *
      `),
      getApprovals: db.prepare(`
        SELECT * FROM approvals WHERE document_id = ?
      `),

      // Pipeline queries
      createPipelineStep: db.prepare(`
        INSERT INTO pipeline_steps (pipeline_id, step_name, status) 
        VALUES (?, ?, 'completed') RETURNING *
      `),
      getPipelineSteps: db.prepare(`
        SELECT * FROM pipeline_steps WHERE pipeline_id = ? ORDER BY id
      `),

      // Registration queries
      addRegistration: db.prepare(`
        INSERT INTO registrations (conference_id, participant_name, registration_type) 
        VALUES (?, ?, ?) RETURNING *
      `),
      getRegistrationCount: db.prepare(`
        SELECT COUNT(*) as count FROM registrations 
        WHERE conference_id = ? AND registration_type = ?
      `),
    };
  },

  methods(queries) {
    return {
      // Order management
      createOrder({ userId, amount }) {
        const result = queries.createOrder.run(userId, amount);
        const orderId = result.lastInsertRowid || result.id;
        console.log(`📋 Order ${orderId} created for user ${userId} ($${amount})`);
        return { orderId, userId, amount, status: 'pending' };
      },

      processPayment({ orderId, amount, method = 'card' }) {
        const result = queries.updateOrderPayment.run('completed', orderId);
        console.log(`💳 Payment processed for order ${orderId} (${amount} via ${method})`);
        return { orderId, amount, method, status: 'completed' };
      },

      checkInventory({ orderId, items = [] }) {
        const available = Math.random() > 0.1; // 90% success rate
        const status = available ? 'available' : 'out_of_stock';
        const result = queries.updateOrderInventory.run(status, orderId);
        console.log(`📦 Inventory ${available ? 'confirmed' : 'unavailable'} for order ${orderId}`);
        return { orderId, items, available, status };
      },

      calculateShipping({ orderId, address }) {
        const cost = Math.round((Math.random() * 20 + 5) * 100) / 100; // $5-25
        const result = queries.updateOrderShipping.run('calculated', orderId);
        console.log(`🚚 Shipping calculated for order ${orderId}: $${cost}`);
        return { orderId, cost, address, status: 'calculated' };
      },

      fulfillOrder({ orderId }) {
        const result = queries.finalizeOrder.run(orderId);
        console.log(`✅ Order ${orderId} fulfilled and completed!`);
        return { orderId, status: 'completed', completedAt: Date.now() };
      },

      // Approval workflow
      submitApproval({ documentId, approverId, decision }) {
        const result = queries.recordApproval.run(documentId, approverId, decision);
        console.log(`👤 ${approverId} ${decision === 'approve' ? '✅ approved' : '❌ rejected'} document ${documentId}`);
        return { documentId, approverId, decision, approvalId: result.id };
      },

      publishDocument({ documentId }) {
        console.log(`📢 Document ${documentId} published successfully!`);
        return { documentId, status: 'published', publishedAt: Date.now() };
      },

      // Pipeline processing
      completeStep({ pipelineId, stepName, data = {} }) {
        const result = queries.createPipelineStep.run(pipelineId, stepName);
        console.log(`⚙️  Pipeline ${pipelineId}: ${stepName} completed`);
        return { pipelineId, stepName, stepId: result.id, data };
      },

      finalizePipeline({ pipelineId }) {
        const steps = queries.getPipelineSteps.all(pipelineId);
        console.log(`🎯 Pipeline ${pipelineId} finalized! Completed ${steps.length} steps.`);
        return { pipelineId, stepsCompleted: steps.length, finalizedAt: Date.now() };
      },

      // Conference registration
      registerParticipant({ conferenceId, participantName, registrationType }) {
        const result = queries.addRegistration.run(conferenceId, participantName, registrationType);
        console.log(`🎫 ${participantName} registered for conference ${conferenceId} (${registrationType})`);
        return { conferenceId, participantName, registrationType, registrationId: result.id };
      },

      startConference({ conferenceId }) {
        const vipCount = queries.getRegistrationCount.get(conferenceId, 'vip').count;
        const regularCount = queries.getRegistrationCount.get(conferenceId, 'regular').count;
        console.log(`🎉 Conference ${conferenceId} started! VIP: ${vipCount}, Regular: ${regularCount}`);
        return { conferenceId, vipCount, regularCount, startedAt: Date.now() };
      },
    };
  },

  // Silent default handler for unknown commands
  default: () => "",
});

// ===========================
// 2. EVENT QUEUE SETUP
// ===========================

const eventQueue = initQueue({
  dbName: "examples/data/wait-conditions-queue.sqlite",
  reset: [""], // Clean start
});

// ===========================
// 3. DEMO SCENARIOS
// ===========================

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Scenario 1: E-commerce Order Processing
async function demoOrderProcessing() {
  console.log("\n" + "=".repeat(60));
  console.log("🛒 DEMO 1: E-COMMERCE ORDER PROCESSING");
  console.log("=".repeat(60));
  console.log("Wait for: Payment AND Inventory AND Shipping calculations");
  console.log();

  const correlationId = `order-processing-demo`;

  // Step 1: Create the order
  const orderResult = await eventQueue.store({
    cmd: 'createOrder',
    data: { userId: 'user123', amount: 99.99 },
    correlationId,
  }, orderModel, eventCallbacks.void);
  
  const orderId = orderResult.orderId;
  const createOrderEventId = 1; // First event in the queue

  // Step 2: Set up conditional fulfillment (waits for all three prerequisites)
  const waitResult = eventQueue.storeWhen({
    cmd: 'fulfillOrder',
    data: { orderId },
    correlationId,
    waitFor: {
      all: [
        { pattern: 'paymentProcessed', correlationId },
        { pattern: 'inventoryChecked', correlationId },
        { pattern: 'shippingCalculated', correlationId }
      ]
    },
    timeout: 30000, // 30 seconds timeout
  }, orderModel, eventCallbacks.void);

  console.log(`⏳ Order fulfillment waiting (Pending Event ID: ${waitResult.pendingEventId})`);
  console.log("   Waiting for: payment + inventory + shipping\n");

  // Step 3: Process prerequisites in parallel (simulating real-world async operations)
  await delay(500);
  await eventQueue.store({
    cmd: 'processPayment',
    data: { orderId, amount: 99.99, method: 'credit_card' },
    correlationId,
    causationId: createOrderEventId, // Caused by createOrder
  }, orderModel, eventCallbacks.void);

  await delay(1000);
  await eventQueue.store({
    cmd: 'checkInventory',
    data: { orderId, items: ['widget-pro'] },
    correlationId,
    causationId: createOrderEventId,
  }, orderModel, eventCallbacks.void);

  await delay(800);
  await eventQueue.store({
    cmd: 'calculateShipping',
    data: { orderId, address: '123 Main St' },
    correlationId,
    causationId: createOrderEventId,
  }, orderModel, eventCallbacks.void);

  // The fulfillOrder event should now execute automatically!
  await delay(100);
  
  console.log("\n📊 Order Processing Summary:");
  const order = orderModel._queries.getOrder.get(orderId);
  if (order) {
    console.log(`   Order ${orderId}: ${order.status}`);
    console.log(`   Payment: ${order.payment_status}`);
    console.log(`   Inventory: ${order.inventory_status}`);
    console.log(`   Shipping: ${order.shipping_status}`);
  } else {
    console.log(`   Order ${orderId}: Not found`);
  }
}

// Scenario 2: Document Approval Workflow
async function demoApprovalWorkflow() {
  console.log("\n" + "=".repeat(60));
  console.log("📄 DEMO 2: DOCUMENT APPROVAL WORKFLOW");
  console.log("=".repeat(60));
  console.log("Wait for: Manager approval AND (Director approval OR Admin override)");
  console.log();

  const documentId = 'budget-proposal-2024';
  const correlationId = `approval-${documentId}`;

  // Set up complex approval workflow
  const waitResult = eventQueue.storeWhen({
    cmd: 'publishDocument',
    data: { documentId },
    correlationId,
    waitFor: {
      all: [
        { pattern: 'approvalSubmitted', correlationId, where: { approverId: 'manager', decision: 'approve' } }
      ],
      any: [
        { pattern: 'approvalSubmitted', correlationId, where: { approverId: 'director', decision: 'approve' } },
        { pattern: 'approvalSubmitted', correlationId, where: { approverId: 'admin', decision: 'approve' } }
      ]
    },
    timeout: 60000, // 1 minute timeout
  }, orderModel, eventCallbacks.void);

  console.log(`⏳ Document publication waiting (Pending Event ID: ${waitResult.pendingEventId})`);
  console.log("   Waiting for: manager approval + (director OR admin)\n");

  // Submit approvals
  await delay(500);
  await eventQueue.store({
    cmd: 'submitApproval',
    data: { documentId, approverId: 'manager', decision: 'approve' },
    correlationId,
  }, orderModel, eventCallbacks.void);

  console.log("   ✓ Manager approval received, still need director OR admin...\n");

  await delay(1500);
  await eventQueue.store({
    cmd: 'submitApproval',
    data: { documentId, approverId: 'admin', decision: 'approve' },
    correlationId,
  }, orderModel, eventCallbacks.void);

  // Document should now be published!
  await delay(100);
  
  console.log("\n📊 Approval Summary:");
  const approvals = orderModel._queries.getApprovals.all(documentId);
  approvals.forEach(approval => {
    console.log(`   ${approval.approver_id}: ${approval.decision}`);
  });
}

// Scenario 3: Data Processing Pipeline (Sequential)
async function demoSequentialPipeline() {
  console.log("\n" + "=".repeat(60));
  console.log("⚙️  DEMO 3: DATA PROCESSING PIPELINE");
  console.log("=".repeat(60));
  console.log("Wait for: Sequential completion of pipeline steps");
  console.log();

  const pipelineId = 'data-migration-v2';
  const correlationId = `pipeline-${pipelineId}`;

  // Set up sequential pipeline
  const waitResult = eventQueue.storeWhen({
    cmd: 'finalizePipeline',
    data: { pipelineId },
    correlationId,
    waitFor: {
      sequence: [
        { pattern: 'stepCompleted', correlationId, where: { stepName: 'validate_data' } },
        { pattern: 'stepCompleted', correlationId, where: { stepName: 'backup_current' } },
        { pattern: 'stepCompleted', correlationId, where: { stepName: 'migrate_data' } },
        { pattern: 'stepCompleted', correlationId, where: { stepName: 'verify_migration' } }
      ]
    },
    timeout: 120000, // 2 minutes timeout
  }, orderModel, eventCallbacks.void);

  console.log(`⏳ Pipeline finalization waiting (Pending Event ID: ${waitResult.pendingEventId})`);
  console.log("   Waiting for sequential steps: validate → backup → migrate → verify\n");

  // Execute steps in order
  const steps = ['validate_data', 'backup_current', 'migrate_data', 'verify_migration'];
  
  for (let i = 0; i < steps.length; i++) {
    await delay(800);
    await eventQueue.store({
      cmd: 'completeStep',
      data: { pipelineId, stepName: steps[i], data: { stepNumber: i + 1 } },
      correlationId,
    }, orderModel, eventCallbacks.void);
    
    if (i < steps.length - 1) {
      console.log(`   ⏳ Step ${i + 1}/4 complete, continuing...\n`);
    }
  }

  // Pipeline should now be finalized!
  await delay(100);
  
  console.log("\n📊 Pipeline Summary:");
  const steps_completed = orderModel._queries.getPipelineSteps.all(pipelineId);
  steps_completed.forEach((step, index) => {
    console.log(`   ${index + 1}. ${step.step_name}: ${step.status}`);
  });
}

// Scenario 4: Conference Registration (Count-based)
async function demoCountBasedEvent() {
  console.log("\n" + "=".repeat(60));
  console.log("🎫 DEMO 4: CONFERENCE REGISTRATION");
  console.log("=".repeat(60));
  console.log("Wait for: 3 VIP registrations before starting conference");
  console.log();

  const conferenceId = 'tech-summit-2024';
  const correlationId = `conference-${conferenceId}`;

  // Set up count-based conference start
  const waitResult = eventQueue.storeWhen({
    cmd: 'startConference',
    data: { conferenceId },
    correlationId,
    waitFor: {
      count: {
        pattern: 'participantRegistered',
        correlationId,
        count: 3,
        where: { registrationType: 'vip' }
      }
    },
    timeout: 45000, // 45 seconds timeout
  }, orderModel, eventCallbacks.void);

  console.log(`⏳ Conference start waiting (Pending Event ID: ${waitResult.pendingEventId})`);
  console.log("   Waiting for: 3 VIP registrations\n");

  // Register participants
  const participants = [
    { name: 'Alice Johnson', type: 'regular' },
    { name: 'Bob Smith', type: 'vip' },
    { name: 'Carol Davis', type: 'regular' },
    { name: 'David Wilson', type: 'vip' },
    { name: 'Eva Brown', type: 'vip' }, // This should trigger the conference start
  ];

  for (let i = 0; i < participants.length; i++) {
    await delay(600);
    await eventQueue.store({
      cmd: 'registerParticipant',
      data: { 
        conferenceId, 
        participantName: participants[i].name, 
        registrationType: participants[i].type 
      },
      correlationId,
    }, orderModel, eventCallbacks.void);

    const vipCount = orderModel._queries.getRegistrationCount.get(conferenceId, 'vip').count;
    console.log(`   VIP count: ${vipCount}/3 ${vipCount >= 3 ? '✓' : ''}`);
  }

  // Conference should now start!
  await delay(100);
}

// Scenario 5: Manual Monitoring and Debugging
async function demoMonitoringTools() {
  console.log("\n" + "=".repeat(60));
  console.log("🔍 DEMO 5: MONITORING AND DEBUGGING TOOLS");
  console.log("=".repeat(60));
  console.log();

  const correlationId = 'monitoring-demo';

  // Create a pending event that we'll monitor
  const waitResult = eventQueue.storeWhen({
    cmd: 'demonstrateMonitoring',
    data: { message: 'This is a demo event' },
    correlationId,
    waitFor: {
      all: [
        { pattern: 'triggerEvent', correlationId },
        { pattern: 'anotherTrigger', correlationId }
      ]
    },
    timeout: 10000,
  }, orderModel, eventCallbacks.void);

  console.log("📊 Manual Monitoring Examples:");
  console.log(`   Created pending event ID: ${waitResult.pendingEventId}\n`);

  // 1. Check all pending events
  console.log("1. All pending events:");
  const allPending = eventQueue._queries.getPendingEventsByStatus.all({ status: 'pending' });
  allPending.forEach(event => {
    console.log(`   • Event ${event.id}: ${JSON.parse(event.event_data).cmd}`);
    console.log(`     Correlation: ${event.correlation_id}`);
    console.log(`     Created: ${new Date(event.created_at).toLocaleTimeString()}`);
  });

  // 2. Check specific correlation
  console.log("\n2. Events for correlation 'monitoring-demo':");
  const correlationEvents = eventQueue.getPendingEventsByCorrelation(correlationId);
  correlationEvents.forEach(event => {
    const waitConditions = JSON.parse(event.wait_conditions);
    console.log(`   • Waiting for: ${waitConditions.all?.length || 0} conditions`);
  });

  // 3. Check wait conditions
  console.log("\n3. Wait condition details:");
  const conditions = eventQueue._queries.getWaitConditions.all({ 
    pending_event_id: waitResult.pendingEventId 
  });
  conditions.forEach(condition => {
    const data = JSON.parse(condition.condition_data);
    console.log(`   • ${condition.condition_type}: ${data.pattern} (${condition.satisfied ? '✓' : '✗'})`);
  });

  // 4. Satisfy one condition
  console.log("\n4. Satisfying first condition...");
  await eventQueue.store({
    cmd: 'triggerEvent',
    data: { message: 'First trigger' },
    correlationId,
  }, orderModel, eventCallbacks.void);

  // Check updated conditions
  const readyEvents = eventQueue.checkAllPendingEvents();
  console.log(`   Ready events after first trigger: ${readyEvents.length}`);

  // 5. Cancel the pending event
  console.log("\n5. Cancelling pending event...");
  const cancelled = eventQueue.cancelPendingEvent(waitResult.pendingEventId);
  console.log(`   Cancellation ${cancelled ? 'successful' : 'failed'}`);

  // 6. Try to satisfy remaining condition (should not execute)
  await eventQueue.store({
    cmd: 'anotherTrigger',
    data: { message: 'Second trigger' },
    correlationId,
  }, orderModel, eventCallbacks.void);

  const stillReady = eventQueue.checkAllPendingEvents();
  console.log(`   Ready events after second trigger: ${stillReady.length} (should be 0)`);

  // 7. Performance monitoring
  console.log("\n6. Performance monitoring:");
  const startTime = Date.now();
  eventQueue.checkAllPendingEvents();
  const checkTime = Date.now() - startTime;
  console.log(`   Condition checking took: ${checkTime}ms`);

  // 8. Cleanup expired events
  console.log("\n7. Cleanup operations:");
  const expiredEvents = eventQueue.expirePendingEvents();
  console.log(`   Expired events cleaned up: ${expiredEvents.length}`);
}

// ===========================
// 4. MAIN DEMO RUNNER
// ===========================

async function runAllDemos() {
  console.log("🎬 EventLite Wait Conditions Demo");
  console.log("==================================");
  console.log("This demo showcases real-world scenarios using wait conditions");
  console.log("to orchestrate complex workflows without callback hell.\n");

  try {
    await demoOrderProcessing();
    await delay(1000);
    
    await demoApprovalWorkflow();
    await delay(1000);
    
    await demoSequentialPipeline();
    await delay(1000);
    
    await demoCountBasedEvent();
    await delay(1000);
    
    await demoMonitoringTools();

    console.log("\n" + "=".repeat(60));
    console.log("🎉 ALL DEMOS COMPLETED SUCCESSFULLY!");
    console.log("=".repeat(60));
    console.log();
    console.log("Key takeaways:");
    console.log("• Wait conditions eliminate callback hell");
    console.log("• Support complex AND/OR logic combinations");
    console.log("• Enable sequential, parallel, and count-based workflows");
    console.log("• Provide comprehensive monitoring and debugging tools");
    console.log("• Maintain event sourcing integrity during replay");
    console.log();
    console.log("Check the database files to see all events stored:");
    console.log("• examples/data/wait-conditions-demo.sqlite (business data)");
    console.log("• examples/data/wait-conditions-queue.sqlite (event queue)");

  } catch (error) {
    console.error("❌ Demo failed:", error);
    process.exit(1);
  }
}

// ===========================
// 5. UTILITY FUNCTIONS
// ===========================

// Function to run a single demo by name
async function runDemo(demoName) {
  const demos = {
    'order': demoOrderProcessing,
    'approval': demoApprovalWorkflow,
    'pipeline': demoSequentialPipeline,
    'conference': demoCountBasedEvent,
    'monitoring': demoMonitoringTools,
  };

  if (demos[demoName]) {
    console.log(`Running ${demoName} demo...\n`);
    await demos[demoName]();
  } else {
    console.log("Available demos: order, approval, pipeline, conference, monitoring");
  }
}

// ===========================
// 6. COMMAND LINE INTERFACE
// ===========================

if (import.meta.main) {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    // Run all demos
    runAllDemos();
  } else {
    // Run specific demo
    runDemo(args[0]);
  }
}

// Export functions for programmatic use
export {
  demoOrderProcessing,
  demoApprovalWorkflow,
  demoSequentialPipeline,
  demoCountBasedEvent,
  demoMonitoringTools,
  runAllDemos,
  runDemo,
  eventQueue,
  orderModel,
};