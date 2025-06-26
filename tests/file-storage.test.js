import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { FileStorageManager } from "../lib/file-storage.js";
import { existsSync, rmSync, mkdirSync, writeFileSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { createHash } from "crypto";

describe("FileStorageManager", () => {
  const testStorageDir = join("tests", "data", "file-storage");
  const testFile = join(testStorageDir, "test-file.txt");
  const testContent = "This is a test file content";
  let fileManager;

  beforeEach(() => {
    // Ensure the storage directory exists
    if (!existsSync(testStorageDir)) {
      mkdirSync(testStorageDir, { recursive: true });
    }

    // Clean up any existing test files
    if (existsSync(testFile)) {
      rmSync(testFile);
    }

    // Initialize FileStorageManager
    fileManager = new FileStorageManager({
      baseDir: testStorageDir,
      backend: "local"
    });
  });

  afterEach(() => {
    // Close database connection first
    if (fileManager && fileManager.close) {
      fileManager.close();
    }
    
    // Clean up test files after each test
    if (existsSync(testStorageDir)) {
      rmSync(testStorageDir, { recursive: true });
    }
  });

  describe("Basic initialization", () => {
    test("should create FileStorageManager with default options", () => {
      const manager = new FileStorageManager();
      
      expect(manager).toBeDefined();
      expect(manager.baseDir).toBeDefined();
      expect(manager.backend).toBe("local");
      
      // Clean up
      manager.close();
    });

    test("should create FileStorageManager with custom options", () => {
      const options = {
        baseDir: "/custom/path",
        backend: "local",
        maxFileSize: 10485760, // 10MB
        allowedTypes: ["image/jpeg", "image/png", "application/pdf"]
      };
      
      const manager = new FileStorageManager(options);
      
      expect(manager.baseDir).toBe("/custom/path");
      expect(manager.backend).toBe("local");
      expect(manager.maxFileSize).toBe(10485760);
      expect(manager.allowedTypes).toEqual(["image/jpeg", "image/png", "application/pdf"]);
      
      // Clean up
      manager.close();
    });
  });

  describe("File storage operations", () => {
    test("should store a file and return file reference", async () => {
      const buffer = Buffer.from(testContent);
      const metadata = {
        originalName: "test.txt",
        mimeType: "text/plain"
      };

      const fileRef = await fileManager.storeFile(buffer, metadata);

      expect(fileRef).toBeDefined();
      expect(fileRef.id).toBeDefined();
      expect(fileRef.path).toBeDefined();
      expect(fileRef.size).toBe(buffer.length);
      expect(fileRef.mimeType).toBe("text/plain");
      expect(fileRef.checksum).toBeDefined();
      expect(fileRef.createdAt).toBeDefined();
      expect(fileRef.originalName).toBe("test.txt");
    });

    test("should retrieve stored file", async () => {
      const buffer = Buffer.from(testContent);
      const metadata = { originalName: "test.txt", mimeType: "text/plain" };

      const fileRef = await fileManager.storeFile(buffer, metadata);
      const retrievedBuffer = await fileManager.getFile(fileRef.id);

      expect(retrievedBuffer).toEqual(buffer);
    });

    test("should get file metadata", async () => {
      const buffer = Buffer.from(testContent);
      const metadata = { originalName: "test.txt", mimeType: "text/plain" };

      const fileRef = await fileManager.storeFile(buffer, metadata);
      const retrievedMetadata = await fileManager.getFileMetadata(fileRef.id);

      expect(retrievedMetadata.id).toBe(fileRef.id);
      expect(retrievedMetadata.size).toBe(buffer.length);
      expect(retrievedMetadata.mimeType).toBe("text/plain");
      expect(retrievedMetadata.originalName).toBe("test.txt");
    });

    test("should delete a file", async () => {
      const buffer = Buffer.from(testContent);
      const metadata = { originalName: "test.txt", mimeType: "text/plain" };

      const fileRef = await fileManager.storeFile(buffer, metadata);
      const deleted = await fileManager.deleteFile(fileRef.id);

      expect(deleted).toBe(true);
      
      // Should throw error when trying to retrieve deleted file
      expect(async () => {
        await fileManager.getFile(fileRef.id);
      }).toThrow();
    });
  });

  describe("File validation", () => {
    test("should validate file size", async () => {
      const manager = new FileStorageManager({
        baseDir: testStorageDir,
        maxFileSize: 10 // Very small size for testing
      });

      const largeBuffer = Buffer.from("a".repeat(20));
      const metadata = { originalName: "large.txt", mimeType: "text/plain" };

      expect(async () => {
        await manager.storeFile(largeBuffer, metadata);
      }).toThrow("File size exceeds maximum allowed size");
    });

    test("should validate file types", async () => {
      const manager = new FileStorageManager({
        baseDir: testStorageDir,
        allowedTypes: ["image/jpeg", "image/png"]
      });

      const buffer = Buffer.from(testContent);
      const metadata = { originalName: "test.txt", mimeType: "text/plain" };

      expect(async () => {
        await manager.storeFile(buffer, metadata);
      }).toThrow("File type not allowed");
    });

    test("should calculate correct checksum", async () => {
      const buffer = Buffer.from(testContent);
      const metadata = { originalName: "test.txt", mimeType: "text/plain" };
      
      const expectedChecksum = createHash('sha256').update(buffer).digest('hex');
      const fileRef = await fileManager.storeFile(buffer, metadata);

      expect(fileRef.checksum).toBe(expectedChecksum);
    });
  });

  describe("File references for events", () => {
    test("should generate event-compatible file reference", async () => {
      const buffer = Buffer.from(testContent);
      const metadata = { originalName: "test.txt", mimeType: "text/plain" };

      const fileRef = await fileManager.storeFile(buffer, metadata);
      const eventRef = fileManager.createEventFileReference(fileRef);

      expect(eventRef).toBeDefined();
      expect(eventRef.type).toBe("file_reference");
      expect(eventRef.fileId).toBe(fileRef.id);
      expect(eventRef.originalName).toBe("test.txt");
      expect(eventRef.size).toBe(buffer.length);
      expect(eventRef.mimeType).toBe("text/plain");
    });

    test("should resolve file reference from event data", async () => {
      const buffer = Buffer.from(testContent);
      const metadata = { originalName: "test.txt", mimeType: "text/plain" };

      const fileRef = await fileManager.storeFile(buffer, metadata);
      const eventRef = fileManager.createEventFileReference(fileRef);
      
      const resolvedFile = await fileManager.resolveEventFileReference(eventRef);

      expect(resolvedFile).toEqual(buffer);
    });
  });

  describe("File cleanup and garbage collection", () => {
    test("should list orphaned files", async () => {
      const buffer = Buffer.from(testContent);
      const metadata = { originalName: "test.txt", mimeType: "text/plain" };

      const fileRef = await fileManager.storeFile(buffer, metadata);
      
      // Mock orphaned files (files not referenced in events)
      const orphanedFiles = await fileManager.findOrphanedFiles([]);

      expect(Array.isArray(orphanedFiles)).toBe(true);
      expect(orphanedFiles.some(file => file.id === fileRef.id)).toBe(true);
    });

    test("should clean up orphaned files", async () => {
      const buffer = Buffer.from(testContent);
      const metadata = { originalName: "test.txt", mimeType: "text/plain" };

      const fileRef = await fileManager.storeFile(buffer, metadata);
      const deletedCount = await fileManager.cleanupOrphanedFiles([]);

      expect(deletedCount).toBe(1);
      
      // File should be deleted
      expect(async () => {
        await fileManager.getFile(fileRef.id);
      }).toThrow();
    });

    test("should not clean up referenced files", async () => {
      const buffer = Buffer.from(testContent);
      const metadata = { originalName: "test.txt", mimeType: "text/plain" };

      const fileRef = await fileManager.storeFile(buffer, metadata);
      const eventRef = fileManager.createEventFileReference(fileRef);
      
      // Simulate file being referenced in events
      const referencedFileIds = [eventRef.fileId];
      const deletedCount = await fileManager.cleanupOrphanedFiles(referencedFileIds);

      expect(deletedCount).toBe(0);
      
      // File should still exist
      const retrievedBuffer = await fileManager.getFile(fileRef.id);
      expect(retrievedBuffer).toEqual(buffer);
    });
  });

  describe("File versioning", () => {
    test("should create file versions", async () => {
      const buffer1 = Buffer.from("Version 1 content");
      const buffer2 = Buffer.from("Version 2 content");
      const metadata = { originalName: "versioned.txt", mimeType: "text/plain" };

      const fileRef1 = await fileManager.storeFile(buffer1, metadata);
      const fileRef2 = await fileManager.storeFileVersion(fileRef1.id, buffer2, metadata);

      expect(fileRef2.version).toBe(2);
      expect(fileRef2.parentId).toBe(fileRef1.id);
      
      const versions = await fileManager.getFileVersions(fileRef1.id);
      expect(versions).toHaveLength(2);
    });

    test("should get file history", async () => {
      const buffer1 = Buffer.from("Version 1");
      const buffer2 = Buffer.from("Version 2");
      const metadata = { originalName: "history.txt", mimeType: "text/plain" };

      const fileRef1 = await fileManager.storeFile(buffer1, metadata);
      const fileRef2 = await fileManager.storeFileVersion(fileRef1.id, buffer2, metadata);

      const history = await fileManager.getFileHistory(fileRef1.id);
      
      expect(history).toHaveLength(2);
      expect(history[0].version).toBe(1);
      expect(history[1].version).toBe(2);
    });
  });

  describe("Error handling", () => {
    test("should throw error for non-existent file", async () => {
      expect(async () => {
        await fileManager.getFile("non-existent-id");
      }).toThrow("File not found");
    });

    test("should throw error for invalid file metadata", async () => {
      const buffer = Buffer.from(testContent);
      
      expect(async () => {
        await fileManager.storeFile(buffer, null);
      }).toThrow("File metadata is required");
    });

    test("should throw error for empty buffer", async () => {
      const buffer = Buffer.alloc(0);
      const metadata = { originalName: "empty.txt", mimeType: "text/plain" };
      
      expect(async () => {
        await fileManager.storeFile(buffer, metadata);
      }).toThrow("File buffer cannot be empty");
    });
  });

  describe("Integration with event storage", () => {
    test("should create file reference suitable for event data", async () => {
      const buffer = Buffer.from(testContent);
      const metadata = { originalName: "event-file.txt", mimeType: "text/plain" };

      const fileRef = await fileManager.storeFile(buffer, metadata);
      const eventData = {
        cmd: "uploadFile",
        data: {
          file: fileManager.createEventFileReference(fileRef),
          description: "Test file upload"
        }
      };

      expect(eventData.data.file.type).toBe("file_reference");
      expect(eventData.data.file.fileId).toBe(fileRef.id);
      expect(eventData.data.file.originalName).toBe("event-file.txt");
    });

    test("should extract file references from event data", () => {
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

      const fileReferences = fileManager.extractFileReferences(eventData);
      
      expect(fileReferences).toHaveLength(1);
      expect(fileReferences[0].fileId).toBe("test-file-id");
      expect(fileReferences[0].originalName).toBe("test.txt");
    });
  });
});