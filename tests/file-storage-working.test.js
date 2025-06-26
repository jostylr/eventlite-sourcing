import { describe, test, expect } from "bun:test";
import { FileStorageManager } from "../lib/file-storage.js";
import { existsSync, rmSync, mkdirSync } from "fs";
import { join } from "path";

describe("FileStorageManager Working Tests", () => {
  const testStorageDir = join("tests", "data", "working-storage");

  function setupTest() {
    if (existsSync(testStorageDir)) {
      rmSync(testStorageDir, { recursive: true });
    }
    mkdirSync(testStorageDir, { recursive: true });
  }

  function cleanupTest() {
    if (existsSync(testStorageDir)) {
      rmSync(testStorageDir, { recursive: true });
    }
  }

  test("should initialize FileStorageManager", () => {
    setupTest();
    
    const manager = new FileStorageManager({
      baseDir: testStorageDir,
      backend: "local"
    });
    
    expect(manager).toBeDefined();
    expect(manager.baseDir).toBe(testStorageDir);
    expect(manager.backend).toBe("local");
    
    manager.close();
    cleanupTest();
  });

  test("should store and retrieve a file", async () => {
    setupTest();
    
    const manager = new FileStorageManager({
      baseDir: testStorageDir,
      backend: "local"
    });

    try {
      const content = "Hello, File Storage!";
      const buffer = Buffer.from(content);
      
      const fileRef = await manager.storeFile(buffer, {
        originalName: "hello.txt",
        mimeType: "text/plain"
      });

      expect(fileRef).toBeDefined();
      expect(fileRef.id).toBeDefined();
      expect(fileRef.size).toBe(20);
      expect(fileRef.originalName).toBe("hello.txt");

      const retrieved = await manager.getFile(fileRef.id);
      expect(retrieved.toString()).toBe(content);

      const metadata = await manager.getFileMetadata(fileRef.id);
      expect(metadata.originalName).toBe("hello.txt");
      expect(metadata.mimeType).toBe("text/plain");
    } finally {
      manager.close();
      cleanupTest();
    }
  });

  test("should create event file references", async () => {
    setupTest();
    
    const manager = new FileStorageManager({
      baseDir: testStorageDir,
      backend: "local"
    });

    try {
      const buffer = Buffer.from("event reference test");
      
      const fileRef = await manager.storeFile(buffer, {
        originalName: "event.txt",
        mimeType: "text/plain"
      });

      const eventRef = manager.createEventFileReference(fileRef);
      expect(eventRef.type).toBe("file_reference");
      expect(eventRef.fileId).toBe(fileRef.id);
      expect(eventRef.originalName).toBe("event.txt");

      const resolved = await manager.resolveEventFileReference(eventRef);
      expect(resolved.toString()).toBe("event reference test");
    } finally {
      manager.close();
      cleanupTest();
    }
  });

  test("should extract file references from event data", () => {
    setupTest();
    
    const manager = new FileStorageManager({
      baseDir: testStorageDir,
      backend: "local"
    });

    try {
      const eventData = {
        cmd: "uploadFile",
        data: {
          file: {
            type: "file_reference",
            fileId: "test-file-id",
            originalName: "test.txt",
            size: 100,
            mimeType: "text/plain"
          },
          description: "Test upload"
        }
      };

      const refs = manager.extractFileReferences(eventData);
      
      expect(refs).toHaveLength(1);
      expect(refs[0].fileId).toBe("test-file-id");
      expect(refs[0].originalName).toBe("test.txt");
    } finally {
      manager.close();
      cleanupTest();
    }
  });

  test("should validate file requirements", async () => {
    setupTest();
    
    const manager = new FileStorageManager({
      baseDir: testStorageDir,
      backend: "local"
    });

    try {
      // Test empty buffer
      await expect(manager.storeFile(Buffer.alloc(0), {
        originalName: "empty.txt",
        mimeType: "text/plain"
      })).rejects.toThrow();

      // Test missing metadata
      await expect(manager.storeFile(Buffer.from("test"), null))
        .rejects.toThrow("File metadata is required");

      // Test missing filename
      await expect(manager.storeFile(Buffer.from("test"), {
        mimeType: "text/plain"
      })).rejects.toThrow("Original filename is required");

      // Test missing MIME type
      await expect(manager.storeFile(Buffer.from("test"), {
        originalName: "test.txt"
      })).rejects.toThrow("MIME type is required");
    } finally {
      manager.close();
      cleanupTest();
    }
  });

  test("should handle file size validation", async () => {
    setupTest();
    
    const manager = new FileStorageManager({
      baseDir: testStorageDir,
      backend: "local",
      maxFileSize: 5 // Very small for testing
    });

    try {
      const buffer = Buffer.from("This content is too large");
      
      await expect(manager.storeFile(buffer, {
        originalName: "large.txt",
        mimeType: "text/plain"
      })).rejects.toThrow("File validation failed");
    } finally {
      manager.close();
      cleanupTest();
    }
  });

  test("should handle MIME type restrictions", async () => {
    setupTest();
    
    const manager = new FileStorageManager({
      baseDir: testStorageDir,
      backend: "local",
      allowedTypes: ["image/jpeg", "image/png"]
    });

    try {
      const buffer = Buffer.from("text content");
      
      await expect(manager.storeFile(buffer, {
        originalName: "text.txt",
        mimeType: "text/plain"
      })).rejects.toThrow("File validation failed");
    } finally {
      manager.close();
      cleanupTest();
    }
  });

  test("should detect duplicate files", async () => {
    setupTest();
    
    const manager = new FileStorageManager({
      baseDir: testStorageDir,
      backend: "local"
    });

    try {
      const content = "duplicate test content";
      const buffer = Buffer.from(content);

      const fileRef1 = await manager.storeFile(buffer, {
        originalName: "original.txt",
        mimeType: "text/plain"
      });

      const fileRef2 = await manager.storeFile(buffer, {
        originalName: "duplicate.txt",
        mimeType: "text/plain"
      });

      expect(fileRef2.isDuplicate).toBe(true);
      expect(fileRef1.id).toBe(fileRef2.id);
    } finally {
      manager.close();
      cleanupTest();
    }
  });

  test("should delete files", async () => {
    setupTest();
    
    const manager = new FileStorageManager({
      baseDir: testStorageDir,
      backend: "local"
    });

    try {
      const buffer = Buffer.from("delete test");
      
      const fileRef = await manager.storeFile(buffer, {
        originalName: "delete.txt",
        mimeType: "text/plain"
      });

      const deleted = await manager.deleteFile(fileRef.id);
      expect(deleted).toBe(true);

      await expect(manager.getFile(fileRef.id)).rejects.toThrow("File not found");
    } finally {
      manager.close();
      cleanupTest();
    }
  });

  test("should handle non-existent files", async () => {
    setupTest();
    
    const manager = new FileStorageManager({
      baseDir: testStorageDir,
      backend: "local"
    });

    try {
      await expect(manager.getFile("non-existent-id"))
        .rejects.toThrow("File not found");

      await expect(manager.getFileMetadata("non-existent-id"))
        .rejects.toThrow("File not found");

      const result = await manager.deleteFile("non-existent-id");
      expect(result).toBe(false);
    } finally {
      manager.close();
      cleanupTest();
    }
  });
});