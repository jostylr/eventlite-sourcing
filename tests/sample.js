import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { existsSync, rmSync } from "fs";
import { join } from "path";

describe("Sample implementation", () => {
  const sampleDbPath = join("sample", "data", "events.sqlite");
  const modelDbPath = join("sample", "data", "model.sqlite");

  beforeEach(() => {
    // Clean up any existing sample databases
    const sampleDir = join("sample", "data");
    if (existsSync(sampleDir)) {
      rmSync(sampleDir, { recursive: true, force: true });
    }
  });

  afterEach(() => {
    // Clean up sample databases after each test
    if (existsSync(sampleDbPath)) {
      rmSync(sampleDbPath);
    }
    if (existsSync(modelDbPath)) {
      rmSync(modelDbPath);
    }
  });

  test("should run sample.js without errors", async () => {
    // Capture console output
    const logs = [];
    const errors = [];
    const originalLog = console.log;
    const originalError = console.error;

    console.log = (...args) => logs.push(args.join(" "));
    console.error = (...args) => errors.push(args.join(" "));

    try {
      // Clear module cache to ensure fresh import
      const samplePath = new URL("../sample/sample.js", import.meta.url).href;
      delete require.cache[samplePath];

      // Run the sample
      await import("../sample/sample.js");

      // Verify expected output
      expect(errors).toHaveLength(0);
      expect(logs.length).toBeGreaterThan(0);

      // Check for expected calculations
      const outputStr = logs.join("\n");
      expect(outputStr).toContain("x is now 5");
      // Note: 'y is now 9' won't appear because storeq is a direct query, not a method
      expect(outputStr).toContain("z, as a result of addition, is now 14");
      expect(outputStr).toContain("x is now 8");
      expect(outputStr).toContain("w, as a result of addition, is now 22");
    } finally {
      // Restore console
      console.log = originalLog;
      console.error = originalError;
    }
  });

  test("sample demonstrates key event sourcing concepts", async () => {
    const logs = [];
    const originalLog = console.log;
    console.log = (...args) => logs.push(args);

    try {
      // Import the modules used in sample
      const { initQueue, modelSetup } = await import("../index.js");

      // Set up similar to sample but with inspection
      const evQ = initQueue({
        dbName: sampleDbPath,
        risky: true,
      });

      const model = modelSetup({
        dbName: modelDbPath,
        reset: [""],
        tables(db) {
          db.query(
            "CREATE TABLE variables (name TEXT PRIMARY KEY, value NUMBER)",
          ).run();
        },
        queries(db) {
          return {
            store: db.query(
              "INSERT INTO variables(name, value) VALUES ($name, $value) ON CONFLICT (name) DO UPDATE SET value = excluded.value",
            ),
            storeq: db.query(
              "INSERT INTO variables(name, value) VALUES ($name, $value) ON CONFLICT (name) DO UPDATE SET value = excluded.value",
            ),
            lookup: db.query(
              "SELECT (value) FROM variables WHERE name = $name",
            ),
          };
        },
        methods(queries) {
          return {
            store({ name, value }) {
              queries.store.run({ name, value });
              return [`${name} is now ${value}`, "stored"];
            },
            add({ left, right, name }) {
              let { value: l } = queries.lookup.get(left);
              let { value: r } = queries.lookup.get(right) || {};
              let sum = l + r;
              queries.store.run({ name, value: sum });
              return [
                `${name}, as a result of addition, is now ${sum}`,
                "added and stored",
              ];
            },
          };
        },
        default: () => "", // Silent default for unknown commands
      });

      evQ.reset();

      // Test direct query usage (storeq command)
      const results = [];
      const cb = {
        _default(res, row) {
          results.push({ res, row });
        },
        _error({ msg }) {
          results.push({ error: msg });
        },
      };

      // Execute sample commands
      evQ.store({ cmd: "store", data: { name: "x", value: 5 } }, model, cb);
      evQ.store({ cmd: "storeq", data: { name: "y", value: 9 } }, model, cb);
      evQ.store(
        { cmd: "add", data: { left: "x", right: "y", name: "z" } },
        model,
        cb,
      );
      evQ.store({ cmd: "store", data: { name: "x", value: 8 } }, model, cb);
      evQ.store(
        { cmd: "add", data: { left: "z", right: "x", name: "w" } },
        model,
        cb,
      );

      // Verify results
      expect(results).toHaveLength(5);
      expect(results[0].res[0]).toBe("x is now 5");
      expect(results[1].res).toBe(null); // storeq uses direct query
      expect(results[2].res[0]).toBe("z, as a result of addition, is now 14");
      expect(results[3].res[0]).toBe("x is now 8");
      expect(results[4].res[0]).toBe("w, as a result of addition, is now 22");

      // Verify final state in model
      const xVal = model.get("lookup", { name: "x" });
      const yVal = model.get("lookup", { name: "y" });
      const zVal = model.get("lookup", { name: "z" });
      const wVal = model.get("lookup", { name: "w" });

      expect(xVal.value).toBe(8);
      expect(yVal.value).toBe(9);
      expect(zVal.value).toBe(14);
      expect(wVal.value).toBe(22);

      // Test event replay
      model._db.exec("DELETE FROM variables");

      // Replay events
      evQ.cycleThrough(model, () => {}, cb);

      // Verify state was rebuilt
      const xValReplay = model.get("lookup", { name: "x" });
      const wValReplay = model.get("lookup", { name: "w" });

      expect(xValReplay.value).toBe(8);
      expect(wValReplay.value).toBe(22);
    } finally {
      console.log = originalLog;
    }
  });

  test("sample demonstrates direct query passthrough", async () => {
    const { initQueue, modelSetup } = await import("../index.js");

    const evQ = initQueue({
      dbName: sampleDbPath,
      risky: true,
    });

    const model = modelSetup({
      dbName: modelDbPath,
      reset: [""],
      tables(db) {
        db.query(
          "CREATE TABLE variables (name TEXT PRIMARY KEY, value NUMBER)",
        ).run();
      },
      queries(db) {
        return {
          storeq: db.query(
            "INSERT INTO variables(name, value) VALUES ($name, $value) ON CONFLICT (name) DO UPDATE SET value = excluded.value",
          ),
          lookup: db.query("SELECT (value) FROM variables WHERE name = $name"),
        };
      },
      methods(queries) {
        return {};
      },
    });

    const results = [];
    const cb = {
      _default(res, row) {
        results.push({ res, cmd: row.cmd });
      },
      _error(err) {
        results.push({ error: err.msg });
      },
    };

    // Test that storeq command works via _queries passthrough
    evQ.store({ cmd: "storeq", data: { name: "test", value: 42 } }, model, cb);

    // The result should be undefined for direct query passthrough
    expect(results).toHaveLength(1);
    expect(results[0].res).toBe(null);
    expect(results[0].cmd).toBe("storeq");

    // But the data should be stored
    const storedVal = model.get("lookup", { name: "test" });
    expect(storedVal.value).toBe(42);
  });
});
