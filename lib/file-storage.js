import { Database } from "bun:sqlite";
import { existsSync, mkdirSync, writeFileSync, readFileSync, rmSync, readdirSync, statSync } from "fs";
import { join, extname, dirname } from "path";
import { createHash, randomUUID } from "crypto";
import { FileProcessor } from "./file-processor.js";

export class FileStorageManager {
  constructor(options = {}) {
    this.baseDir = options.baseDir || join(process.cwd(), "data", "files");
    this.backend = options.backend || "local";
    this.maxFileSize = options.maxFileSize || 104857600; // 100MB default
    this.allowedTypes = options.allowedTypes || null; // null = allow all types
    
    // Database for file metadata
    this.dbName = options.dbName || join(this.baseDir, "file-metadata.sqlite");
    
    // Initialize file processor
    this.processor = new FileProcessor({
      maxFileSize: this.maxFileSize,
      allowedTypes: this.allowedTypes,
      virusScanEnabled: options.virusScanEnabled || false,
      enableDeepValidation: options.enableDeepValidation || true
    });
    
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
    
    // Create file metadata table with basic schema first
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

    // Add new columns if they don't exist (for backward compatibility)
    try {
      this.db.run(`ALTER TABLE file_metadata ADD COLUMN owner_id TEXT`);
    } catch (e) {
      // Column already exists, ignore
    }
    
    try {
      this.db.run(`ALTER TABLE file_metadata ADD COLUMN expires_at INTEGER`);
    } catch (e) {
      // Column already exists, ignore
    }
    
    try {
      this.db.run(`ALTER TABLE file_metadata ADD COLUMN retention_policy TEXT`);
    } catch (e) {
      // Column already exists, ignore
    }

    // Create file permissions table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS file_permissions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        file_id TEXT NOT NULL,
        user_id TEXT,
        group_id TEXT,
        permission_type TEXT NOT NULL,
        granted_at INTEGER NOT NULL,
        granted_by TEXT,
        expires_at INTEGER,
        FOREIGN KEY (file_id) REFERENCES file_metadata (id) ON DELETE CASCADE
      )
    `);

    // Create indexes for better performance
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_file_checksum ON file_metadata (checksum)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_file_parent ON file_metadata (parent_id)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_file_created ON file_metadata (created_at)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_file_owner ON file_metadata (owner_id)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_file_expires ON file_metadata (expires_at)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_permissions_file ON file_permissions (file_id)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_permissions_user ON file_permissions (user_id)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_permissions_type ON file_permissions (permission_type)`);

    // Prepare queries
    this._queries = {
      insertFile: this.db.prepare(`
        INSERT INTO file_metadata (id, original_name, file_path, size, mime_type, checksum, created_at, version, parent_id, metadata, owner_id, expires_at, retention_policy)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      getFilesByChecksum: this.db.prepare(`SELECT * FROM file_metadata WHERE checksum = ?`),
      getExpiredFiles: this.db.prepare(`SELECT * FROM file_metadata WHERE expires_at IS NOT NULL AND expires_at < ?`),
      insertPermission: this.db.prepare(`
        INSERT INTO file_permissions (file_id, user_id, group_id, permission_type, granted_at, granted_by, expires_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `),
      getFilePermissions: this.db.prepare(`SELECT * FROM file_permissions WHERE file_id = ?`),
      getUserFilePermissions: this.db.prepare(`
        SELECT DISTINCT p.*, f.original_name 
        FROM file_permissions p 
        JOIN file_metadata f ON p.file_id = f.id 
        WHERE p.user_id = ? AND (p.expires_at IS NULL OR p.expires_at > ?)
      `),
      deletePermission: this.db.prepare(`DELETE FROM file_permissions WHERE id = ?`),
      checkUserPermission: this.db.prepare(`
        SELECT COUNT(*) as has_permission 
        FROM file_permissions 
        WHERE file_id = ? AND user_id = ? AND permission_type = ? 
        AND (expires_at IS NULL OR expires_at > ?)
      `)
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

    // Comprehensive file validation using FileProcessor
    const validationResult = await this.processor.validateFile(buffer, metadata);
    if (!validationResult.isValid) {
      throw new Error(`File validation failed: ${validationResult.errors.join(', ')}`);
    }

    // Update metadata with detected information
    if (validationResult.detectedType && validationResult.detectedType !== metadata.mimeType) {
      metadata.detectedMimeType = validationResult.detectedType;
      metadata.validationWarnings = validationResult.warnings;
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
      const expiresAt = metadata.expiresAt || null;
      const retentionPolicy = metadata.retentionPolicy || null;
      const ownerId = metadata.ownerId || null;
      
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
        JSON.stringify(metadata.additionalMetadata || {}),
        ownerId,
        expiresAt,
        retentionPolicy
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
      const expiresAt = metadata.expiresAt || null;
      const retentionPolicy = metadata.retentionPolicy || null;
      const ownerId = metadata.ownerId || parentFile.owner_id; // Inherit from parent if not specified
      
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
        JSON.stringify(metadata.additionalMetadata || {}),
        ownerId,
        expiresAt,
        retentionPolicy
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

  // Permission Management Methods
  async grantFilePermission(fileId, userId, permissionType, options = {}) {
    const { groupId = null, grantedBy = null, expiresAt = null } = options;
    
    try {
      this._queries.insertPermission.run(
        fileId,
        userId,
        groupId,
        permissionType,
        Date.now(),
        grantedBy,
        expiresAt
      );
      return true;
    } catch (error) {
      throw new Error(`Failed to grant permission: ${error.message}`);
    }
  }

  async revokeFilePermission(permissionId) {
    try {
      this._queries.deletePermission.run(permissionId);
      return true;
    } catch (error) {
      throw new Error(`Failed to revoke permission: ${error.message}`);
    }
  }

  async checkFilePermission(fileId, userId, permissionType) {
    const now = Date.now();
    const result = this._queries.checkUserPermission.get(fileId, userId, permissionType, now);
    return result.has_permission > 0;
  }

  async getUserFilePermissions(userId) {
    const now = Date.now();
    return this._queries.getUserFilePermissions.all(userId, now);
  }

  async getFilePermissions(fileId) {
    return this._queries.getFilePermissions.all(fileId);
  }

  // File Access Control
  async canUserAccessFile(fileId, userId, action = 'read') {
    const fileMetadata = this._queries.getFileById.get(fileId);
    if (!fileMetadata) {
      return false;
    }

    // Owner always has access
    if (fileMetadata.owner_id === userId) {
      return true;
    }

    // Check specific permissions
    return this.checkFilePermission(fileId, userId, action);
  }

  async getAccessibleFiles(userId, permissionType = 'read') {
    const now = Date.now();
    
    // Get files owned by user
    const ownedFiles = this._queries.getAllFiles.all().filter(file => file.owner_id === userId);
    
    // Get files with explicit permissions
    const permissions = this._queries.getUserFilePermissions.all(userId, now)
      .filter(p => p.permission_type === permissionType);
    
    const permittedFileIds = permissions.map(p => p.file_id);
    const permittedFiles = permittedFileIds.map(id => this._queries.getFileById.get(id)).filter(Boolean);
    
    // Combine and deduplicate
    const allAccessibleFiles = [...ownedFiles, ...permittedFiles];
    const uniqueFiles = allAccessibleFiles.filter((file, index, self) => 
      index === self.findIndex(f => f.id === file.id)
    );
    
    return uniqueFiles;
  }

  // Retention and Expiration Management
  async getExpiredFiles() {
    const now = Date.now();
    return this._queries.getExpiredFiles.all(now);
  }

  async cleanupExpiredFiles() {
    const expiredFiles = await this.getExpiredFiles();
    let deletedCount = 0;
    
    for (const file of expiredFiles) {
      try {
        const deleted = await this.deleteFile(file.id);
        if (deleted) {
          deletedCount++;
        }
      } catch (error) {
        console.warn(`Failed to delete expired file ${file.id}: ${error.message}`);
      }
    }
    
    return {
      deletedCount,
      totalExpired: expiredFiles.length
    };
  }

  async applyRetentionPolicy(fileId, policy) {
    let expiresAt = null;
    
    if (policy) {
      const now = Date.now();
      switch (policy) {
        case '1day':
          expiresAt = now + (24 * 60 * 60 * 1000);
          break;
        case '7days':
          expiresAt = now + (7 * 24 * 60 * 60 * 1000);
          break;
        case '30days':
          expiresAt = now + (30 * 24 * 60 * 60 * 1000);
          break;
        case '1year':
          expiresAt = now + (365 * 24 * 60 * 60 * 1000);
          break;
        default:
          if (typeof policy === 'number') {
            expiresAt = now + policy; // Custom milliseconds
          }
          break;
      }
    }
    
    // Update the file's expiration
    this.db.prepare(`
      UPDATE file_metadata 
      SET expires_at = ?, retention_policy = ? 
      WHERE id = ?
    `).run(expiresAt, policy, fileId);
    
    return expiresAt;
  }

  async getFilesByRetentionPolicy(policy) {
    return this.db.prepare(`
      SELECT * FROM file_metadata 
      WHERE retention_policy = ? 
      ORDER BY created_at DESC
    `).all(policy);
  }

  // File Processing Methods
  async validateFileContent(fileId) {
    const buffer = await this.getFile(fileId);
    const metadata = await this.getFileMetadata(fileId);
    
    return this.processor.validateFile(buffer, {
      originalName: metadata.originalName,
      mimeType: metadata.mimeType
    });
  }

  async extractTextContent(fileId) {
    const buffer = await this.getFile(fileId);
    const metadata = await this.getFileMetadata(fileId);
    
    return this.processor.extractTextContent(buffer, metadata.mimeType);
  }

  async generateThumbnail(fileId, options = {}) {
    const buffer = await this.getFile(fileId);
    const metadata = await this.getFileMetadata(fileId);
    
    const result = await this.processor.generateThumbnail(buffer, metadata.mimeType, options);
    
    if (result.success && result.processedBuffer) {
      // Store thumbnail as a new file
      const thumbnailMetadata = {
        originalName: `thumb_${metadata.originalName}`,
        mimeType: 'image/jpeg', // Assuming JPEG thumbnails
        ownerId: metadata.ownerId,
        additionalMetadata: {
          isThumbnail: true,
          sourceFileId: fileId,
          thumbnailSize: options
        }
      };
      
      const thumbnailRef = await this.storeFile(result.processedBuffer, thumbnailMetadata);
      return {
        ...result,
        thumbnailFileId: thumbnailRef.id
      };
    }
    
    return result;
  }

  async processImage(fileId, options = {}) {
    const buffer = await this.getFile(fileId);
    const metadata = await this.getFileMetadata(fileId);
    
    if (!metadata.mimeType.startsWith('image/')) {
      throw new Error('File is not an image');
    }
    
    return this.processor.processImage(buffer, options);
  }

  async validateContentSecurity(fileId) {
    const buffer = await this.getFile(fileId);
    const metadata = await this.getFileMetadata(fileId);
    
    return this.processor.validateContentSecurity(buffer, {
      originalName: metadata.originalName,
      mimeType: metadata.mimeType
    });
  }

  async generateFileHashes(fileId) {
    const buffer = await this.getFile(fileId);
    return this.processor.generateFileHashes(buffer);
  }

  async detectFileType(fileId) {
    const buffer = await this.getFile(fileId);
    return this.processor.detectFileType(buffer);
  }

  // Batch processing operations
  async processMultipleFiles(fileIds, operation, options = {}) {
    const results = [];
    
    for (const fileId of fileIds) {
      try {
        let result;
        switch (operation) {
          case 'validate':
            result = await this.validateFileContent(fileId);
            break;
          case 'extractText':
            result = await this.extractTextContent(fileId);
            break;
          case 'generateThumbnail':
            result = await this.generateThumbnail(fileId, options);
            break;
          case 'securityCheck':
            result = await this.validateContentSecurity(fileId);
            break;
          case 'detectType':
            result = await this.detectFileType(fileId);
            break;
          default:
            throw new Error(`Unknown operation: ${operation}`);
        }
        
        results.push({
          fileId,
          success: true,
          result
        });
      } catch (error) {
        results.push({
          fileId,
          success: false,
          error: error.message
        });
      }
    }
    
    return results;
  }

  close() {
    if (this.db) {
      try {
        this.db.close();
        this.db = null;
      } catch (error) {
        console.warn('Error closing database:', error.message);
      }
    }
  }
}