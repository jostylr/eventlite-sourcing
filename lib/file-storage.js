import { Database } from "bun:sqlite";
import { existsSync, mkdirSync, writeFileSync, readFileSync, rmSync, readdirSync, statSync } from "fs";
import { join, extname, dirname } from "path";
import { createHash, randomUUID } from "crypto";

export class FileStorageManager {
  constructor(options = {}) {
    this.baseDir = options.baseDir || join(process.cwd(), "data", "files");
    this.backend = options.backend || "local";
    this.maxFileSize = options.maxFileSize || 104857600; // 100MB default
    this.allowedTypes = options.allowedTypes || null; // null = allow all types
    
    // Database for file metadata
    this.dbName = options.dbName || join(this.baseDir, "file-metadata.sqlite");
    
    // Ensure directories exist
    this._ensureDirectories();
    
    // Initialize database
    this._initDatabase();
  }

  _ensureDirectories() {
    if (!existsSync(this.baseDir)) {
      mkdirSync(this.baseDir, { recursive: true });
    }
    
    const metadataDir = dirname(this.dbName);
    if (!existsSync(metadataDir)) {
      mkdirSync(metadataDir, { recursive: true });
    }
  }

  _initDatabase() {
    this.db = new Database(this.dbName);
    
    // Create file metadata table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS file_metadata (
        id TEXT PRIMARY KEY,
        original_name TEXT NOT NULL,
        file_path TEXT NOT NULL,
        size INTEGER NOT NULL,
        mime_type TEXT NOT NULL,
        checksum TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        version INTEGER DEFAULT 1,
        parent_id TEXT,
        metadata TEXT,
        FOREIGN KEY (parent_id) REFERENCES file_metadata (id)
      )
    `);

    // Create indexes for better performance
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_file_checksum ON file_metadata (checksum)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_file_parent ON file_metadata (parent_id)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_file_created ON file_metadata (created_at)`);

    // Prepare queries
    this._queries = {
      insertFile: this.db.prepare(`
        INSERT INTO file_metadata (id, original_name, file_path, size, mime_type, checksum, created_at, version, parent_id, metadata)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `),
      getFileById: this.db.prepare(`SELECT * FROM file_metadata WHERE id = ?`),
      getFilesByParent: this.db.prepare(`SELECT * FROM file_metadata WHERE parent_id = ? ORDER BY version ASC`),
      getFileVersions: this.db.prepare(`
        SELECT * FROM file_metadata 
        WHERE id = ? OR parent_id = ? 
        ORDER BY version ASC
      `),
      deleteFile: this.db.prepare(`DELETE FROM file_metadata WHERE id = ?`),
      getAllFiles: this.db.prepare(`SELECT * FROM file_metadata ORDER BY created_at DESC`),
      getFilesByChecksum: this.db.prepare(`SELECT * FROM file_metadata WHERE checksum = ?`)
    };
  }

  async storeFile(buffer, metadata) {
    if (!buffer || buffer.length === 0) {
      throw new Error("File buffer cannot be empty");
    }

    if (!metadata) {
      throw new Error("File metadata is required");
    }

    if (!metadata.originalName) {
      throw new Error("Original filename is required");
    }

    if (!metadata.mimeType) {
      throw new Error("MIME type is required");
    }

    // Validate file size
    if (buffer.length > this.maxFileSize) {
      throw new Error(`File size exceeds maximum allowed size of ${this.maxFileSize} bytes`);
    }

    // Validate file type
    if (this.allowedTypes && !this.allowedTypes.includes(metadata.mimeType)) {
      throw new Error("File type not allowed");
    }

    // Generate unique file ID
    const fileId = randomUUID();
    
    // Calculate checksum
    const checksum = createHash('sha256').update(buffer).digest('hex');
    
    // Check for duplicate files
    const existingFile = this._queries.getFilesByChecksum.get(checksum);
    if (existingFile) {
      // Return reference to existing file instead of storing duplicate
      return {
        id: existingFile.id,
        path: existingFile.file_path,
        size: existingFile.size,
        mimeType: existingFile.mime_type,
        checksum: existingFile.checksum,
        createdAt: existingFile.created_at,
        originalName: existingFile.original_name,
        version: existingFile.version,
        isDuplicate: true
      };
    }

    // Generate file path based on date structure for organization
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    
    const fileDir = join(this.baseDir, String(year), month, day);
    if (!existsSync(fileDir)) {
      mkdirSync(fileDir, { recursive: true });
    }

    // Generate unique filename
    const extension = extname(metadata.originalName);
    const filename = `${fileId}${extension}`;
    const filePath = join(fileDir, filename);

    try {
      // Write file to disk
      writeFileSync(filePath, buffer);

      // Store metadata in database
      const createdAt = Date.now();
      this._queries.insertFile.run(
        fileId,
        metadata.originalName,
        filePath,
        buffer.length,
        metadata.mimeType,
        checksum,
        createdAt,
        1, // version
        null, // parent_id
        JSON.stringify(metadata.additionalMetadata || {})
      );

      return {
        id: fileId,
        path: filePath,
        size: buffer.length,
        mimeType: metadata.mimeType,
        checksum,
        createdAt,
        originalName: metadata.originalName,
        version: 1
      };
    } catch (error) {
      // Clean up file if database operation fails
      if (existsSync(filePath)) {
        rmSync(filePath);
      }
      throw new Error(`Failed to store file: ${error.message}`);
    }
  }

  async getFile(fileId) {
    const fileMetadata = this._queries.getFileById.get(fileId);
    
    if (!fileMetadata) {
      throw new Error("File not found");
    }

    if (!existsSync(fileMetadata.file_path)) {
      throw new Error("File data not found on disk");
    }

    try {
      return readFileSync(fileMetadata.file_path);
    } catch (error) {
      throw new Error(`Failed to read file: ${error.message}`);
    }
  }

  async getFileMetadata(fileId) {
    const fileMetadata = this._queries.getFileById.get(fileId);
    
    if (!fileMetadata) {
      throw new Error("File not found");
    }

    return {
      id: fileMetadata.id,
      originalName: fileMetadata.original_name,
      path: fileMetadata.file_path,
      size: fileMetadata.size,
      mimeType: fileMetadata.mime_type,
      checksum: fileMetadata.checksum,
      createdAt: fileMetadata.created_at,
      version: fileMetadata.version,
      parentId: fileMetadata.parent_id,
      additionalMetadata: JSON.parse(fileMetadata.metadata || '{}')
    };
  }

  async deleteFile(fileId) {
    const fileMetadata = this._queries.getFileById.get(fileId);
    
    if (!fileMetadata) {
      return false;
    }

    try {
      // Delete file from disk
      if (existsSync(fileMetadata.file_path)) {
        rmSync(fileMetadata.file_path);
      }

      // Delete metadata from database
      this._queries.deleteFile.run(fileId);
      
      return true;
    } catch (error) {
      throw new Error(`Failed to delete file: ${error.message}`);
    }
  }

  async storeFileVersion(parentId, buffer, metadata) {
    const parentFile = this._queries.getFileById.get(parentId);
    
    if (!parentFile) {
      throw new Error("Parent file not found");
    }

    // Get the highest version number for this file family
    const versions = this._queries.getFileVersions.all(parentId, parentId);
    const maxVersion = Math.max(...versions.map(v => v.version));
    
    // Store as new version
    const fileId = randomUUID();
    const checksum = createHash('sha256').update(buffer).digest('hex');
    
    // Generate file path
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    
    const fileDir = join(this.baseDir, String(year), month, day);
    if (!existsSync(fileDir)) {
      mkdirSync(fileDir, { recursive: true });
    }

    const extension = extname(metadata.originalName);
    const filename = `${fileId}${extension}`;
    const filePath = join(fileDir, filename);

    try {
      // Write file to disk
      writeFileSync(filePath, buffer);

      // Store metadata in database
      const createdAt = Date.now();
      this._queries.insertFile.run(
        fileId,
        metadata.originalName,
        filePath,
        buffer.length,
        metadata.mimeType,
        checksum,
        createdAt,
        maxVersion + 1,
        parentId,
        JSON.stringify(metadata.additionalMetadata || {})
      );

      return {
        id: fileId,
        path: filePath,
        size: buffer.length,
        mimeType: metadata.mimeType,
        checksum,
        createdAt,
        originalName: metadata.originalName,
        version: maxVersion + 1,
        parentId
      };
    } catch (error) {
      // Clean up file if database operation fails
      if (existsSync(filePath)) {
        rmSync(filePath);
      }
      throw new Error(`Failed to store file version: ${error.message}`);
    }
  }

  async getFileVersions(fileId) {
    const versions = this._queries.getFileVersions.all(fileId, fileId);
    
    return versions.map(file => ({
      id: file.id,
      originalName: file.original_name,
      path: file.file_path,
      size: file.size,
      mimeType: file.mime_type,
      checksum: file.checksum,
      createdAt: file.created_at,
      version: file.version,
      parentId: file.parent_id
    }));
  }

  async getFileHistory(fileId) {
    return this.getFileVersions(fileId);
  }

  createEventFileReference(fileRef) {
    return {
      type: "file_reference",
      fileId: fileRef.id,
      originalName: fileRef.originalName,
      size: fileRef.size,
      mimeType: fileRef.mimeType,
      checksum: fileRef.checksum,
      version: fileRef.version || 1
    };
  }

  async resolveEventFileReference(eventRef) {
    if (!eventRef || eventRef.type !== "file_reference") {
      throw new Error("Invalid file reference");
    }

    return this.getFile(eventRef.fileId);
  }

  extractFileReferences(eventData) {
    const references = [];
    
    const extractFromObject = (obj) => {
      if (typeof obj !== 'object' || obj === null) return;
      
      if (obj.type === "file_reference" && obj.fileId) {
        references.push(obj);
      }
      
      for (const value of Object.values(obj)) {
        if (Array.isArray(value)) {
          value.forEach(item => extractFromObject(item));
        } else if (typeof value === 'object' && value !== null) {
          extractFromObject(value);
        }
      }
    };
    
    extractFromObject(eventData);
    return references;
  }

  async findOrphanedFiles(referencedFileIds = []) {
    const allFiles = this._queries.getAllFiles.all();
    const referencedSet = new Set(referencedFileIds);
    
    return allFiles.filter(file => !referencedSet.has(file.id)).map(file => ({
      id: file.id,
      originalName: file.original_name,
      path: file.file_path,
      size: file.size,
      createdAt: file.created_at
    }));
  }

  async cleanupOrphanedFiles(referencedFileIds = []) {
    const orphanedFiles = await this.findOrphanedFiles(referencedFileIds);
    let deletedCount = 0;
    
    for (const file of orphanedFiles) {
      try {
        const deleted = await this.deleteFile(file.id);
        if (deleted) {
          deletedCount++;
        }
      } catch (error) {
        console.warn(`Failed to delete orphaned file ${file.id}: ${error.message}`);
      }
    }
    
    return deletedCount;
  }

  async getStorageStats() {
    const allFiles = this._queries.getAllFiles.all();
    
    const totalFiles = allFiles.length;
    const totalSize = allFiles.reduce((sum, file) => sum + file.size, 0);
    const uniqueFiles = new Set(allFiles.map(file => file.checksum)).size;
    
    return {
      totalFiles,
      totalSize,
      uniqueFiles,
      duplicateFiles: totalFiles - uniqueFiles,
      backend: this.backend,
      baseDir: this.baseDir
    };
  }

  close() {
    if (this.db) {
      this.db.close();
    }
  }
}