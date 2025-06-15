import { expect, test, describe, beforeEach, afterEach } from "bun:test";
import { initQueue, modelSetup, eventCallbacks } from "../index.js";
import { createTestModel } from "./helpers/test-model.js";
import { Database } from "bun:sqlite";

describe("Event Versioning and Migrations", () => {
  let eventQueue;
  let model;

  beforeEach(() => {
    eventQueue = initQueue({ dbName: ":memory:", risky: true });
  });

  afterEach(() => {
    if (eventQueue.reset) {
      eventQueue.reset();
    }
  });

  test("should store events with version numbers", async () => {
    const testModel = createTestModel({ dbName: ":memory:", stub: true });

    const result = await eventQueue.store(
      {
        cmd: "testCommand",
        data: { value: 42 },
        version: 2,
      },
      testModel,
      eventCallbacks.void,
    );

    const storedEvent = eventQueue.retrieveByID(1);
    expect(storedEvent.version).toBe(2);
    expect(storedEvent.cmd).toBe("testCommand");
  });

  test("should default to version 1 if not specified", async () => {
    const testModel = createTestModel({ dbName: ":memory:", stub: true });

    await eventQueue.store(
      {
        cmd: "testCommand",
        data: { value: 42 },
      },
      testModel,
      eventCallbacks.void,
    );

    const storedEvent = eventQueue.retrieveByID(1);
    expect(storedEvent.version).toBe(1);
  });

  test("should apply migrations when executing old events", async () => {
    const model = modelSetup({
      dbName: ":memory:",
      tables(db) {
        db.query(
          "CREATE TABLE users (id INTEGER PRIMARY KEY, status TEXT)",
        ).run();
      },
      queries(db) {
        return {
          insertUser: db.query(
            "INSERT OR REPLACE INTO users (id, status) VALUES ($id, $status)",
          ),
          updateStatus: db.query(
            "UPDATE users SET status = $status WHERE id = $id",
          ),
          getUser: db.query("SELECT * FROM users WHERE id = $id"),
        };
      },
      methods(queries) {
        return {
          createUser({ userId }) {
            // First insert the user
            queries.insertUser.run({ id: userId, status: "active" });
            return { userId };
          },
          updateStatus({ userId, status }) {
            queries.updateStatus.run({ id: userId, status });
            return { userId, status };
          },
        };
      },
      migrations() {
        return {
          updateStatus: [
            // Version 1 -> Version 2: Map old status values
            (data) => {
              const statusMap = {
                inactive: "disabled",
                active: "enabled",
              };
              if (statusMap[data.status]) {
                return { ...data, status: statusMap[data.status] };
              }
              return data;
            },
            // Version 2 -> Version 3: Add metadata
            (data) => {
              return {
                ...data,
                metadata: { migrated: true, originalStatus: data.status },
              };
            },
          ],
        };
      },
    });

    // Create a user
    await eventQueue.store(
      {
        cmd: "createUser",
        data: { userId: 1 },
      },
      model,
      eventCallbacks.void,
    );

    // Store old version event
    await eventQueue.store(
      {
        cmd: "updateStatus",
        data: { userId: 1, status: "inactive" },
        version: 1,
      },
      model,
      eventCallbacks.void,
    );

    // Check that migration was applied
    const user = model._queries.getUser.get({ id: 1 });
    expect(user.status).toBe("disabled");
  });

  test("should handle multiple migration steps", async () => {
    let capturedData;

    const model = modelSetup({
      dbName: ":memory:",
      methods(queries) {
        return {
          processData(data) {
            capturedData = data;
            return { processed: true };
          },
        };
      },
      migrations() {
        return {
          processData: [
            // v1 -> v2
            (data) => ({ ...data, step1: true }),
            // v2 -> v3
            (data) => ({ ...data, step2: true }),
            // v3 -> v4
            (data) => ({ ...data, step3: true }),
          ],
        };
      },
    });

    // Execute version 1 event (should apply all 3 migrations)
    await eventQueue.store(
      {
        cmd: "processData",
        data: { original: true },
        version: 1,
      },
      model,
      eventCallbacks.void,
    );

    expect(capturedData).toEqual({
      original: true,
      step1: true,
      step2: true,
      step3: true,
    });

    // Execute version 3 event (should only apply last migration)
    await eventQueue.store(
      {
        cmd: "processData",
        data: { original: true },
        version: 3,
      },
      model,
      eventCallbacks.void,
    );

    expect(capturedData).toEqual({
      original: true,
      step3: true,
    });
  });

  test("should handle events without migrations", async () => {
    const model = modelSetup({
      dbName: ":memory:",
      methods() {
        return {
          noMigration(data) {
            return { ...data, processed: true };
          },
        };
      },
    });

    const result = await eventQueue.store(
      {
        cmd: "noMigration",
        data: { value: 42 },
        version: 1,
      },
      model,
      eventCallbacks.void,
    );

    expect(result).toEqual({ value: 42, processed: true });
  });

  test("should preserve version information during replay", async () => {
    const events = [];

    const model = modelSetup({
      dbName: ":memory:",
      methods() {
        return {
          trackVersion(data, metadata) {
            events.push({ data, version: metadata.version });
            return { tracked: true };
          },
        };
      },
    });

    // Store events with different versions
    await eventQueue.store(
      { cmd: "trackVersion", data: { id: 1 }, version: 1 },
      model,
      eventCallbacks.void,
    );

    await eventQueue.store(
      { cmd: "trackVersion", data: { id: 2 }, version: 2 },
      model,
      eventCallbacks.void,
    );

    await eventQueue.store(
      { cmd: "trackVersion", data: { id: 3 }, version: 3 },
      model,
      eventCallbacks.void,
    );

    // Clear and replay
    events.length = 0;
    const freshModel = modelSetup({
      dbName: ":memory:",
      methods() {
        return {
          trackVersion(data, metadata) {
            events.push({ data, version: metadata.version });
            return { tracked: true };
          },
        };
      },
    });

    eventQueue.cycleThrough(freshModel, () => {}, eventCallbacks.void, {
      start: 0,
    });

    expect(events).toHaveLength(3);
    expect(events[0]).toEqual({ data: { id: 1 }, version: 1 });
    expect(events[1]).toEqual({ data: { id: 2 }, version: 2 });
    expect(events[2]).toEqual({ data: { id: 3 }, version: 3 });
  });

  test("should handle migration errors gracefully", async () => {
    const errors = [];

    const model = modelSetup({
      dbName: ":memory:",
      methods() {
        return {
          faultyMigration(data) {
            return { processed: true };
          },
        };
      },
      migrations() {
        return {
          faultyMigration: [
            (data) => {
              throw new Error("Migration failed");
            },
          ],
        };
      },
    });

    await eventQueue.store(
      {
        cmd: "faultyMigration",
        data: { value: 42 },
        version: 1,
      },
      model,
      {
        _default: () => {},
        _error: (err) => {
          errors.push(err);
        },
      },
    );

    expect(errors).toHaveLength(1);
    expect(errors[0].error.message).toContain("Migration failed");
  });
});
