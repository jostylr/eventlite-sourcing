import { initQueue } from "../lib/event-source.js";
import { EventQueryEngine } from "../lib/event-querying.js";
import { existsSync, rmSync } from "fs";

// Example: Event Querying and Relationship Analysis
// This demonstrates the new event querying capabilities for items #10-13

const dbPath = "examples/data/event-querying-demo.sqlite";

// Clean up any existing database
if (existsSync(dbPath)) {
  rmSync(dbPath);
}

console.log("🔍 EventLite Event Querying Demo");
console.log("=" .repeat(50));

// Initialize event queue
const eventQueue = initQueue({ 
  dbName: dbPath,
  init: { create: true }
});

// Initialize query engine
const queryEngine = new EventQueryEngine(dbPath);

// Create a complex event scenario: E-commerce order processing
async function createSampleEvents() {
  console.log("\n📝 Creating sample e-commerce events...");
  
  // Scenario 1: User Registration Flow
  const userCorrelation = "user-reg-001";
  
  eventQueue.store({
    cmd: "userRegistered",
    data: { userId: "user123", email: "john@example.com", name: "John Doe" },
    correlationId: userCorrelation
  });

  eventQueue.store({
    cmd: "sendWelcomeEmail",
    data: { userId: "user123", template: "welcome" },
    correlationId: userCorrelation,
    causationId: 1
  });

  eventQueue.store({
    cmd: "createUserProfile",
    data: { userId: "user123", preferences: {} },
    correlationId: userCorrelation,
    causationId: 1
  });

  eventQueue.store({
    cmd: "assignUserTier",
    data: { userId: "user123", tier: "bronze" },
    correlationId: userCorrelation,
    causationId: 1
  });

  eventQueue.store({
    cmd: "profileCreated",
    data: { userId: "user123", profileId: "prof123" },
    correlationId: userCorrelation,
    causationId: 3
  });

  // Scenario 2: Order Processing Flow
  const orderCorrelation = "order-001";
  
  eventQueue.store({
    cmd: "orderPlaced",
    data: { 
      userId: "user123", 
      orderId: "order123", 
      items: [
        { productId: "prod1", quantity: 2, price: 29.99 },
        { productId: "prod2", quantity: 1, price: 59.99 }
      ],
      total: 119.97
    },
    correlationId: orderCorrelation
  });

  eventQueue.store({
    cmd: "validateOrder",
    data: { orderId: "order123", validationRules: ["inventory", "payment", "shipping"] },
    correlationId: orderCorrelation,
    causationId: 6
  });

  eventQueue.store({
    cmd: "reserveInventory",
    data: { orderId: "order123", items: ["prod1", "prod2"] },
    correlationId: orderCorrelation,
    causationId: 6
  });

  eventQueue.store({
    cmd: "processPayment",
    data: { orderId: "order123", amount: 119.97, method: "credit_card" },
    correlationId: orderCorrelation,
    causationId: 6
  });

  // Payment processing sub-flow
  eventQueue.store({
    cmd: "paymentAuthorized",
    data: { orderId: "order123", authCode: "AUTH123", gateway: "stripe" },
    correlationId: orderCorrelation,
    causationId: 9
  });

  eventQueue.store({
    cmd: "paymentCaptured",
    data: { orderId: "order123", transactionId: "txn123" },
    correlationId: orderCorrelation,
    causationId: 10
  });

  // Inventory processing sub-flow
  eventQueue.store({
    cmd: "inventoryReserved",
    data: { orderId: "order123", reservationId: "res123" },
    correlationId: orderCorrelation,
    causationId: 8
  });

  eventQueue.store({
    cmd: "shippingLabelCreated",
    data: { orderId: "order123", trackingNumber: "TRK123" },
    correlationId: orderCorrelation,
    causationId: 12
  });

  eventQueue.store({
    cmd: "orderFulfilled",
    data: { orderId: "order123", fulfillmentCenter: "FC-WEST" },
    correlationId: orderCorrelation,
    causationId: 12
  });

  // Scenario 3: Another user registration (to demonstrate multiple root events)
  const user2Correlation = "user-reg-002";
  
  eventQueue.store({
    cmd: "userRegistered",
    data: { userId: "user456", email: "jane@example.com", name: "Jane Smith" },
    correlationId: user2Correlation
  });

  eventQueue.store({
    cmd: "sendWelcomeEmail",
    data: { userId: "user456", template: "welcome" },
    correlationId: user2Correlation,
    causationId: 15
  });

  console.log("✅ Sample events created successfully!");
}

function demonstrateRootEventDetection() {
  console.log("\n🌳 Root Event Detection (#10)");
  console.log("-".repeat(40));

  const allRoots = queryEngine.getRootEvents();
  console.log(`📊 Total root events: ${allRoots.length}`);
  allRoots.forEach(event => {
    console.log(`   • [${event.id}] ${event.cmd} (${event.correlation_id})`);
  });

  const userRegistrations = queryEngine.getRootEventsByType("userRegistered");
  console.log(`\n👥 User registration events: ${userRegistrations.length}`);
  userRegistrations.forEach(event => {
    const userData = JSON.parse(event.data);
    console.log(`   • User: ${userData.name} (${userData.email})`);
  });

  const timeRangeRoots = queryEngine.getRootEventsInTimeRange(1, 10);
  console.log(`\n⏰ Root events in range 1-10: ${timeRangeRoots.length}`);
}

function demonstrateChildEventMethods() {
  console.log("\n🌿 Enhanced Child Event Methods (#11)");
  console.log("-".repeat(40));

  // Analyze the order placement event (id: 6)
  const orderEventId = 6;
  console.log(`🛒 Analyzing order event [${orderEventId}]:`);

  const directChildren = queryEngine.getDirectChildren(orderEventId);
  console.log(`   Direct children: ${directChildren.length}`);
  directChildren.forEach(child => {
    console.log(`     → [${child.id}] ${child.cmd}`);
  });

  const allDescendants = queryEngine.getDescendantEvents(orderEventId);
  console.log(`   All descendants: ${allDescendants.length}`);
  
  const paymentChildren = queryEngine.getChildrenByType(orderEventId, "processPayment");
  console.log(`   Payment-related children: ${paymentChildren.length}`);
}

function demonstrateCousinDetection() {
  console.log("\n👨‍👩‍👧‍👦 Cousin Event Detection (#12)");
  console.log("-".repeat(40));

  // Analyze event relationships in the order correlation
  const paymentEventId = 9; // processPayment
  console.log(`💳 Analyzing payment processing event [${paymentEventId}]:`);

  const siblings = queryEngine.getSiblingEvents(paymentEventId);
  console.log(`   Sibling events: ${siblings.length}`);
  siblings.forEach(sibling => {
    console.log(`     🤝 [${sibling.id}] ${sibling.cmd}`);
  });

  const cousins = queryEngine.getCousinEvents(paymentEventId);
  console.log(`   Cousin events: ${cousins.length}`);
  cousins.forEach(cousin => {
    console.log(`     👥 [${cousin.id}] ${cousin.cmd}`);
  });

  const relatedEvents = queryEngine.getRelatedEvents(paymentEventId);
  console.log(`   All related events in correlation: ${relatedEvents.length}`);

  const eventFamily = queryEngine.getEventFamily(paymentEventId);
  console.log(`   Complete event family: ${eventFamily.length}`);
}

function demonstrateAdvancedQueries() {
  console.log("\n🔬 Advanced Event Relationship Queries (#13)");
  console.log("-".repeat(40));

  // Depth analysis
  const events = [1, 2, 5, 11, 14];
  console.log("📏 Event depth analysis:");
  events.forEach(eventId => {
    const depth = queryEngine.getEventDepth(eventId);
    console.log(`   Event [${eventId}]: depth ${depth}`);
  });

  // Event influence
  console.log("\n💪 Event influence analysis:");
  const rootEvents = queryEngine.getRootEvents();
  rootEvents.forEach(event => {
    const influence = queryEngine.getEventInfluence(event.id);
    console.log(`   [${event.id}] ${event.cmd}: influences ${influence} events`);
  });

  // Critical path analysis
  console.log("\n🎯 Critical path analysis:");
  const correlations = ["user-reg-001", "order-001", "user-reg-002"];
  correlations.forEach(corrId => {
    const criticalPath = queryEngine.getCriticalPath(corrId);
    if (criticalPath) {
      console.log(`   ${corrId}: ${criticalPath.path_length} events (${criticalPath.path})`);
    }
  });

  // Orphaned events check
  const orphaned = queryEngine.findOrphanedEvents();
  console.log(`\n🔍 Orphaned events found: ${orphaned.length}`);

  // Event branches
  console.log("\n🌲 Event branches for order-001:");
  const branches = queryEngine.getEventBranches("order-001");
  branches.slice(0, 5).forEach(branch => {
    console.log(`   Depth ${branch.branch_depth}: ${branch.branch_path}`);
  });
}

function demonstrateEventVisualization() {
  console.log("\n📊 Event Visualization and Reporting");
  console.log("-".repeat(40));

  // Generate different report formats
  console.log("📄 Text Report for User Registration:");
  const textReport = queryEngine.generateEventReport({
    correlationId: "user-reg-001",
    format: "text"
  });
  console.log(textReport.split('\n').slice(0, 15).join('\n')); // Show first 15 lines

  console.log("\n🌳 Visual Event Tree for Order Processing:");
  const visualTree = queryEngine.generateVisualEventTree("order-001");
  console.log(visualTree.split('\n').slice(0, 20).join('\n')); // Show first 20 lines

  console.log("\n📊 JSON Report Summary for Order:");
  const jsonReport = JSON.parse(queryEngine.generateEventReport({
    correlationId: "order-001",
    format: "json"
  }));
  console.log(`   Total Events: ${jsonReport.metrics.totalEvents}`);
  console.log(`   Event Types: ${Object.keys(jsonReport.metrics.eventTypeDistribution).join(', ')}`);
  console.log(`   Branch Points: ${jsonReport.relationships.branchPoints.length}`);
  console.log(`   Leaf Events: ${jsonReport.relationships.leafEvents.length}`);
}

function demonstrateRealWorldScenarios() {
  console.log("\n🏪 Real-World Event Analysis Scenarios");
  console.log("-".repeat(40));

  console.log("🔍 Scenario 1: Debug failed order processing");
  console.log("   Finding all events related to order-001:");
  const orderEvents = queryEngine.getEventsByCorrelationId("order-001");
  const failedEvents = orderEvents.filter(e => 
    e.cmd.includes('failed') || e.cmd.includes('error')
  );
  console.log(`   Total events: ${orderEvents.length}, Failed events: ${failedEvents.length}`);

  console.log("\n📈 Scenario 2: Performance analysis");
  console.log("   Events with high branching (potential bottlenecks):");
  const allEvents = queryEngine.getRootEvents();
  allEvents.forEach(event => {
    const children = queryEngine.getDirectChildren(event.id);
    if (children.length > 2) {
      console.log(`   [${event.id}] ${event.cmd}: ${children.length} immediate children`);
    }
  });

  console.log("\n🔄 Scenario 3: Event replay planning");
  console.log("   Events that would be affected by replaying order placement:");
  const replayTarget = 6; // orderPlaced
  const affectedEvents = queryEngine.getDescendantEvents(replayTarget);
  console.log(`   Replaying event ${replayTarget} would affect ${affectedEvents.length} events`);

  console.log("\n🧹 Scenario 4: Data cleanup analysis");
  console.log("   Finding event chains that can be archived:");
  const completedOrders = orderEvents.filter(e => e.cmd === 'orderFulfilled');
  completedOrders.forEach(event => {
    const relatedEvents = queryEngine.getRelatedEvents(event.id);
    console.log(`   Order completion [${event.id}] has ${relatedEvents.length + 1} related events`);
  });
}

// Run the demonstration
async function runDemo() {
  try {
    await createSampleEvents();
    
    demonstrateRootEventDetection();
    demonstrateChildEventMethods();
    demonstrateCousinDetection();
    demonstrateAdvancedQueries();
    demonstrateEventVisualization();
    demonstrateRealWorldScenarios();

    console.log("\n✨ Event querying demonstration completed!");
    console.log("🎯 Key benefits:");
    console.log("   • Deep event relationship analysis");
    console.log("   • Visual event tree representation");
    console.log("   • Comprehensive reporting in multiple formats");
    console.log("   • Performance and debugging insights");
    console.log("   • Data cleanup and archival planning");

  } catch (error) {
    console.error("❌ Demo failed:", error.message);
  } finally {
    // Cleanup
    queryEngine.close();
    eventQueue.close();
  }
}

runDemo();