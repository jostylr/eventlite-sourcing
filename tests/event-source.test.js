import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { initQueue, eventCallbacks } from "../event-source.js";
import { existsSync, rmSync } from "fs";
import { join } from "path";

describe("Event Source", () => {
  const testDbPath = join("tests", "data", "test-events.sqlite");
  let queue;

  beforeEach(() => {
    // Clean up any existing test database
    if (existsSync(testDbPath)) {
      rmSync(testDbPath);
    }
  });

  afterEach(() => {
    // Clean up test database after each test
    if (existsSync(testDbPath)) {
      rmSync(testDbPath);
    }
  });

  describe("initQueue", () => {
    test("should initialize queue with default options", () => {
      queue = initQueue({ dbName: testDbPath });
      expect(queue).toBeDefined();
      expect(queue.store).toBeFunction();
      expect(queue.execute).toBeFunction();
      expect(queue.retrieveByID).toBeFunction();
      expect(queue.cycleThrough).toBeFunction();
    });

    test("should create events table", () => {
      queue = initQueue({ dbName: testDbPath });
      expect(existsSync(testDbPath)).toBe(true);
    });

    test("should initialize with custom datetime function", () => {
      const customDatetime = () => 12345;
      queue = initQueue({
        dbName: testDbPath,
        datetime: customDatetime,
      });

      const mockModel = {
        testCmd: (data) => "success",
        _done: () => {},
        _error: () => {},
      };

      const mockCb = {
        _default: () => {},
        _error: () => {},
      };

      queue.store({ cmd: "testCmd", data: {} }, mockModel, mockCb);
      const lastRow = queue._queries.getLastRow.get();
      expect(lastRow.datetime).toBe(12345);
    });

    test("should support WAL mode when specified", () => {
      queue = initQueue({
        dbName: testDbPath,
        WAL: true,
      });
      expect(queue).toBeDefined();
    });

    test("should add reset method when risky option is true", () => {
      queue = initQueue({
        dbName: testDbPath,
        risky: true,
      });
      expect(queue.reset).toBeFunction();
    });
  });

  describe("store method", () => {
    beforeEach(() => {
      queue = initQueue({ dbName: testDbPath, risky: true });
    });

    test("should store and execute a command", () => {
      const mockModel = {
        testCmd: (data) => ({ result: "success", value: data.value }),
        _done: () => {},
        _error: () => {},
      };

      const results = [];
      const mockCb = {
        _default: (res, row) => {
          results.push({ res, row });
        },
        _error: () => {},
      };

      const returnValue = queue.store(
        {
          cmd: "testCmd",
          data: { value: 42 },
          user: "testuser",
          ip: "127.0.0.1",
        },
        mockModel,
        mockCb,
      );

      expect(results).toHaveLength(1);
      expect(results[0].res).toEqual({ result: "success", value: 42 });
      expect(results[0].row.cmd).toBe("testCmd");
      expect(results[0].row.user).toBe("testuser");
      expect(results[0].row.ip).toBe("127.0.0.1");
      expect(returnValue).toEqual({ result: "success", value: 42 });
    });

    test("should handle missing command", () => {
      const mockModel = {
        _done: () => {},
        _error: () => {},
      };

      const errors = [];
      const mockCb = {
        _default: () => {},
        _error: (err) => {
          errors.push(err);
        },
      };

      queue.store({ data: {} }, mockModel, mockCb);

      expect(errors).toHaveLength(1);
      expect(errors[0].msg).toContain("No command given");
    });

    test("should parse and stringify data correctly", () => {
      const mockModel = {
        testCmd: (data) => data,
        _done: () => {},
        _error: () => {},
      };

      const results = [];
      const mockCb = {
        _default: (res, row) => {
          results.push(row.data);
        },
        _error: () => {},
      };

      const complexData = {
        string: "test",
        number: 123,
        boolean: true,
        array: [1, 2, 3],
        nested: { a: 1, b: 2 },
      };

      queue.store({ cmd: "testCmd", data: complexData }, mockModel, mockCb);

      expect(results[0]).toEqual(complexData);
    });
  });

  describe("execute method", () => {
    beforeEach(() => {
      queue = initQueue({ dbName: testDbPath });
    });

    test("should execute command from model methods", () => {
      const mockModel = {
        testCmd: (data, meta) => ({
          result: "executed",
          receivedData: data,
          receivedMeta: meta,
        }),
        _done: () => {},
        _error: () => {},
      };

      const results = [];
      const mockCb = {
        _default: (res) => {
          results.push(res);
        },
        _error: () => {},
      };

      const row = {
        id: 1,
        datetime: Date.now(),
        user: "testuser",
        ip: "127.0.0.1",
        cmd: "testCmd",
        data: { test: "data" },
      };

      const res = queue.execute(row, mockModel, mockCb);

      expect(res.result).toBe("executed");
      expect(res.receivedData).toEqual({ test: "data" });
      expect(res.receivedMeta.user).toBe("testuser");
      expect(res.receivedMeta.cmd).toBe("testCmd");
    });

    test("should use model._default for unknown commands", () => {
      const mockModel = {
        _default: (data, meta) => ({
          handled: "by default",
          cmd: meta.cmd,
        }),
        _queries: {},
        _done: () => {},
        _error: () => {},
      };

      const results = [];
      const mockCb = {
        _default: (res) => {
          results.push(res);
        },
        _error: () => {},
      };

      const row = {
        id: 1,
        datetime: Date.now(),
        user: "testuser",
        ip: "127.0.0.1",
        cmd: "unknownCmd",
        data: {},
      };

      const res = queue.execute(row, mockModel, mockCb);

      expect(res.handled).toBe("by default");
      expect(res.cmd).toBe("unknownCmd");
    });

    test("should handle errors in command execution", () => {
      const mockModel = {
        errorCmd: () => {
          throw new Error("Command failed");
        },
        _done: () => {},
        _error: () => {},
      };

      const errors = [];
      const mockCb = {
        _default: () => {},
        _error: (err) => {
          errors.push(err);
        },
      };

      const row = {
        id: 1,
        datetime: Date.now(),
        user: "testuser",
        ip: "127.0.0.1",
        cmd: "errorCmd",
        data: {},
      };

      queue.execute(row, mockModel, mockCb);

      expect(errors).toHaveLength(1);
      expect(errors[0].error.message).toBe("Command failed");
      expect(errors[0].cmd).toBe("errorCmd");
    });

    test("should use command-specific callback if available", () => {
      const mockModel = {
        specialCmd: () => "special result",
        _done: () => {},
        _error: () => {},
      };

      const results = [];
      const mockCb = {
        specialCmd: (res, row) => {
          results.push({ type: "special", res, cmd: row.cmd });
        },
        _default: (res, row) => {
          results.push({ type: "default", res, cmd: row.cmd });
        },
        _error: () => {},
      };

      const row = {
        id: 1,
        datetime: Date.now(),
        user: "testuser",
        ip: "127.0.0.1",
        cmd: "specialCmd",
        data: {},
      };

      queue.execute(row, mockModel, mockCb);

      expect(results).toHaveLength(1);
      expect(results[0].type).toBe("special");
      expect(results[0].res).toBe("special result");
    });
  });

  describe("retrieveByID method", () => {
    beforeEach(() => {
      queue = initQueue({ dbName: testDbPath });
    });

    test("should retrieve event by ID", () => {
      const mockModel = {
        testCmd: () => "success",
        _done: () => {},
        _error: () => {},
      };

      const mockCb = {
        _default: () => {},
        _error: () => {},
      };

      // Store an event
      queue.store(
        { cmd: "testCmd", data: { test: "data" } },
        mockModel,
        mockCb,
      );

      // Get the last row to know its ID
      const lastRow = queue._queries.getLastRow.get();

      // Retrieve by ID
      const retrieved = queue.retrieveByID(lastRow.id);

      expect(retrieved).toBeDefined();
      expect(retrieved.id).toBe(lastRow.id);
      expect(retrieved.cmd).toBe("testCmd");
      expect(JSON.parse(retrieved.data)).toEqual({ test: "data" });
    });

    test("should return undefined for non-existent ID", () => {
      const retrieved = queue.retrieveByID(9999);
      expect(retrieved).toBeNull();
    });
  });

  describe("cycleThrough method", () => {
    beforeEach(() => {
      queue = initQueue({ dbName: testDbPath });
    });

    test("should cycle through all events", () => {
      const mockModel = {
        cmd1: () => "result1",
        cmd2: () => "result2",
        cmd3: () => "result3",
        _done: () => {},
        _error: () => {},
      };

      const storeCb = {
        _default: () => {},
        _error: () => {},
      };

      // Store multiple events
      queue.store({ cmd: "cmd1", data: { n: 1 } }, mockModel, storeCb);
      queue.store({ cmd: "cmd2", data: { n: 2 } }, mockModel, storeCb);
      queue.store({ cmd: "cmd3", data: { n: 3 } }, mockModel, storeCb);

      const executedEvents = [];
      const whileCb = {
        _default: (res, row) => {
          executedEvents.push({ cmd: row.cmd, data: row.data });
        },
        _error: () => {},
      };

      let doneCalled = false;
      const doneCb = () => {
        doneCalled = true;
      };

      queue.cycleThrough(mockModel, doneCb, whileCb, { start: 0 });

      expect(executedEvents).toHaveLength(3);
      expect(executedEvents[0].cmd).toBe("cmd1");
      expect(executedEvents[1].cmd).toBe("cmd2");
      expect(executedEvents[2].cmd).toBe("cmd3");
      expect(doneCalled).toBe(true);
    });

    test("should handle start parameter", () => {
      const mockModel = {
        cmd1: () => "result1",
        cmd2: () => "result2",
        cmd3: () => "result3",
        _done: () => {},
        _error: () => {},
      };

      const storeCb = {
        _default: () => {},
        _error: () => {},
      };

      // Store multiple events
      queue.store({ cmd: "cmd1", data: { n: 1 } }, mockModel, storeCb);
      queue.store({ cmd: "cmd2", data: { n: 2 } }, mockModel, storeCb);
      const secondEvent = queue._queries.getLastRow.get();
      queue.store({ cmd: "cmd3", data: { n: 3 } }, mockModel, storeCb);

      const executedEvents = [];
      const whileCb = {
        _default: (res, row) => {
          executedEvents.push({ cmd: row.cmd, id: row.id });
        },
        _error: () => {},
      };

      queue.cycleThrough(mockModel, () => {}, whileCb, {
        start: secondEvent.id,
      });

      expect(executedEvents).toHaveLength(2);
      expect(executedEvents[0].cmd).toBe("cmd2");
      expect(executedEvents[1].cmd).toBe("cmd3");
    });

    test("should handle empty event queue", () => {
      const mockModel = {
        _done: () => {},
        _error: () => {},
      };

      const executedEvents = [];
      const whileCb = {
        _default: (res, row) => {
          executedEvents.push(row);
        },
        _error: () => {},
      };

      let doneCalled = false;
      const doneCb = () => {
        doneCalled = true;
      };

      queue.cycleThrough(mockModel, doneCb, whileCb, { start: 0 });

      expect(executedEvents).toHaveLength(0);
      expect(doneCalled).toBe(true);
    });
  });

  describe("reset functionality", () => {
    test("should reset the queue when risky option is enabled", () => {
      queue = initQueue({ dbName: testDbPath, risky: true });

      const mockModel = {
        testCmd: () => "success",
        _done: () => {},
        _error: () => {},
      };

      const mockCb = {
        _default: () => {},
        _error: () => {},
      };

      // Store some events
      queue.store({ cmd: "testCmd", data: { n: 1 } }, mockModel, mockCb);
      queue.store({ cmd: "testCmd", data: { n: 2 } }, mockModel, mockCb);

      // Verify events exist
      let lastRow = queue._queries.getLastRow.get();
      expect(lastRow).toBeDefined();

      // Reset
      queue.reset();

      // Verify queue is empty
      lastRow = queue._queries.getLastRow.get();
      expect(lastRow).toBeNull();
    });
  });

  describe("eventCallbacks", () => {
    test("stub callbacks should log appropriately", () => {
      const logs = [];
      const originalLog = console.log;
      console.log = (...args) => logs.push(args);

      eventCallbacks.stub._default("test result", {
        cmd: "testCmd",
        data: { test: true },
      });
      eventCallbacks.stub._error({
        msg: "test error",
        error: new Error("fail"),
        cmd: "errorCmd",
        data: {},
      });

      console.log = originalLog;

      expect(logs).toHaveLength(2);
      expect(logs[0].join(" ")).toContain("testCmd");
      expect(logs[1]).toContain("test error");
    });

    test("void callbacks should do nothing", () => {
      expect(() => {
        eventCallbacks.void._default("result", {});
        eventCallbacks.void._error({});
      }).not.toThrow();
    });

    test("error callbacks should only log errors", () => {
      const logs = [];
      const originalLog = console.log;
      console.log = (...args) => logs.push(args);

      eventCallbacks.error._default("result", {});
      eventCallbacks.error._error({
        msg: "error occurred",
        error: new Error("test"),
        cmd: "testCmd",
        data: {},
      });

      console.log = originalLog;

      expect(logs).toHaveLength(1);
      expect(logs[0]).toContain("error occurred");
    });
  });
});
