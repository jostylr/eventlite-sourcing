import { initQueue, modelSetup, eventCallbacks } from "../index.js";

// Example: Municipal Rule Tracking System
// Demonstrates complex correlation and causation patterns for tracking rule changes

const eventQueue = initQueue({
  dbName: "data/rule-tracking.sqlite",
  reset: true, // Clear for demo
});

const ruleModel = modelSetup({
  dbName: "data/rules.sqlite",
  reset: ["delete"], // Start fresh for demo

  tables(db) {
    // Current state of rules
    db.query(
      `
      CREATE TABLE rules (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        version INTEGER DEFAULT 1,
        status TEXT DEFAULT 'active',
        effective_date INTEGER,
        created_at INTEGER,
        updated_at INTEGER
      )
    `,
    ).run();

    // Agenda items for proposed changes
    db.query(
      `
      CREATE TABLE agenda_items (
        id TEXT PRIMARY KEY,
        meeting_id TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        status TEXT DEFAULT 'pending',
        created_at INTEGER
      )
    `,
    ).run();

    // Motions on agenda items
    db.query(
      `
      CREATE TABLE motions (
        id TEXT PRIMARY KEY,
        agenda_item_id TEXT NOT NULL,
        type TEXT NOT NULL, -- 'approve', 'reject', 'table', 'amend'
        vote_count TEXT, -- JSON: {for: 5, against: 2, abstain: 1}
        passed BOOLEAN,
        timestamp INTEGER,
        FOREIGN KEY (agenda_item_id) REFERENCES agenda_items(id)
      )
    `,
    ).run();

    // Track which rules are affected by which agenda items
    db.query(
      `
      CREATE TABLE rule_agenda_links (
        rule_id TEXT NOT NULL,
        agenda_item_id TEXT NOT NULL,
        change_type TEXT NOT NULL, -- 'modify', 'repeal', 'supersede'
        PRIMARY KEY (rule_id, agenda_item_id)
      )
    `,
    ).run();
  },

  queries(db) {
    return {
      // Rules
      createRule: db.query(
        "INSERT INTO rules (id, title, content, version, created_at, updated_at) VALUES ($id, $title, $content, $version, $createdAt, $updatedAt)",
      ),
      updateRule: db.query(
        "UPDATE rules SET content = $content, version = version + 1, updated_at = $updatedAt WHERE id = $id",
      ),
      getRule: db.query("SELECT * FROM rules WHERE id = $id"),

      // Agenda items
      createAgendaItem: db.query(
        "INSERT INTO agenda_items (id, meeting_id, title, description, created_at) VALUES ($id, $meetingId, $title, $description, $createdAt)",
      ),
      updateAgendaStatus: db.query(
        "UPDATE agenda_items SET status = $status WHERE id = $id",
      ),

      // Motions
      recordMotion: db.query(
        "INSERT INTO motions (id, agenda_item_id, type, vote_count, passed, timestamp) VALUES ($id, $agendaItemId, $type, $voteCount, $passed, $timestamp)",
      ),

      // Links
      linkRuleToAgenda: db.query(
        "INSERT INTO rule_agenda_links (rule_id, agenda_item_id, change_type) VALUES ($ruleId, $agendaItemId, $changeType)",
      ),
      getLinkedRules: db.query(
        "SELECT rule_id, change_type FROM rule_agenda_links WHERE agenda_item_id = $agendaItemId",
      ),
    };
  },

  methods(queries) {
    return {
      // Create a new rule
      createRule({ ruleId, title, content }, metadata) {
        queries.createRule.run({
          id: ruleId,
          title,
          content,
          version: 1,
          createdAt: metadata.datetime,
          updatedAt: metadata.datetime,
        });
        return { ruleId, title };
      },

      // Handle relationship creation (stub for now)
      createRuleRelationship(data, metadata) {
        // In a real implementation, this would store the relationship
        console.log(
          `  ✓ Recorded relationship: ${data.newRuleId} ${data.type} ${data.oldRuleId}`,
        );
        return data;
      },

      // Create an agenda item proposing rule changes
      proposeRuleChange(
        { agendaItemId, meetingId, title, description, affectedRules },
        metadata,
      ) {
        // Create the agenda item
        queries.createAgendaItem.run({
          id: agendaItemId,
          meetingId,
          title,
          description,
          createdAt: metadata.datetime,
        });

        // Link affected rules
        for (const rule of affectedRules) {
          queries.linkRuleToAgenda.run({
            ruleId: rule.ruleId,
            agendaItemId,
            changeType: rule.changeType,
          });
        }

        return { agendaItemId, affectedRules };
      },

      // Record a motion on an agenda item
      recordMotion({ motionId, agendaItemId, type, votes, passed }, metadata) {
        queries.recordMotion.run({
          id: motionId,
          agendaItemId,
          type,
          voteCount: JSON.stringify(votes),
          passed,
          timestamp: metadata.datetime,
        });

        // Update agenda item status
        if (passed && type === "approve") {
          queries.updateAgendaStatus.run({
            id: agendaItemId,
            status: "approved",
          });
        } else if (!passed || type === "reject") {
          queries.updateAgendaStatus.run({
            id: agendaItemId,
            status: "rejected",
          });
        }

        return { motionId, agendaItemId, passed };
      },

      // Apply approved changes to rules
      applyRuleChanges({ agendaItemId, changes }, metadata) {
        const linkedRules = queries.getLinkedRules.all({ agendaItemId });
        const results = [];

        for (const link of linkedRules) {
          const change = changes.find((c) => c.ruleId === link.rule_id);
          if (change && link.change_type === "modify") {
            queries.updateRule.run({
              id: change.ruleId,
              content: change.newContent,
              updatedAt: metadata.datetime,
            });
            results.push({ ruleId: change.ruleId, updated: true });
          }
        }

        return { agendaItemId, results };
      },
    };
  },
});

// Demonstration
async function demo() {
  console.log("=== Rule Tracking with Complex Relationships Demo ===\n");

  // 1. Create some initial rules
  console.log("1. Creating initial rules...");

  const parkingRuleResult = await eventQueue.store(
    {
      cmd: "createRule",
      data: {
        ruleId: "RULE-001",
        title: "Parking Restrictions",
        content: "No parking on Main Street from 2-4 AM for street cleaning.",
      },
    },
    ruleModel,
    eventCallbacks.void,
  );

  const noiseRuleResult = await eventQueue.store(
    {
      cmd: "createRule",
      data: {
        ruleId: "RULE-002",
        title: "Noise Ordinance",
        content:
          "Quiet hours are from 10 PM to 7 AM. Maximum 65 dB during day.",
      },
    },
    ruleModel,
    eventCallbacks.void,
  );

  console.log("✓ Created initial rules\n");

  // 2. Create an agenda item that affects MULTIPLE rules
  console.log("2. Creating agenda item affecting multiple rules...");

  // This demonstrates the need for multiple correlations - one agenda item affects multiple rules
  const agendaEvent = await eventQueue.store(
    {
      cmd: "proposeRuleChange",
      data: {
        agendaItemId: "AGENDA-001",
        meetingId: "MEETING-2024-01",
        title: "Update parking and noise rules for downtown events",
        description:
          "Modify parking and noise rules to accommodate downtown festivals",
        affectedRules: [
          { ruleId: "RULE-001", changeType: "modify" },
          { ruleId: "RULE-002", changeType: "modify" },
        ],
      },
      metadata: {
        author: "City Council Member Smith",
        reason: "Community feedback from last summer events",
      },
    },
    ruleModel,
    eventCallbacks.void,
  );

  // Get the stored event to access its correlation ID
  const agendaEventRow = eventQueue.retrieveByID(
    eventQueue._queries.getLastRow.get().id,
  );
  const agendaCorrelationId = agendaEventRow.correlation_id;
  console.log(
    `✓ Agenda item created with correlation ID: ${agendaCorrelationId}\n`,
  );

  // 3. Record the motion (caused by the agenda item)
  console.log("3. Recording motion on agenda item...");

  const motionResult = await eventQueue.store(
    {
      cmd: "recordMotion",
      data: {
        motionId: "MOTION-001",
        agendaItemId: "AGENDA-001",
        type: "approve",
        votes: { for: 7, against: 2, abstain: 1 },
        passed: true,
      },
      correlationId: agendaCorrelationId, // Same business transaction
      causationId: agendaEventRow.id, // Caused by the agenda item
      metadata: {
        meetingMinutesUrl: "https://city.gov/minutes/2024-01-15",
      },
    },
    ruleModel,
    eventCallbacks.void,
  );

  const motionEventRow = eventQueue.retrieveByID(
    eventQueue._queries.getLastRow.get().id,
  );

  console.log("✓ Motion passed\n");

  // 4. Apply the rule changes (caused by the motion)
  console.log("4. Applying approved rule changes...");

  // This event has MULTIPLE conceptual parents:
  // - The motion that approved it
  // - The original rules being modified
  // We use causationId for the direct cause (motion) and metadata for additional relationships
  const parkingRuleRow = eventQueue.retrieveByID(
    eventQueue._queries.getLastRow.get().id - 3,
  );
  const noiseRuleRow = eventQueue.retrieveByID(
    eventQueue._queries.getLastRow.get().id - 2,
  );

  const changesResult = await eventQueue.store(
    {
      cmd: "applyRuleChanges",
      data: {
        agendaItemId: "AGENDA-001",
        changes: [
          {
            ruleId: "RULE-001",
            newContent:
              "No parking on Main Street from 2-4 AM for street cleaning, except during approved downtown events.",
          },
          {
            ruleId: "RULE-002",
            newContent:
              "Quiet hours are from 10 PM to 7 AM. Maximum 65 dB during day, 75 dB during approved events.",
          },
        ],
      },
      correlationId: agendaCorrelationId, // Same business transaction
      causationId: motionEventRow.id, // Caused by the motion
      metadata: {
        originalRuleEvents: [parkingRuleRow.id, noiseRuleRow.id], // References to original rule creation
        implementationDate: "2024-02-01",
        affectedRuleCount: 2,
      },
    },
    ruleModel,
    eventCallbacks.void,
  );

  const changesEventRow = eventQueue.retrieveByID(
    eventQueue._queries.getLastRow.get().id,
  );

  console.log("✓ Rule changes applied\n");

  // 5. Demonstrate querying relationships
  console.log("5. Exploring event relationships...\n");

  // Get all events in this transaction
  const transaction = eventQueue.getTransaction(agendaCorrelationId);
  console.log(`Events in agenda transaction: ${transaction.length}`);
  transaction.forEach((event) => {
    console.log(
      `  - ${event.cmd}: ${event.data.title || event.data.motionId || "changes applied"}`,
    );
  });

  // Show the causation chain
  console.log("\nCausation chain:");
  console.log(`  1. ${agendaEventRow.cmd} (ID: ${agendaEventRow.id})`);
  console.log(
    `  2. ${motionEventRow.cmd} (ID: ${motionEventRow.id}) <- caused by agenda`,
  );
  console.log(
    `  3. ${changesEventRow.cmd} (ID: ${changesEventRow.id}) <- caused by motion`,
  );
  console.log(
    `     - Also relates to original rules: ${changesEventRow.metadata.originalRuleEvents.join(", ")}`,
  );

  // 6. Create another rule that supersedes an existing one
  console.log("\n6. Creating a superseding rule with complex relationships...");

  // First, create an agenda item for the new rule
  const newAgendaResult = await eventQueue.store(
    {
      cmd: "proposeRuleChange",
      data: {
        agendaItemId: "AGENDA-002",
        meetingId: "MEETING-2024-02",
        title: "Comprehensive Parking Reform",
        description: "New parking rule to replace existing one",
        affectedRules: [{ ruleId: "RULE-001", changeType: "supersede" }],
      },
    },
    ruleModel,
    eventCallbacks.void,
  );

  const newAgendaEventRow = eventQueue.retrieveByID(
    eventQueue._queries.getLastRow.get().id,
  );
  const newAgendaCorrelationId = newAgendaEventRow.correlation_id;

  // Approve it
  await eventQueue.store(
    {
      cmd: "recordMotion",
      data: {
        motionId: "MOTION-002",
        agendaItemId: "AGENDA-002",
        type: "approve",
        votes: { for: 9, against: 1, abstain: 0 },
        passed: true,
      },
      correlationId: newAgendaCorrelationId,
      causationId: newAgendaEventRow.id,
    },
    ruleModel,
    eventCallbacks.void,
  );

  // Create the new rule that supersedes the old one
  const newRuleResult = await eventQueue.store(
    {
      cmd: "createRule",
      data: {
        ruleId: "RULE-003",
        title: "Comprehensive Parking Regulations",
        content:
          "Complete parking regulations including residential, commercial, and event provisions...",
      },
      correlationId: newAgendaCorrelationId,
      metadata: {
        supersedes: ["RULE-001"],
        previousVersionEvents: [parkingRuleRow.id, changesEventRow.id], // Full history
        effectiveDate: "2024-03-01",
      },
    },
    ruleModel,
    eventCallbacks.void,
  );

  const newRuleEventRow = eventQueue.retrieveByID(
    eventQueue._queries.getLastRow.get().id,
  );

  console.log("✓ New superseding rule created\n");

  // 7. Show patterns for handling multiple parents/correlations
  console.log("7. Patterns for complex relationships:\n");

  console.log("Pattern 1: Use metadata for additional relationships");
  console.log(
    `  - Rule ${newRuleEventRow.data.ruleId} supersedes: ${JSON.stringify(newRuleEventRow.metadata.supersedes)}`,
  );
  console.log(
    `  - Previous version events: ${JSON.stringify(newRuleEventRow.metadata.previousVersionEvents)}`,
  );

  console.log("\nPattern 2: Create explicit relationship events");
  await eventQueue.store(
    {
      cmd: "createRuleRelationship",
      data: {
        type: "supersedes",
        newRuleId: "RULE-003",
        oldRuleId: "RULE-001",
        effectiveDate: "2024-03-01",
      },
      correlationId: newAgendaCorrelationId,
      metadata: {
        relatedEvents: [newRuleEventRow.id, parkingRuleRow.id],
      },
    },
    ruleModel,
    eventCallbacks.void,
  );

  console.log("\nPattern 3: Use domain-specific correlation IDs");
  console.log("  - Transaction correlation: " + agendaCorrelationId);
  console.log("  - Could also store rule-specific correlation in metadata");
  console.log('  - Example: metadata.ruleCorrelationId = "RULE-001-history"');

  console.log("\n=== Summary of Patterns ===\n");
  console.log(
    "1. Use correlationId for business transaction (e.g., agenda item lifecycle)",
  );
  console.log(
    "2. Use causationId for direct causation (what triggered this event)",
  );
  console.log("3. Use metadata.originalEvents for multiple parent references");
  console.log("4. Use metadata.relatedRules for domain-specific relationships");
  console.log(
    "5. Consider creating explicit relationship events for complex scenarios",
  );
  console.log("6. Store multiple correlation IDs in metadata when needed");

  console.log("\n=== Demo Complete ===");
}

// Run the demo
demo().catch(console.error);
