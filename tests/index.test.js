import { describe, test, expect } from "bun:test";
import { initQueue, eventCallbacks, modelSetup, initSnapshots, SnapshotManager, FileStorageManager, FileProcessor } from "../index.js";

describe("Index module exports", () => {
  test("should export initQueue function", () => {
    expect(initQueue).toBeDefined();
    expect(initQueue).toBeFunction();
  });

  test("should export eventCallbacks object", () => {
    expect(eventCallbacks).toBeDefined();
    expect(eventCallbacks).toBeObject();
    expect(eventCallbacks.stub).toBeDefined();
    expect(eventCallbacks.void).toBeDefined();
    expect(eventCallbacks.error).toBeDefined();
    expect(eventCallbacks.done).toBeDefined();
  });

  test("should export modelSetup function", () => {
    expect(modelSetup).toBeDefined();
    expect(modelSetup).toBeFunction();
  });

  test("should export initSnapshots function", () => {
    expect(initSnapshots).toBeDefined();
    expect(initSnapshots).toBeFunction();
  });

  test("should export SnapshotManager class", () => {
    expect(SnapshotManager).toBeDefined();
    expect(SnapshotManager).toBeFunction(); // Classes are functions in JS
  });

  test("should export FileStorageManager class", () => {
    expect(FileStorageManager).toBeDefined();
    expect(FileStorageManager).toBeFunction();
  });

  test("should export FileProcessor class", () => {
    expect(FileProcessor).toBeDefined();
    expect(FileProcessor).toBeFunction();
  });

  test("eventCallbacks should have proper structure", () => {
    // Check stub callbacks
    expect(eventCallbacks.stub._error).toBeFunction();
    expect(eventCallbacks.stub._default).toBeFunction();

    // Check void callbacks
    expect(eventCallbacks.void._error).toBeFunction();
    expect(eventCallbacks.void._default).toBeFunction();

    // Check error callbacks
    expect(eventCallbacks.error._error).toBeFunction();
    expect(eventCallbacks.error._default).toBeFunction();

    // Check done callback
    expect(eventCallbacks.done).toBeFunction();
  });

  test("exported functions should be the same as direct imports", async () => {
    const { initQueue: directInitQueue } = await import("../lib/event-source.js");
    const { modelSetup: directModelSetup } = await import("../lib/model.js");
    const { initSnapshots: directInitSnapshots, SnapshotManager: directSnapshotManager } = await import("../lib/snapshot.js");
    const { FileStorageManager: directFileStorageManager } = await import("../lib/file-storage.js");
    const { FileProcessor: directFileProcessor } = await import("../lib/file-processor.js");

    expect(initQueue).toBe(directInitQueue);
    expect(modelSetup).toBe(directModelSetup);
    expect(initSnapshots).toBe(directInitSnapshots);
    expect(SnapshotManager).toBe(directSnapshotManager);
    expect(FileStorageManager).toBe(directFileStorageManager);
    expect(FileProcessor).toBe(directFileProcessor);
  });
});
