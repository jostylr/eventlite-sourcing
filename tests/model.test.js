import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { modelSetup } from "../model.js";
import { existsSync, rmSync, mkdirSync } from "fs";
import { join, dirname } from "path";

describe("Model Setup", () => {
  const testDbPath = join("tests", "data", "test-model.sqlite");
  const testDbOldPath = join("tests", "data", "test-model-old.sqlite");
  let model;

  beforeEach(() => {
    // Ensure the data directory exists
    const dataDir = dirname(testDbPath);
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true });
    }

    // Clean up any existing test databases
    if (existsSync(testDbPath)) {
      rmSync(testDbPath);
    }
    if (existsSync(testDbOldPath)) {
      rmSync(testDbOldPath);
    }
  });

  afterEach(() => {
    // Clean up test databases after each test
    if (existsSync(testDbPath)) {
      rmSync(testDbPath);
    }
    if (existsSync(testDbOldPath)) {
      rmSync(testDbOldPath);
    }
  });

  describe("Basic initialization", () => {
    test("should create model with default options", () => {
      model = modelSetup({ dbName: testDbPath });

      expect(model).toBeDefined();
      expect(model._db).toBeDefined();
      expect(model._queries).toBeDefined();
      expect(model._default).toBeFunction();
      expect(model._done).toBeFunction();
      expect(model._error).toBeFunction();
      expect(model.get).toBeFunction();
      expect(model.all).toBeFunction();
    });

    test("should create stub model when stub option is true", () => {
      model = modelSetup({ stub: true });

      expect(model).toBeDefined();
      expect(model._queries).toEqual({});
      expect(model._db).toEqual({});
      expect(model._default).toBeFunction();
    });

    test("should use custom default function", () => {
      const customDefault = (data, meta) => `Custom: ${meta.cmd}`;
      model = modelSetup({
        dbName: testDbPath,
        default: customDefault,
      });

      const result = model._default({ test: "data" }, { cmd: "testCmd" });
      expect(result).toBe("Custom: testCmd");
    });

    test("should support WAL mode", () => {
      model = modelSetup({
        dbName: testDbPath,
        WAL: true,
      });

      expect(model).toBeDefined();
      expect(model._db).toBeDefined();
    });

    test("should call tables function during setup", () => {
      let tablesCalled = false;
      const tablesFunc = (db) => {
        tablesCalled = true;
        db.query("CREATE TABLE test_table (id INTEGER PRIMARY KEY)").run();
      };

      model = modelSetup({
        dbName: testDbPath,
        tables: tablesFunc,
      });

      expect(tablesCalled).toBe(true);
    });
  });

  describe("Reset functionality", () => {
    test("should move database to old file with empty reset array", () => {
      // Create initial database
      model = modelSetup({ dbName: testDbPath });
      model._db.close();

      expect(existsSync(testDbPath)).toBe(true);

      // Reset with empty array
      model = modelSetup({
        dbName: testDbPath,
        reset: [],
      });

      expect(existsSync(testDbPath)).toBe(true);
      expect(existsSync(testDbOldPath)).toBe(true);
    });

    test("should move database to custom name with single element reset array", () => {
      const customPath = join("tests", "data", "custom-backup.sqlite");

      // Create initial database
      model = modelSetup({ dbName: testDbPath });
      model._db.close();

      // Reset with custom name
      model = modelSetup({
        dbName: testDbPath,
        reset: [customPath],
      });

      expect(existsSync(testDbPath)).toBe(true);
      expect(existsSync(customPath)).toBe(true);

      // Cleanup
      if (existsSync(customPath)) {
        rmSync(customPath);
      }
    });

    test("should delete database when reset array contains empty string", () => {
      // Create initial database
      model = modelSetup({ dbName: testDbPath });
      model._db.close();

      expect(existsSync(testDbPath)).toBe(true);

      // Reset with empty string (delete)
      model = modelSetup({
        dbName: testDbPath,
        reset: [""],
      });

      expect(existsSync(testDbPath)).toBe(true); // New one created
    });

    test("should handle custom old and new names with two element reset array", () => {
      const oldPath = join("tests", "data", "old-db.sqlite");
      const newPath = join("tests", "data", "new-backup.sqlite");

      // Create initial database at old path
      model = modelSetup({ dbName: oldPath });
      model._db.close();

      expect(existsSync(oldPath)).toBe(true);

      // Reset with custom names
      model = modelSetup({
        dbName: testDbPath,
        reset: [oldPath, newPath],
      });

      expect(existsSync(oldPath)).toBe(false);
      expect(existsSync(newPath)).toBe(true);

      // Cleanup
      if (existsSync(newPath)) {
        rmSync(newPath);
      }
    });
  });

  describe("Query and method setup", () => {
    test("should set up queries and methods from provided functions", () => {
      const queries = (db) => ({
        insert: db.query("INSERT INTO items (name) VALUES ($name)"),
        select: db.query("SELECT * FROM items WHERE name = $name"),
      });

      const methods = (qs) => ({
        addItem: ({ name }) => {
          qs.insert.run({ name });
          return `Added ${name}`;
        },
        getItem: ({ name }) => {
          return qs.select.get({ name });
        },
      });

      model = modelSetup({
        dbName: testDbPath,
        tables: (db) => {
          db.query("CREATE TABLE items (name TEXT PRIMARY KEY)").run();
        },
        queries,
        methods,
      });

      expect(model.addItem).toBeFunction();
      expect(model.getItem).toBeFunction();
      expect(model._queries.insert).toBeDefined();
      expect(model._queries.select).toBeDefined();
    });

    test("should use custom done and error handlers", () => {
      let doneData = null;
      let errorData = null;

      const customDone = (row, res) => {
        doneData = { row, res };
      };

      const customError = (err) => {
        errorData = err;
      };

      model = modelSetup({
        dbName: testDbPath,
        done: customDone,
        error: customError,
      });

      model._done({ cmd: "test" }, "result");
      model._error({ msg: "error" });

      expect(doneData).toEqual({ row: { cmd: "test" }, res: "result" });
      expect(errorData).toEqual({ msg: "error" });
    });
  });

  describe("get and all methods", () => {
    beforeEach(() => {
      model = modelSetup({
        dbName: testDbPath,
        tables: (db) => {
          db.query(
            "CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)",
          ).run();
        },
        queries: (db) => ({
          insertUser: db.query(
            "INSERT INTO users (name) VALUES ($name) RETURNING *",
          ),
          getUser: db.query("SELECT * FROM users WHERE name = $name"),
          getAllUsers: db.query("SELECT * FROM users"),
        }),
      });
    });

    test("should execute get query correctly", () => {
      // Insert a user
      model._queries.insertUser.run({ name: "Alice" });

      // Get the user
      const user = model.get("getUser", { name: "Alice" });

      expect(user).toBeDefined();
      expect(user.name).toBe("Alice");
    });

    test("should execute all query correctly", () => {
      // Insert multiple users
      model._queries.insertUser.run({ name: "Alice" });
      model._queries.insertUser.run({ name: "Bob" });
      model._queries.insertUser.run({ name: "Charlie" });

      // Get all users
      const users = model.all("getAllUsers", {});

      expect(users).toHaveLength(3);
      expect(users.map((u) => u.name)).toEqual(["Alice", "Bob", "Charlie"]);
    });

    test("should throw error for invalid get query", () => {
      expect(() => {
        model.get("nonExistentQuery", {});
      }).toThrow();
    });

    test("should throw error for invalid all query", () => {
      expect(() => {
        model.all("nonExistentQuery", {});
      }).toThrow();
    });

    test("should handle query execution errors", () => {
      // Try to query with invalid parameters
      expect(() => {
        model.get("getUser", { wrongParam: "value" });
      }).toThrow();
    });
  });

  describe("Integration with event sourcing", () => {
    test("should work as a model for event sourcing", () => {
      const results = [];

      model = modelSetup({
        dbName: testDbPath,
        tables: (db) => {
          db.query(
            "CREATE TABLE counters (name TEXT PRIMARY KEY, value INTEGER)",
          ).run();
        },
        queries: (db) => ({
          upsert: db.query(
            "INSERT INTO counters (name, value) VALUES ($name, $value) ON CONFLICT(name) DO UPDATE SET value = excluded.value",
          ),
          get: db.query("SELECT value FROM counters WHERE name = $name"),
        }),
        methods: (queries) => ({
          increment: ({ counter, by = 1 }, meta) => {
            const current = queries.get.get({ name: counter });
            const newValue = (current?.value || 0) + by;
            queries.upsert.run({ name: counter, value: newValue });
            return { counter, newValue, user: meta.user };
          },
          setValue: ({ counter, value }) => {
            queries.upsert.run({ name: counter, value });
            return { counter, value };
          },
        }),
      });

      // Test increment
      const res1 = model.increment(
        { counter: "clicks", by: 5 },
        { user: "alice" },
      );
      expect(res1).toEqual({ counter: "clicks", newValue: 5, user: "alice" });

      // Test increment again
      const res2 = model.increment(
        { counter: "clicks", by: 3 },
        { user: "bob" },
      );
      expect(res2).toEqual({ counter: "clicks", newValue: 8, user: "bob" });

      // Test setValue
      const res3 = model.setValue({ counter: "views", value: 100 });
      expect(res3).toEqual({ counter: "views", value: 100 });

      // Verify values
      const clicks = model.get("get", { name: "clicks" });
      const views = model.get("get", { name: "views" });

      expect(clicks.value).toBe(8);
      expect(views.value).toBe(100);
    });
  });

  describe("Error handling", () => {
    test("should handle database connection errors gracefully", () => {
      const invalidPath = "/invalid/path/that/does/not/exist/db.sqlite";

      expect(() => {
        model = modelSetup({ dbName: invalidPath });
      }).toThrow();
    });

    test("should handle errors in table creation", () => {
      const badTables = (db) => {
        // Try to create a table with invalid SQL
        db.query("CREATE TABLE INVALID SYNTAX").run();
      };

      expect(() => {
        model = modelSetup({
          dbName: testDbPath,
          tables: badTables,
        });
      }).toThrow();
    });

    test("should handle errors in queries function", () => {
      const badQueries = (db) => {
        throw new Error("Query setup failed");
      };

      expect(() => {
        model = modelSetup({
          dbName: testDbPath,
          queries: badQueries,
        });
      }).toThrow("Query setup failed");
    });

    test("should handle errors in methods function", () => {
      const queries = (db) => ({
        test: db.query("SELECT 1"),
      });

      const badMethods = () => {
        throw new Error("Method setup failed");
      };

      expect(() => {
        model = modelSetup({
          dbName: testDbPath,
          queries,
          methods: badMethods,
        });
      }).toThrow("Method setup failed");
    });
  });

  describe("Default method behavior", () => {
    test("should log unknown commands with default handler", () => {
      const logs = [];
      const originalLog = console.log;
      console.log = (...args) => logs.push(args);

      model = modelSetup({ dbName: testDbPath });

      const result = model._default({ test: "data" }, { cmd: "unknownCmd" });

      console.log = originalLog;

      expect(logs).toHaveLength(1);
      expect(logs[0].join(" ")).toContain("unknownCmd is unknown to model");
      expect(result).toBe("");
    });
  });
});
