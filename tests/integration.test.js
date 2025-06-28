import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { initQueue, eventCallbacks, modelSetup } from "../index.js";
import { existsSync, rmSync, mkdirSync } from "fs";
import { join, dirname } from "path";

describe("Event Sourcing Integration Tests", () => {
  const testEventDbPath = join(
    "tests",
    "data",
    "test-integration-events.sqlite",
  );
  const testModelDbPath = join(
    "tests",
    "data",
    "test-integration-model.sqlite",
  );
  let queue;
  let model;

  beforeEach(() => {
    // Ensure the data directory exists
    const dataDir = dirname(testEventDbPath);
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true });
    }

    // Clean up any existing test databases
    if (existsSync(testEventDbPath)) {
      rmSync(testEventDbPath);
    }
    if (existsSync(testModelDbPath)) {
      rmSync(testModelDbPath);
    }
  });

  afterEach(() => {
    // Clean up test databases after each test
    if (existsSync(testEventDbPath)) {
      rmSync(testEventDbPath);
    }
    if (existsSync(testModelDbPath)) {
      rmSync(testModelDbPath);
    }
  });

  describe("Basic event sourcing workflow", () => {
    test("should store and replay events to rebuild state", () => {
      // Initialize event queue
      queue = initQueue({
        dbName: testEventDbPath,
        risky: true,
      });

      // Initialize model
      model = modelSetup({
        dbName: testModelDbPath,
        tables: (db) => {
          db.query(
            "CREATE TABLE accounts (id TEXT PRIMARY KEY, balance REAL)",
          ).run();
          db.query(
            "CREATE TABLE transactions (id INTEGER PRIMARY KEY AUTOINCREMENT, account_id TEXT, amount REAL, type TEXT, timestamp INTEGER)",
          ).run();
        },
        queries: (db) => ({
          createAccount: db.query(
            "INSERT INTO accounts (id, balance) VALUES ($id, $balance)",
          ),
          updateBalance: db.query(
            "UPDATE accounts SET balance = $balance WHERE id = $id",
          ),
          getAccount: db.query("SELECT * FROM accounts WHERE id = $id"),
          addTransaction: db.query(
            "INSERT INTO transactions (account_id, amount, type, timestamp) VALUES ($account_id, $amount, $type, $timestamp)",
          ),
        }),
        methods: (queries) => ({
          createAccount: ({ accountId, initialBalance = 0 }, meta) => {
            queries.createAccount.run({
              id: accountId,
              balance: initialBalance,
            });
            queries.addTransaction.run({
              account_id: accountId,
              amount: initialBalance,
              type: "initial",
              timestamp: meta.datetime,
            });
            return { accountId, balance: initialBalance };
          },
          deposit: ({ accountId, amount }, meta) => {
            const account = queries.getAccount.get({ id: accountId });
            if (!account) throw new Error(`Account ${accountId} not found`);

            const newBalance = account.balance + amount;
            queries.updateBalance.run({ id: accountId, balance: newBalance });
            queries.addTransaction.run({
              account_id: accountId,
              amount: amount,
              type: "deposit",
              timestamp: meta.datetime,
            });
            return { accountId, balance: newBalance };
          },
          withdraw: ({ accountId, amount }, meta) => {
            const account = queries.getAccount.get({ id: accountId });
            if (!account) throw new Error(`Account ${accountId} not found`);
            if (account.balance < amount) throw new Error(`Insufficient funds`);

            const newBalance = account.balance - amount;
            queries.updateBalance.run({ id: accountId, balance: newBalance });
            queries.addTransaction.run({
              account_id: accountId,
              amount: -amount,
              type: "withdrawal",
              timestamp: meta.datetime,
            });
            return { accountId, balance: newBalance };
          },
        }),
        default: () => "", // Silent default for unknown commands
      });

      // Set up callbacks
      const results = [];
      const cb = {
        _default: (res, row) => {
          results.push({ cmd: row.cmd, result: res });
        },
        _error: (err) => {
          results.push({ error: err.msg });
        },
      };

      // Execute a series of commands
      queue.store(
        {
          cmd: "createAccount",
          data: { accountId: "acc1", initialBalance: 1000 },
        },
        model,
        cb,
      );
      queue.store(
        { cmd: "deposit", data: { accountId: "acc1", amount: 500 } },
        model,
        cb,
      );
      queue.store(
        { cmd: "withdraw", data: { accountId: "acc1", amount: 200 } },
        model,
        cb,
      );

      // Verify results
      expect(results).toHaveLength(3);
      expect(results[0].result.balance).toBe(1000);
      expect(results[1].result.balance).toBe(1500);
      expect(results[2].result.balance).toBe(1300);

      // Verify final state
      const finalAccount = model.get("getAccount", { id: "acc1" });
      expect(finalAccount.balance).toBe(1300);
    });

    test("should rebuild state from events", () => {
      // Initialize event queue
      queue = initQueue({
        dbName: testEventDbPath,
      });

      // Initialize first model instance
      let model1 = modelSetup({
        dbName: testModelDbPath,
        tables: (db) => {
          db.query(
            "CREATE TABLE items (id TEXT PRIMARY KEY, quantity INTEGER)",
          ).run();
        },
        queries: (db) => ({
          upsert: db.query(
            "INSERT INTO items (id, quantity) VALUES ($id, $quantity) ON CONFLICT(id) DO UPDATE SET quantity = excluded.quantity",
          ),
          get: db.query("SELECT * FROM items WHERE id = $id"),
        }),
        methods: (queries) => ({
          setQuantity: ({ itemId, quantity }) => {
            queries.upsert.run({ id: itemId, quantity });
            return { itemId, quantity };
          },
          addQuantity: ({ itemId, amount }) => {
            const item = queries.get.get({ id: itemId });
            const newQuantity = (item?.quantity || 0) + amount;
            queries.upsert.run({ id: itemId, quantity: newQuantity });
            return { itemId, quantity: newQuantity };
          },
        }),
        default: () => "", // Silent default for unknown commands
      });

      const cb = eventCallbacks.void;

      // Store some events
      queue.store(
        { cmd: "setQuantity", data: { itemId: "item1", quantity: 10 } },
        model1,
        cb,
      );
      queue.store(
        { cmd: "addQuantity", data: { itemId: "item1", amount: 5 } },
        model1,
        cb,
      );
      queue.store(
        { cmd: "setQuantity", data: { itemId: "item2", quantity: 20 } },
        model1,
        cb,
      );
      queue.store(
        { cmd: "addQuantity", data: { itemId: "item1", amount: -3 } },
        model1,
        cb,
      );

      // Close the first model
      model1._db.close();

      // Create a fresh model (simulating application restart)
      let model2 = modelSetup({
        dbName: testModelDbPath,
        reset: [""], // Delete the existing model
        tables: (db) => {
          db.query(
            "CREATE TABLE items (id TEXT PRIMARY KEY, quantity INTEGER)",
          ).run();
        },
        queries: (db) => ({
          upsert: db.query(
            "INSERT INTO items (id, quantity) VALUES ($id, $quantity) ON CONFLICT(id) DO UPDATE SET quantity = excluded.quantity",
          ),
          get: db.query("SELECT * FROM items WHERE id = $id"),
          getAll: db.query("SELECT * FROM items ORDER BY id"),
        }),
        methods: (queries) => ({
          setQuantity: ({ itemId, quantity }) => {
            queries.upsert.run({ id: itemId, quantity });
            return { itemId, quantity };
          },
          addQuantity: ({ itemId, amount }) => {
            const item = queries.get.get({ id: itemId });
            const newQuantity = (item?.quantity || 0) + amount;
            queries.upsert.run({ id: itemId, quantity: newQuantity });
            return { itemId, quantity: newQuantity };
          },
        }),
        default: () => "", // Silent default for unknown commands
      });

      // Replay all events
      queue.cycleThrough(model2, () => {}, eventCallbacks.void, { start: 0 });

      // Verify the rebuilt state
      const item1 = model2.get("get", { id: "item1" });
      const item2 = model2.get("get", { id: "item2" });

      expect(item1?.quantity).toBe(12); // 10 + 5 - 3
      expect(item2?.quantity).toBe(20);
    });
  });

  describe("Error handling in integration", () => {
    test("should handle and record errors during command execution", () => {
      queue = initQueue({
        dbName: testEventDbPath,
      });

      model = modelSetup({
        dbName: testModelDbPath,
        tables: (db) => {
          db.query(
            "CREATE TABLE data (id INTEGER PRIMARY KEY, value TEXT)",
          ).run();
        },
        queries: (db) => ({
          insert: db.query("INSERT INTO data (value) VALUES ($value)"),
        }),
        methods: (queries) => ({
          safeCommand: ({ value }) => {
            queries.insert.run({ value });
            return "success";
          },
          errorCommand: ({ shouldFail }) => {
            if (shouldFail) {
              throw new Error("Command failed as requested");
            }
            return "success";
          },
        }),
        default: () => "", // Silent default for unknown commands
      });

      const errors = [];
      const results = [];
      const cb = {
        _default: (res, row) => {
          results.push(res);
        },
        _error: (err) => {
          errors.push(err);
        },
      };

      // Execute commands
      queue.store({ cmd: "safeCommand", data: { value: "test1" } }, model, cb);
      queue.store(
        { cmd: "errorCommand", data: { shouldFail: true } },
        model,
        cb,
      );
      queue.store({ cmd: "safeCommand", data: { value: "test2" } }, model, cb);

      expect(results).toHaveLength(2);
      expect(errors).toHaveLength(1);
      expect(errors[0].error.message).toBe("Command failed as requested");
    });
  });

  describe("Complex scenarios", () => {
    test("should handle user authentication and authorization tracking", () => {
      queue = initQueue({
        dbName: testEventDbPath,
      });

      model = modelSetup({
        dbName: testModelDbPath,
        tables: (db) => {
          db.query(
            "CREATE TABLE users (id TEXT PRIMARY KEY, username TEXT, email TEXT, created_by TEXT, created_at INTEGER)",
          ).run();
          db.query(
            "CREATE TABLE posts (id INTEGER PRIMARY KEY AUTOINCREMENT, author_id TEXT, content TEXT, created_at INTEGER)",
          ).run();
        },
        queries: (db) => ({
          createUser: db.query(
            "INSERT INTO users (id, username, email, created_by, created_at) VALUES ($id, $username, $email, $created_by, $created_at)",
          ),
          createPost: db.query(
            "INSERT INTO posts (author_id, content, created_at) VALUES ($author_id, $content, $created_at) RETURNING *",
          ),
          getUserPosts: db.query(
            "SELECT * FROM posts WHERE author_id = $author_id ORDER BY created_at DESC",
          ),
        }),
        methods: (queries) => ({
          createUser: ({ userId, username, email }, meta) => {
            queries.createUser.run({
              id: userId,
              username,
              email,
              created_by: meta.user,
              created_at: meta.datetime,
            });
            return { userId, username, createdBy: meta.user };
          },
          createPost: ({ content }, meta) => {
            const post = queries.createPost.get({
              author_id: meta.user,
              content,
              created_at: meta.datetime,
            });
            return post;
          },
        }),
        default: () => "", // Silent default for unknown commands
      });

      const auditLog = [];
      const cb = {
        _default: (res, row) => {
          auditLog.push({
            user: row.user,
            ip: row.ip,
            cmd: row.cmd,
            timestamp: row.datetime,
            result: res,
          });
        },
        _error: () => {},
      };

      // Simulate different users performing actions
      queue.store(
        {
          cmd: "createUser",
          data: { userId: "u1", username: "alice", email: "alice@example.com" },
          user: "admin",
          ip: "192.168.1.1",
        },
        model,
        cb,
      );

      queue.store(
        {
          cmd: "createUser",
          data: { userId: "u2", username: "bob", email: "bob@example.com" },
          user: "admin",
          ip: "192.168.1.1",
        },
        model,
        cb,
      );

      queue.store(
        {
          cmd: "createPost",
          data: { content: "Hello, world!" },
          user: "u1",
          ip: "192.168.1.100",
        },
        model,
        cb,
      );

      queue.store(
        {
          cmd: "createPost",
          data: { content: "My first post" },
          user: "u2",
          ip: "192.168.1.101",
        },
        model,
        cb,
      );

      // Verify audit log
      expect(auditLog).toHaveLength(4);
      expect(auditLog[0].user).toBe("admin");
      expect(auditLog[2].user).toBe("u1");
      expect(auditLog[3].user).toBe("u2");

      // Verify posts were created with correct authors
      const u1Posts = model.all("getUserPosts", { author_id: "u1" });
      const u2Posts = model.all("getUserPosts", { author_id: "u2" });

      expect(u1Posts).toHaveLength(1);
      expect(u1Posts[0].content).toBe("Hello, world!");
      expect(u2Posts).toHaveLength(1);
      expect(u2Posts[0].content).toBe("My first post");
    });

    test("should support partial replay from specific point", () => {
      queue = initQueue({
        dbName: testEventDbPath,
      });

      model = modelSetup({
        dbName: testModelDbPath,
        tables: (db) => {
          db.query(
            "CREATE TABLE counters (name TEXT PRIMARY KEY, value INTEGER)",
          ).run();
        },
        queries: (db) => ({
          set: db.query(
            "INSERT INTO counters (name, value) VALUES ($name, $value) ON CONFLICT(name) DO UPDATE SET value = excluded.value",
          ),
          get: db.query("SELECT value FROM counters WHERE name = $name"),
        }),
        methods: (queries) => ({
          increment: ({ counter }) => {
            const current = queries.get.get({ name: counter });
            const newValue = (current?.value || 0) + 1;
            queries.set.run({ name: counter, value: newValue });
            return newValue;
          },
        }),
        default: () => "", // Silent default for unknown commands
      });

      // Store a series of events
      for (let i = 0; i < 10; i++) {
        queue.store(
          { cmd: "increment", data: { counter: "test" } },
          model,
          eventCallbacks.void,
        );
      }

      // Get the ID after 5 events
      const allEvents = queue._queries.cycle.all({
        start: 0,
        offset: 0,
        stop: null,
      });
      const fifthEventId = allEvents[4].id;

      // Reset the model
      model._queries.set.run({ name: "test", value: 0 });

      // Replay only from the 6th event onwards
      queue.cycleThrough(model, () => {}, eventCallbacks.void, {
        start: fifthEventId + 1,
      });

      // Should have replayed only 5 events (6th through 10th)
      const counter = model.get("get", { name: "test" });
      expect(counter.value).toBe(5);
    });
  });

  describe("Callback integration", () => {
    test("should use different callbacks for different commands", () => {
      queue = initQueue({
        dbName: testEventDbPath,
      });

      model = modelSetup({
        stub: true,
        default: (data, meta) => `Processed ${meta.cmd}`,
      });

      const notifications = [];
      const cb = {
        notify: (res, row) => {
          notifications.push({
            type: "notification",
            user: row.user,
            data: row.data,
          });
        },
        log: (res, row) => {
          notifications.push({ type: "log", message: res });
        },
        _default: (res, row) => {
          notifications.push({ type: "default", cmd: row.cmd });
        },
        _error: (err) => {
          notifications.push({ type: "error", message: err.msg });
        },
      };

      queue.store(
        { cmd: "notify", data: { message: "Hello" }, user: "alice" },
        model,
        cb,
      );
      queue.store({ cmd: "log", data: {} }, model, cb);
      queue.store({ cmd: "unknown", data: {} }, model, cb);

      expect(notifications).toHaveLength(3);
      expect(notifications[0].type).toBe("notification");
      expect(notifications[0].user).toBe("alice");
      expect(notifications[1].type).toBe("log");
      expect(notifications[2].type).toBe("default");
    });
  });
});
