import { describe, test, expect } from "bun:test";
import { FileProcessor } from "../lib/file-processor.js";

describe("FileProcessor", () => {
  const processor = new FileProcessor({
    maxFileSize: 1048576,
    allowedTypes: ["text/plain", "application/json"],
    enableDeepValidation: true
  });

  describe("File Type Detection", () => {
    test("should detect text files", () => {
      const buffer = Buffer.from("This is plain text content");
      const type = processor.detectFileType(buffer);
      expect(type).toBe("text/plain");
    });

    test("should detect JPEG images", () => {
      // JPEG magic bytes: FF D8 FF
      const buffer = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46]);
      const type = processor.detectFileType(buffer);
      expect(type).toBe("image/jpeg");
    });

    test("should detect PNG images", () => {
      // PNG magic bytes: 89 50 4E 47 0D 0A 1A 0A
      const buffer = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
      const type = processor.detectFileType(buffer);
      expect(type).toBe("image/png");
    });

    test("should detect PDF files", () => {
      // PDF magic bytes: 25 50 44 46 (%PDF)
      const buffer = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2D, 0x31, 0x2E, 0x34]);
      const type = processor.detectFileType(buffer);
      expect(type).toBe("application/pdf");
    });

    test("should return null for unknown types", () => {
      const buffer = Buffer.from([0x00, 0x01, 0x02, 0x03]);
      const type = processor.detectFileType(buffer);
      expect(type).toBe("application/octet-stream");
    });

    test("should handle empty buffers", () => {
      const buffer = Buffer.alloc(0);
      const type = processor.detectFileType(buffer);
      expect(type).toBe(null);
    });
  });

  describe("File Validation", () => {
    test("should validate good files", async () => {
      const buffer = Buffer.from("Valid file content");
      const metadata = {
        originalName: "valid.txt",
        mimeType: "text/plain"
      };

      const result = await processor.validateFile(buffer, metadata);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.actualSize).toBe(18);
    });

    test("should reject empty files", async () => {
      const buffer = Buffer.alloc(0);
      const metadata = {
        originalName: "empty.txt",
        mimeType: "text/plain"
      };

      const result = await processor.validateFile(buffer, metadata);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain("File is empty");
    });

    test("should reject oversized files", async () => {
      const bigProcessor = new FileProcessor({ maxFileSize: 10 });
      const buffer = Buffer.from("This is too large");
      const metadata = {
        originalName: "large.txt",
        mimeType: "text/plain"
      };

      const result = await bigProcessor.validateFile(buffer, metadata);
      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain("exceeds maximum allowed size");
    });

    test("should reject disallowed types", async () => {
      const buffer = Buffer.from("image data");
      const metadata = {
        originalName: "image.jpg",
        mimeType: "image/jpeg"
      };

      const result = await processor.validateFile(buffer, metadata);
      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain("is not allowed");
    });
  });

  describe("Text Extraction", () => {
    test("should extract text from plain text files", async () => {
      const content = "This is test content";
      const buffer = Buffer.from(content);

      const result = await processor.extractTextContent(buffer, "text/plain");
      expect(result.success).toBe(true);
      expect(result.text).toBe(content);
      expect(result.error).toBe(null);
    });

    test("should extract text from JSON files", async () => {
      const jsonContent = '{"name": "test", "value": 123}';
      const buffer = Buffer.from(jsonContent);

      const result = await processor.extractTextContent(buffer, "application/json");
      expect(result.success).toBe(true);
      expect(result.text).toBe(jsonContent);
    });

    test("should handle unsupported formats", async () => {
      const buffer = Buffer.from("binary data");

      const result = await processor.extractTextContent(buffer, "application/octet-stream");
      expect(result.success).toBe(false);
      expect(result.error).toContain("not supported");
    });
  });

  describe("Security Validation", () => {
    test("should detect potentially dangerous content", async () => {
      const dangerousContent = "<script>alert('xss')</script>";
      const buffer = Buffer.from(dangerousContent);
      const metadata = {
        originalName: "danger.html",
        mimeType: "text/html"
      };

      const result = await processor.validateContentSecurity(buffer, metadata);
      expect(result.safe).toBe(true); // HTML is not in dangerous types list
      expect(result.risks).toHaveLength(1); // But contains suspicious patterns
    });

    test("should flag executable file types", async () => {
      const buffer = Buffer.from("executable content");
      const metadata = {
        originalName: "malware.exe",
        mimeType: "application/x-msdownload"
      };

      const result = await processor.validateContentSecurity(buffer, metadata);
      expect(result.safe).toBe(false);
      expect(result.risks[0]).toContain("executable file type");
    });

    test("should pass safe content", async () => {
      const buffer = Buffer.from("This is safe content");
      const metadata = {
        originalName: "safe.txt",
        mimeType: "text/plain"
      };

      const result = await processor.validateContentSecurity(buffer, metadata);
      expect(result.safe).toBe(true);
      expect(result.risks).toHaveLength(0);
    });
  });

  describe("Hash Generation", () => {
    test("should generate single hash", () => {
      const buffer = Buffer.from("test content");
      const hash = processor.calculateFileHash(buffer);
      expect(hash).toBeDefined();
      expect(hash).toHaveLength(64); // SHA256 hex length
    });

    test("should generate multiple hashes", () => {
      const buffer = Buffer.from("test content");
      const hashes = processor.generateFileHashes(buffer);

      expect(hashes.md5).toBeDefined();
      expect(hashes.sha1).toBeDefined();
      expect(hashes.sha256).toBeDefined();
      expect(hashes.sha512).toBeDefined();

      expect(hashes.md5).toHaveLength(32);
      expect(hashes.sha1).toHaveLength(40);
      expect(hashes.sha256).toHaveLength(64);
      expect(hashes.sha512).toHaveLength(128);
    });

    test("should generate consistent hashes", () => {
      const buffer = Buffer.from("consistent content");
      const hash1 = processor.calculateFileHash(buffer);
      const hash2 = processor.calculateFileHash(buffer);
      expect(hash1).toBe(hash2);
    });

    test("should generate different hashes for different content", () => {
      const buffer1 = Buffer.from("content 1");
      const buffer2 = Buffer.from("content 2");
      const hash1 = processor.calculateFileHash(buffer1);
      const hash2 = processor.calculateFileHash(buffer2);
      expect(hash1).not.toBe(hash2);
    });
  });

  describe("MIME Type Compatibility", () => {
    test("should validate compatible types", () => {
      const compatible = processor.isCompatibleMimeType("text/plain", "text/plain");
      expect(compatible).toBe(true);
    });

    test("should accept application/octet-stream for text", () => {
      const compatible = processor.isCompatibleMimeType("text/plain", "application/octet-stream");
      expect(compatible).toBe(true);
    });

    test("should reject incompatible types", () => {
      const compatible = processor.isCompatibleMimeType("text/plain", "image/jpeg");
      expect(compatible).toBe(false);
    });
  });

  describe("Pattern Matching", () => {
    test("should match file signatures correctly", () => {
      const header = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]);
      const signature = [0xFF, 0xD8, 0xFF];
      const matches = processor.matchesSignature(header, signature);
      expect(matches).toBe(true);
    });

    test("should reject non-matching signatures", () => {
      const header = Buffer.from([0x89, 0x50, 0x4E, 0x47]);
      const signature = [0xFF, 0xD8, 0xFF];
      const matches = processor.matchesSignature(header, signature);
      expect(matches).toBe(false);
    });

    test("should handle short headers", () => {
      const header = Buffer.from([0xFF]);
      const signature = [0xFF, 0xD8, 0xFF];
      const matches = processor.matchesSignature(header, signature);
      expect(matches).toBe(false);
    });
  });

  describe("Text Detection", () => {
    test("should identify text content", () => {
      const buffer = Buffer.from("This is clearly text content with normal characters.");
      const isText = processor.isProbablyText(buffer);
      expect(isText).toBe(true);
    });

    test("should identify binary content", () => {
      const buffer = Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0xFF, 0xFE]);
      const isText = processor.isProbablyText(buffer);
      expect(isText).toBe(false);
    });

    test("should handle mixed content", () => {
      const buffer = Buffer.from("Text with some \x00\x01 binary chars");
      const isText = processor.isProbablyText(buffer);
      expect(isText).toBe(false); // Binary chars make it fail text detection
    });
  });
});