# File Storage Guide

EventLite Sourcing provides comprehensive file storage capabilities through the `FileStorageManager` and `FileProcessor` classes. This guide covers file management, permissions, retention policies, and processing features.

## Table of Contents

- [Overview](#overview)
- [Basic Usage](#basic-usage)
- [File Storage](#file-storage)
- [File Permissions](#file-permissions)
- [Retention Policies](#retention-policies)
- [File Processing](#file-processing)
- [Event Integration](#event-integration)
- [Security](#security)
- [Examples](#examples)

## Overview

The file storage system in EventLite Sourcing provides:

- **Local filesystem storage** with organized directory structure
- **SQLite-based metadata** tracking for all files
- **File versioning** with complete history
- **Access control** with user/group permissions
- **Retention policies** for automatic cleanup
- **File processing** including validation, type detection, and content extraction
- **Event sourcing integration** for audit trails

## Basic Usage

### Initialization

```javascript
import { FileStorageManager } from 'eventlite-sourcing';

const fileManager = new FileStorageManager({
  baseDir: './data/files',           // Storage directory
  maxFileSize: 104857600,            // 100MB limit
  allowedTypes: [                    // Optional MIME type restrictions
    'image/jpeg',
    'image/png',
    'application/pdf'
  ],
  virusScanEnabled: false,           // Enable virus scanning
  enableDeepValidation: true         // Deep file type validation
});
```

### Storing Files

```javascript
// Store a file
const fileContent = Buffer.from('Hello, World!');
const fileRef = await fileManager.storeFile(fileContent, {
  originalName: 'hello.txt',
  mimeType: 'text/plain',
  ownerId: 'user123',                    // Optional: File owner
  expiresAt: Date.now() + 86400000,      // Optional: Expires in 24 hours
  retentionPolicy: '30days',             // Optional: Retention policy
  additionalMetadata: {                  // Optional: Custom metadata
    category: 'documents',
    tags: ['example', 'test']
  }
});

console.log(fileRef);
// {
//   id: 'uuid-here',
//   path: '/absolute/path/to/file',
//   size: 13,
//   mimeType: 'text/plain',
//   checksum: 'sha256-hash',
//   createdAt: 1234567890,
//   originalName: 'hello.txt',
//   version: 1
// }
```

### Retrieving Files

```javascript
// Get file content
const buffer = await fileManager.getFile(fileRef.id);

// Get file metadata
const metadata = await fileManager.getFileMetadata(fileRef.id);

// Delete a file
const deleted = await fileManager.deleteFile(fileRef.id);
```

## File Storage

### File Organization

Files are stored in a date-based directory structure:
```
data/files/
├── 2024/
│   ├── 01/
│   │   ├── 15/
│   │   │   ├── file1.pdf
│   │   │   └── file2.jpg
│   │   └── 16/
│   └── 02/
└── file-metadata.sqlite
```

### Duplicate Detection

The system automatically detects duplicate files by checksum:

```javascript
// If you store the same file twice, it returns a reference to the existing file
const file1 = await fileManager.storeFile(buffer, metadata);
const file2 = await fileManager.storeFile(buffer, metadata); // Same content

console.log(file2.isDuplicate); // true
console.log(file1.id === file2.id); // true - same file reference
```

### File Versioning

Create new versions of files while preserving history:

```javascript
// Store initial version
const v1 = await fileManager.storeFile(originalContent, {
  originalName: 'document.txt',
  mimeType: 'text/plain'
});

// Create new version
const v2 = await fileManager.storeFileVersion(v1.id, updatedContent, {
  originalName: 'document.txt',
  mimeType: 'text/plain',
  additionalMetadata: {
    changeReason: 'Updated introduction'
  }
});

// Get version history
const versions = await fileManager.getFileVersions(v1.id);
console.log(versions); // Array of all versions
```

## File Permissions

### Grant Permissions

```javascript
// Grant read permission to a user
await fileManager.grantFilePermission(fileId, 'user123', 'read', {
  grantedBy: 'admin',
  expiresAt: Date.now() + 86400000  // Expires in 24 hours
});

// Grant write permission to a group
await fileManager.grantFilePermission(fileId, null, 'write', {
  groupId: 'editors',
  grantedBy: 'admin'
});
```

### Check Permissions

```javascript
// Check if user can access file
const canRead = await fileManager.canUserAccessFile(fileId, 'user123', 'read');

// Get all permissions for a file
const permissions = await fileManager.getFilePermissions(fileId);

// Get all files accessible to a user
const accessibleFiles = await fileManager.getAccessibleFiles('user123', 'read');
```

### Revoke Permissions

```javascript
// Revoke a specific permission
await fileManager.revokeFilePermission(permissionId);
```

## Retention Policies

### Apply Retention Policies

```javascript
// Apply predefined retention policy
await fileManager.applyRetentionPolicy(fileId, '30days');

// Available policies: '1day', '7days', '30days', '1year'
// Or use custom milliseconds:
await fileManager.applyRetentionPolicy(fileId, 2592000000); // 30 days in ms
```

### Manage Expired Files

```javascript
// Get all expired files
const expiredFiles = await fileManager.getExpiredFiles();

// Clean up expired files
const result = await fileManager.cleanupExpiredFiles();
console.log(`Deleted ${result.deletedCount} of ${result.totalExpired} expired files`);

// Get files by retention policy
const thirtyDayFiles = await fileManager.getFilesByRetentionPolicy('30days');
```

## File Processing

### File Validation

```javascript
// Validate file content
const validation = await fileManager.validateFileContent(fileId);
console.log(validation);
// {
//   isValid: true,
//   errors: [],
//   warnings: ['Declared MIME type may not match detected type'],
//   detectedType: 'application/pdf',
//   actualSize: 102400
// }
```

### Type Detection

```javascript
// Detect file type using magic bytes
const detectedType = await fileManager.detectFileType(fileId);
console.log(detectedType); // 'image/jpeg'
```

### Text Extraction

```javascript
// Extract text from documents
const extraction = await fileManager.extractTextContent(fileId);
if (extraction.success) {
  console.log(extraction.text);
  console.log(extraction.metadata); // Additional info (e.g., page count)
}
```

### Security Validation

```javascript
// Check for security risks
const security = await fileManager.validateContentSecurity(fileId);
console.log(security);
// {
//   safe: false,
//   risks: ['Potentially executable file type'],
//   recommendations: ['Scan with antivirus before execution']
// }
```

### Image Processing

```javascript
// Generate thumbnail
const thumbnail = await fileManager.generateThumbnail(fileId, {
  width: 200,
  height: 200,
  quality: 80
});

if (thumbnail.success) {
  console.log(thumbnail.thumbnailFileId); // ID of the generated thumbnail
}

// Process image (placeholder for resize, compress, etc.)
const processed = await fileManager.processImage(fileId, {
  operation: 'resize',
  width: 800,
  height: 600
});
```

### File Hashes

```javascript
// Generate multiple hashes for integrity verification
const hashes = await fileManager.generateFileHashes(fileId);
console.log(hashes);
// {
//   md5: 'hash...',
//   sha1: 'hash...',
//   sha256: 'hash...',
//   sha512: 'hash...'
// }
```

### Batch Processing

```javascript
// Process multiple files
const results = await fileManager.processMultipleFiles(
  [fileId1, fileId2, fileId3],
  'validate'  // or 'extractText', 'generateThumbnail', 'securityCheck', 'detectType'
);

// Results include success/failure for each file
results.forEach(result => {
  console.log(`File ${result.fileId}: ${result.success ? 'Success' : result.error}`);
});
```

## Event Integration

### Store File References in Events

```javascript
// Create event-compatible file reference
const eventFileRef = fileManager.createEventFileReference(fileRef);

// Store in event
await eventQueue.store({
  cmd: 'uploadDocument',
  data: {
    title: 'Annual Report',
    file: eventFileRef,  // Embedded file reference
    uploadedBy: 'user123'
  }
}, model, callbacks);
```

### Resolve File References from Events

```javascript
// Extract file references from event data
const fileRefs = fileManager.extractFileReferences(eventData);

// Resolve file content from reference
const fileContent = await fileManager.resolveEventFileReference(eventFileRef);
```

### Orphaned File Cleanup

```javascript
// Get all file references from events
const allEvents = eventQueue.getAllEvents();
const referencedFileIds = [];

for (const event of allEvents) {
  const refs = fileManager.extractFileReferences(event);
  referencedFileIds.push(...refs.map(r => r.fileId));
}

// Find orphaned files
const orphaned = await fileManager.findOrphanedFiles(referencedFileIds);

// Clean up orphaned files
const deletedCount = await fileManager.cleanupOrphanedFiles(referencedFileIds);
```

## Security

### File Type Validation

The system performs deep file type validation:

1. **MIME type checking** against allowed types
2. **Magic byte detection** to verify actual file type
3. **Content analysis** for text files
4. **Security pattern detection** for potentially dangerous content

### Virus Scanning

When enabled, files are scanned for viruses:

```javascript
const fileManager = new FileStorageManager({
  virusScanEnabled: true  // Requires integration with antivirus service
});
```

### Access Control

- **Owner-based access**: File owners always have full access
- **Permission-based access**: Fine-grained read/write permissions
- **Time-based permissions**: Permissions can expire automatically
- **Group permissions**: Support for group-based access control

## Examples

### Complete File Upload Workflow

```javascript
import { FileStorageManager, initQueue, modelSetup } from 'eventlite-sourcing';

// Initialize components
const fileManager = new FileStorageManager({
  baseDir: './data/files',
  maxFileSize: 10485760,  // 10MB
  allowedTypes: ['image/jpeg', 'image/png', 'application/pdf']
});

const eventQueue = initQueue({ dbName: './data/events.sqlite' });

// Upload file with event tracking
async function uploadFile(buffer, metadata, userId) {
  try {
    // Validate and store file
    const fileRef = await fileManager.storeFile(buffer, {
      ...metadata,
      ownerId: userId
    });
    
    // Create event record
    const eventRef = fileManager.createEventFileReference(fileRef);
    
    await eventQueue.store({
      cmd: 'fileUploaded',
      user: userId,
      data: {
        file: eventRef,
        uploadedAt: Date.now()
      }
    }, model, callbacks);
    
    // Generate thumbnail if image
    if (metadata.mimeType.startsWith('image/')) {
      await fileManager.generateThumbnail(fileRef.id);
    }
    
    // Apply retention policy
    await fileManager.applyRetentionPolicy(fileRef.id, '1year');
    
    return fileRef;
  } catch (error) {
    console.error('Upload failed:', error.message);
    throw error;
  }
}
```

### Scheduled Cleanup Task

```javascript
// Run daily cleanup
async function dailyCleanup() {
  // Clean up expired files
  const expirationResult = await fileManager.cleanupExpiredFiles();
  console.log(`Cleaned up ${expirationResult.deletedCount} expired files`);
  
  // Clean up orphaned files
  const referencedIds = await getReferencedFileIds(); // Your implementation
  const orphanedCount = await fileManager.cleanupOrphanedFiles(referencedIds);
  console.log(`Cleaned up ${orphanedCount} orphaned files`);
  
  // Log storage stats
  const stats = await fileManager.getStorageStats();
  console.log('Storage stats:', stats);
}

// Schedule daily at midnight
setInterval(dailyCleanup, 24 * 60 * 60 * 1000);
```

### File Access Control Example

```javascript
// Admin uploads a file
const fileRef = await fileManager.storeFile(buffer, {
  originalName: 'confidential.pdf',
  mimeType: 'application/pdf',
  ownerId: 'admin'
});

// Grant read access to specific users
await fileManager.grantFilePermission(fileRef.id, 'user1', 'read', {
  grantedBy: 'admin',
  expiresAt: Date.now() + (7 * 24 * 60 * 60 * 1000) // 7 days
});

// Check access before download
async function downloadFile(fileId, userId) {
  const canAccess = await fileManager.canUserAccessFile(fileId, userId, 'read');
  
  if (!canAccess) {
    throw new Error('Access denied');
  }
  
  return fileManager.getFile(fileId);
}
```

## Best Practices

1. **Always validate files** before storing them
2. **Set appropriate retention policies** to manage storage
3. **Use permissions** for sensitive files
4. **Generate thumbnails** asynchronously for better performance
5. **Run cleanup tasks** regularly to maintain storage health
6. **Store file references in events** for complete audit trails
7. **Monitor storage statistics** to track usage
8. **Handle errors gracefully** in file operations

## Error Handling

Common errors and how to handle them:

```javascript
try {
  const fileRef = await fileManager.storeFile(buffer, metadata);
} catch (error) {
  switch (error.message) {
    case 'File buffer cannot be empty':
      // Handle empty file
      break;
    case 'File validation failed: File size exceeds maximum allowed size':
      // Handle oversized file
      break;
    case 'File type not allowed':
      // Handle disallowed file type
      break;
    default:
      // Handle other errors
      console.error('File storage error:', error);
  }
}
```

## Configuration

### FileStorageManager Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `baseDir` | string | `./data/files` | Base directory for file storage |
| `backend` | string | `local` | Storage backend (currently only 'local') |
| `maxFileSize` | number | 104857600 (100MB) | Maximum file size in bytes |
| `allowedTypes` | string[] \| null | null | Allowed MIME types (null = all) |
| `dbName` | string | `{baseDir}/file-metadata.sqlite` | Database file path |
| `virusScanEnabled` | boolean | false | Enable virus scanning |
| `enableDeepValidation` | boolean | true | Enable deep file type validation |

### Retention Policy Options

- `'1day'` - Files expire after 1 day
- `'7days'` - Files expire after 7 days
- `'30days'` - Files expire after 30 days
- `'1year'` - Files expire after 1 year
- Custom number - Milliseconds until expiration

### Permission Types

- `'read'` - Can view/download file
- `'write'` - Can modify/delete file
- `'admin'` - Full control over file and permissions
- Custom types - Define your own permission types

## Performance Considerations

1. **Indexed queries**: All major queries use database indexes
2. **Duplicate detection**: Prevents storing identical files
3. **Batch operations**: Process multiple files efficiently
4. **Async operations**: Non-blocking file operations
5. **Connection pooling**: Reuse database connections

## Migration Guide

If upgrading from a version without file storage:

1. The system automatically creates necessary tables
2. No manual migration required
3. Existing event data remains unchanged
4. New file references integrate seamlessly

## Troubleshooting

### Common Issues

**File not found**
- Check if file was deleted or expired
- Verify file ID is correct
- Check file permissions

**Validation failures**
- Verify MIME type is allowed
- Check file size limits
- Ensure file is not corrupted

**Permission denied**
- Check user permissions
- Verify permission hasn't expired
- Check if user is file owner

**Storage full**
- Run cleanup for expired files
- Check for orphaned files
- Monitor storage statistics

### Debug Mode

Enable detailed logging:

```javascript
const fileManager = new FileStorageManager({
  debug: true  // Logs detailed operations
});
```

## API Reference

See the [API documentation](./API.md#file-storage) for complete method signatures and details.