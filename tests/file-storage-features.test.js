import { describe, test, expect } from "bun:test";
import { FileStorageManager } from "../lib/file-storage.js";

describe("FileStorageManager Features", () => {
  test("should create event file references without database", () => {
    // Test the event file reference creation logic without storing files
    const manager = new FileStorageManager();
    
    const mockFileRef = {
      id: "test-file-id",
      originalName: "test.txt",
      size: 100,
      mimeType: "text/plain",
      checksum: "abc123",
      version: 1
    };

    const eventRef = manager.createEventFileReference(mockFileRef);
    
    expect(eventRef.type).toBe("file_reference");
    expect(eventRef.fileId).toBe("test-file-id");
    expect(eventRef.originalName).toBe("test.txt");
    expect(eventRef.size).toBe(100);
    expect(eventRef.mimeType).toBe("text/plain");
    expect(eventRef.checksum).toBe("abc123");
    expect(eventRef.version).toBe(1);
    
    manager.close();
  });

  test("should extract file references from complex event data", () => {
    const manager = new FileStorageManager();
    
    const eventData = {
      cmd: "processDocuments",
      data: {
        primaryFile: {
          type: "file_reference",
          fileId: "file-1",
          originalName: "document.pdf"
        },
        attachments: [
          {
            type: "file_reference", 
            fileId: "file-2",
            originalName: "attachment1.jpg"
          },
          {
            type: "file_reference",
            fileId: "file-3", 
            originalName: "attachment2.png"
          }
        ],
        metadata: {
          thumbnail: {
            type: "file_reference",
            fileId: "file-4",
            originalName: "thumb.jpg"
          }
        },
        nonFileData: {
          description: "This is not a file reference",
          count: 42
        }
      }
    };

    const refs = manager.extractFileReferences(eventData);
    
    expect(refs).toHaveLength(4);
    expect(refs.map(r => r.fileId)).toEqual(["file-1", "file-2", "file-3", "file-4"]);
    expect(refs.map(r => r.originalName)).toEqual([
      "document.pdf",
      "attachment1.jpg", 
      "attachment2.png",
      "thumb.jpg"
    ]);
    
    manager.close();
  });

  test("should handle invalid file references", async () => {
    const manager = new FileStorageManager();
    
    // Test truly invalid references that should throw "Invalid file reference"
    const invalidRefs = [
      null,
      undefined,
      { type: "not_file_reference" },
      { fileId: "missing-type" }, // has fileId but wrong type
    ];

    for (const invalidRef of invalidRefs) {
      await expect(manager.resolveEventFileReference(invalidRef))
        .rejects.toThrow("Invalid file reference");
    }

    // Test valid format but non-existent file (throws "File not found")
    const validFormatNonExistentFile = { 
      type: "file_reference", 
      fileId: "non-existent-id" 
    };
    await expect(manager.resolveEventFileReference(validFormatNonExistentFile))
      .rejects.toThrow("File not found");
    
    manager.close();
  });

  test("should validate configuration options", () => {
    // Test with default options
    const manager1 = new FileStorageManager();
    expect(manager1.backend).toBe("local");
    expect(manager1.maxFileSize).toBe(104857600);
    expect(manager1.allowedTypes).toBe(null);
    manager1.close();

    // Test with custom options
    const manager2 = new FileStorageManager({
      backend: "local",
      maxFileSize: 1048576,
      allowedTypes: ["text/plain", "application/json"]
    });
    expect(manager2.backend).toBe("local");
    expect(manager2.maxFileSize).toBe(1048576);
    expect(manager2.allowedTypes).toEqual(["text/plain", "application/json"]);
    manager2.close();
  });

  test("should find orphaned files with no references", async () => {
    const manager = new FileStorageManager();
    
    // Mock the database query to return some files
    const mockFiles = [
      { id: "file-1", original_name: "file1.txt", size: 100, created_at: Date.now() },
      { id: "file-2", original_name: "file2.txt", size: 200, created_at: Date.now() },
      { id: "file-3", original_name: "file3.txt", size: 300, created_at: Date.now() }
    ];
    
    // Mock the getAllFiles query
    manager._queries = {
      getAllFiles: {
        all: () => mockFiles
      }
    };

    const referencedFileIds = ["file-1"]; // Only file-1 is referenced
    const orphaned = await manager.findOrphanedFiles(referencedFileIds);
    
    expect(orphaned).toHaveLength(2);
    expect(orphaned.map(f => f.id)).toEqual(["file-2", "file-3"]);
    
    manager.close();
  });

  test("should find no orphaned files when all are referenced", async () => {
    const manager = new FileStorageManager();
    
    const mockFiles = [
      { id: "file-1", original_name: "file1.txt", size: 100, created_at: Date.now() },
      { id: "file-2", original_name: "file2.txt", size: 200, created_at: Date.now() }
    ];
    
    manager._queries = {
      getAllFiles: {
        all: () => mockFiles
      }
    };

    const referencedFileIds = ["file-1", "file-2"]; // All files are referenced
    const orphaned = await manager.findOrphanedFiles(referencedFileIds);
    
    expect(orphaned).toHaveLength(0);
    
    manager.close();
  });

  test("should handle empty file reference extraction", () => {
    const manager = new FileStorageManager();
    
    const eventDataWithoutFiles = {
      cmd: "processData",
      data: {
        text: "no files here",
        number: 42,
        array: [1, 2, 3],
        nested: {
          value: "still no files"
        }
      }
    };

    const refs = manager.extractFileReferences(eventDataWithoutFiles);
    expect(refs).toHaveLength(0);
    
    manager.close();
  });

  test("should handle null and undefined event data", () => {
    const manager = new FileStorageManager();
    
    expect(manager.extractFileReferences(null)).toHaveLength(0);
    expect(manager.extractFileReferences(undefined)).toHaveLength(0);
    expect(manager.extractFileReferences({})).toHaveLength(0);
    
    manager.close();
  });
});