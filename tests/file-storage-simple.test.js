import { describe, test, expect } from "bun:test";
import { FileStorageManager } from "../lib/file-storage.js";

describe("FileStorageManager Simple Tests", () => {
  test("should create FileStorageManager", () => {
    const manager = new FileStorageManager();
    expect(manager).toBeDefined();
    expect(manager.backend).toBe("local");
    manager.close();
  });
});