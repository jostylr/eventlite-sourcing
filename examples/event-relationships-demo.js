import { initQueue, eventCallbacks } from "../lib/event-source.js";
import { modelSetup } from "../lib/model.js";
import { EventQueryEngine } from "../lib/event-querying.js";
import { existsSync, rmSync } from "fs";

// Demo: Event Relationship Querying (TODO items #10-13)
// This demonstrates the new event querying capabilities

const dbPath = "examples/data/relationships-demo.sqlite";

// Clean up any existing database
if (existsSync(dbPath)) {
  rmSync(dbPath);
}

console.log("🔍 Event Relationship Querying Demo");
console.log("=" .repeat(50));

// Initialize event queue
const evQ = initQueue({ dbName: dbPath });

// Simple model for this demo
const model = modelSetup({
  dbName: dbPath,
  tables: () => {},
  queries: () => ({}),
  methods: () => ({})
});

// Initialize query engine
const queryEngine = new EventQueryEngine(dbPath);

// Simple callback
const cb = {
  _default(res, row) {
    // Just log that event was processed
    console.log(`Event ${row.id}: ${row.cmd}`);
  },
  _error({msg}) {
    console.error("Error:", msg);
  }
};

function createSampleEventStructure() {
  console.log("\n📝 Creating sample event structure...");

  // Scenario 1: User Registration Flow (correlation: user-reg-001)
  evQ.store({ cmd: "userRegistered", data: { userId: "user123" }, correlationId: "user-reg-001" }, model, cb);
  
  // Child events of user registration
  evQ.store({ cmd: "sendWelcomeEmail", data: { userId: "user123" }, correlationId: "user-reg-001", causationId: 1 }, model, cb);
  evQ.store({ cmd: "createProfile", data: { userId: "user123" }, correlationId: "user-reg-001", causationId: 1 }, model, cb);
  evQ.store({ cmd: "assignTier", data: { userId: "user123", tier: "bronze" }, correlationId: "user-reg-001", causationId: 1 }, model, cb);
  
  // Grandchild event
  evQ.store({ cmd: "profileCreated", data: { userId: "user123", profileId: "prof123" }, correlationId: "user-reg-001", causationId: 3 }, model, cb);

  // Scenario 2: Order Processing Flow (correlation: order-001)
  evQ.store({ cmd: "orderPlaced", data: { orderId: "order123", amount: 100 }, correlationId: "order-001" }, model, cb);
  
  // Multiple child events from order (creating branches)
  evQ.store({ cmd: "validateOrder", data: { orderId: "order123" }, correlationId: "order-001", causationId: 6 }, model, cb);
  evQ.store({ cmd: "processPayment", data: { orderId: "order123", amount: 100 }, correlationId: "order-001", causationId: 6 }, model, cb);
  evQ.store({ cmd: "reserveInventory", data: { orderId: "order123" }, correlationId: "order-001", causationId: 6 }, model, cb);
  
  // Further descendants
  evQ.store({ cmd: "paymentApproved", data: { orderId: "order123" }, correlationId: "order-001", causationId: 8 }, model, cb);
  evQ.store({ cmd: "inventoryReserved", data: { orderId: "order123" }, correlationId: "order-001", causationId: 9 }, model, cb);

  // Scenario 3: Another user registration
  evQ.store({ cmd: "userRegistered", data: { userId: "user456" }, correlationId: "user-reg-002" }, model, cb);
}

function demonstrateRootEventDetection() {
  console.log("\n🌳 Root Event Detection (#10)");
  console.log("-".repeat(40));

  const allRoots = queryEngine.getRootEvents();
  console.log(`📊 Found ${allRoots.length} root events:`);
  allRoots.forEach(event => {
    console.log(`   • [${event.id}] ${event.cmd} (${event.correlation_id})`);
  });

  const userRegistrations = queryEngine.getRootEventsByType("userRegistered");
  console.log(`\n👥 User registration events: ${userRegistrations.length}`);
  
  const timeRangeRoots = queryEngine.getRootEventsInTimeRange(1, 8);
  console.log(`⏰ Root events in range 1-8: ${timeRangeRoots.length}`);
}

function demonstrateChildEventMethods() {
  console.log("\n🌿 Enhanced Child Event Methods (#11)");
  console.log("-".repeat(40));

  // Analyze user registration event (id: 1)
  console.log("👤 User Registration Event [1] children:");
  const directChildren = queryEngine.getDirectChildren(1);
  directChildren.forEach(child => {
    console.log(`   → [${child.id}] ${child.cmd}`);
  });

  const allDescendants = queryEngine.getDescendantEvents(1);
  console.log(`   Total descendants: ${allDescendants.length}`);

  // Analyze order placement event (id: 6)
  console.log("\n🛒 Order Placement Event [6] children:");
  const orderChildren = queryEngine.getDirectChildren(6);
  orderChildren.forEach(child => {
    console.log(`   → [${child.id}] ${child.cmd}`);
  });
}

function demonstrateCousinDetection() {
  console.log("\n👨‍👩‍👧‍👦 Cousin Event Detection (#12)");
  console.log("-".repeat(40));

  // Analyze siblings of sendWelcomeEmail (event 2)
  console.log("📧 Siblings of sendWelcomeEmail [2]:");
  const siblings = queryEngine.getSiblingEvents(2);
  siblings.forEach(sibling => {
    console.log(`   🤝 [${sibling.id}] ${sibling.cmd}`);
  });

  // Analyze cousins in order processing 
  console.log("\n💳 Cousins of processPayment [8]:");
  const cousins = queryEngine.getCousinEvents(8);
  cousins.forEach(cousin => {
    console.log(`   👥 [${cousin.id}] ${cousin.cmd}`);
  });

  // Show all related events in user registration
  console.log("\n👤 All events related to user registration:");
  const related = queryEngine.getRelatedEvents(1);
  console.log(`   Found ${related.length} related events`);
}

function demonstrateAdvancedQueries() {
  console.log("\n🔬 Advanced Event Relationship Queries (#13)");
  console.log("-".repeat(40));

  // Event depth analysis
  console.log("📏 Event depth analysis:");
  [1, 2, 5, 6, 10].forEach(eventId => {
    const depth = queryEngine.getEventDepth(eventId);
    console.log(`   Event [${eventId}]: depth ${depth}`);
  });

  // Event influence
  console.log("\n💪 Event influence (descendant count):");
  [1, 6].forEach(eventId => {
    const influence = queryEngine.getEventInfluence(eventId);
    console.log(`   Event [${eventId}]: influences ${influence} events`);
  });

  // Critical path analysis
  console.log("\n🎯 Critical paths:");
  ["user-reg-001", "order-001"].forEach(corrId => {
    const criticalPath = queryEngine.getCriticalPath(corrId);
    if (criticalPath) {
      console.log(`   ${corrId}: ${criticalPath.path_length} events (${criticalPath.path})`);
    }
  });

  // Orphaned events (should be none in our clean demo)
  const orphaned = queryEngine.findOrphanedEvents();
  console.log(`\n🔍 Orphaned events: ${orphaned.length}`);
}

function demonstrateEventVisualization() {
  console.log("\n📊 Event Visualization and Reporting");
  console.log("-".repeat(40));

  // Generate a text report for user registration
  console.log("📄 User Registration Report:");
  const report = queryEngine.generateEventReport({
    correlationId: "user-reg-001",
    format: "text"
  });
  
  // Show first 10 lines of the report
  const reportLines = report.split('\n');
  reportLines.slice(0, 15).forEach(line => console.log(line));
  
  console.log("\n🌳 Order Processing Event Tree:");
  const tree = queryEngine.generateVisualEventTree("order-001");
  console.log(tree);

  // JSON report summary
  console.log("📊 Order Processing Summary:");
  const jsonReport = JSON.parse(queryEngine.generateEventReport({
    correlationId: "order-001", 
    format: "json"
  }));
  console.log(`   • Total Events: ${jsonReport.metrics.totalEvents}`);
  console.log(`   • Branch Points: ${jsonReport.relationships.branchPoints.length}`);
  console.log(`   • Leaf Events: ${jsonReport.relationships.leafEvents.length}`);
}

function demonstrateRealWorldUseCases() {
  console.log("\n🏪 Real-World Use Cases");
  console.log("-".repeat(40));

  console.log("🔍 Use Case 1: Debug complex workflows");
  console.log("   Finding all events in a transaction:");
  const orderEvents = queryEngine.getEventsByCorrelationId("order-001");
  console.log(`   → ${orderEvents.length} events in order-001 transaction`);

  console.log("\n📈 Use Case 2: Performance analysis");
  console.log("   Events that create multiple branches:");
  const rootEvents = queryEngine.getRootEvents();
  rootEvents.forEach(event => {
    const children = queryEngine.getDirectChildren(event.id);
    if (children.length > 2) {
      console.log(`   → Event [${event.id}] ${event.cmd} has ${children.length} immediate children`);
    }
  });

  console.log("\n🔄 Use Case 3: Event replay impact analysis");
  console.log("   Effects of replaying order placement:");
  const descendants = queryEngine.getDescendantEvents(6);
  console.log(`   → Replaying event 6 would affect ${descendants.length} downstream events`);

  console.log("\n🧹 Use Case 4: Data lifecycle management");
  console.log("   Complete event families for archival:");
  [1, 6].forEach(eventId => {
    const family = queryEngine.getEventFamily(eventId);
    console.log(`   → Event [${eventId}] family contains ${family.length} related events`);
  });
}

// Run the demo
function runDemo() {
  try {
    createSampleEventStructure();
    
    console.log("\n✅ Event structure created successfully!");
    
    demonstrateRootEventDetection();
    demonstrateChildEventMethods();
    demonstrateCousinDetection();
    demonstrateAdvancedQueries();
    demonstrateEventVisualization();
    demonstrateRealWorldUseCases();

    console.log("\n✨ Event relationship querying demo completed!");
    console.log("\n🎯 Implemented TODO items:");
    console.log("   ✅ #10: Root Event Detection");
    console.log("   ✅ #11: Enhanced Child Event Methods");
    console.log("   ✅ #12: Cousin Event Detection");
    console.log("   ✅ #13: Advanced Event Relationship Queries");
    console.log("   ✅ Bonus: Event Visualization & Reporting");

    console.log("\n💡 Key Features Demonstrated:");
    console.log("   • Deep event relationship analysis");
    console.log("   • Visual event tree representation");
    console.log("   • Multi-format reporting (text, JSON, markdown)");
    console.log("   • Performance and debugging insights");
    console.log("   • Real-world use case examples");

  } catch (error) {
    console.error("❌ Demo failed:", error.message);
    console.error("Stack:", error.stack);
  } finally {
    // Cleanup
    queryEngine.close();
    console.log("\n🧹 Demo cleanup completed");
  }
}

runDemo();