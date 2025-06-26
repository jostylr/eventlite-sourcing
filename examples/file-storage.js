import { initQueue, eventCallbacks, modelSetup, FileStorageManager } from "../index.js";

console.log("FileStorageManager Example");
console.log("==========================");

// Initialize the file storage manager
const fileManager = new FileStorageManager({
  baseDir: "./data/example-files",
  maxFileSize: 10485760, // 10MB
  allowedTypes: ["text/plain", "image/jpeg", "image/png", "application/pdf"]
});

// Initialize event sourcing
const eventQueue = initQueue({ dbName: "./data/file-example.sqlite" });

const model = modelSetup({
  dbName: "./data/file-model.sqlite",
  tables(db) {
    db.run(`
      CREATE TABLE IF NOT EXISTS documents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        file_reference TEXT NOT NULL,
        uploaded_by TEXT NOT NULL,
        uploaded_at INTEGER NOT NULL
      )
    `);
  },
  queries(db) {
    return {
      insertDocument: db.prepare(`
        INSERT INTO documents (name, file_reference, uploaded_by, uploaded_at)
        VALUES (?, ?, ?, ?)
      `),
      getDocument: db.prepare(`SELECT * FROM documents WHERE id = ?`),
      getAllDocuments: db.prepare(`SELECT * FROM documents ORDER BY uploaded_at DESC`)
    };
  },
  methods(queries) {
    return {
      uploadDocument({ name, fileReference, uploadedBy }) {
        const result = queries.insertDocument.run(
          name,
          JSON.stringify(fileReference),
          uploadedBy,
          Date.now()
        );
        return { 
          documentId: result.lastInsertRowid, 
          name,
          fileReference,
          uploadedBy 
        };
      },
      getDocument({ documentId }) {
        return queries.getDocument.get(documentId);
      },
      listDocuments() {
        return queries.getAllDocuments.all();
      }
    };
  }
});

const callbacks = {
  uploadDocument(result, row) {
    console.log(`✅ Document uploaded: ${result.name} (ID: ${result.documentId})`);
  },
  downloadDocument(result, row) {
    console.log(`📥 Document downloaded: ${result.documentId}`);
  },
  deleteDocument(result, row) {
    console.log(`🗑️ Document deleted: ${result.documentId}`);
  },
  cleanupFiles(result, row) {
    console.log(`🧹 Cleaned up ${result.deletedCount} orphaned files`);
  },
  _default: (result, row) => {
    console.log(`📝 Event processed: ${row.cmd}`);
  },
  _error: (error) => {
    console.error(`❌ Error: ${error.msg}`);
  }
};

async function runExample() {
  try {
    console.log("\n1. Storing a file...");
    
    // Create some sample file content
    const sampleContent = Buffer.from(`
# Sample Document

This is a sample document to demonstrate file storage with event sourcing.

Created at: ${new Date().toISOString()}
Content: Lorem ipsum dolor sit amet, consectetur adipiscing elit.
    `.trim());

    // Store the file
    const fileRef = await fileManager.storeFile(sampleContent, {
      originalName: "sample-document.md",
      mimeType: "text/plain",
      additionalMetadata: {
        category: "documentation",
        tags: ["sample", "example"]
      }
    });

    console.log("File stored:", {
      id: fileRef.id,
      originalName: fileRef.originalName,
      size: fileRef.size,
      checksum: fileRef.checksum.substring(0, 8) + "..."
    });

    console.log("\n2. Creating event file reference...");
    
    // Create event-compatible file reference
    const eventFileRef = fileManager.createEventFileReference(fileRef);
    
    console.log("\n3. Storing document upload event...");
    
    // Store event with file reference
    await eventQueue.store({
      cmd: "uploadDocument",
      data: {
        name: "My Sample Document",
        fileReference: eventFileRef,
        uploadedBy: "user123"
      },
      user: "user123",
      ip: "127.0.0.1"
    }, model, callbacks);

    console.log("\n4. Retrieving document...");
    
    // Get the document from model
    const documents = model.listDocuments();
    const document = documents[0];
    
    console.log("Document in database:", {
      id: document.id,
      name: document.name,
      uploadedBy: document.uploaded_by
    });

    console.log("\n5. Downloading file content...");
    
    // Parse file reference and download file
    const storedFileRef = JSON.parse(document.file_reference);
    const downloadedContent = await fileManager.resolveEventFileReference(storedFileRef);
    
    await eventQueue.store({
      cmd: "downloadDocument",
      data: {
        documentId: document.id,
        document: document
      },
      user: "user123",
      ip: "127.0.0.1"
    }, model, callbacks);

    console.log("Downloaded content preview:", 
      downloadedContent.toString().substring(0, 100) + "..."
    );

    console.log("\n6. Creating a new version of the file...");
    
    const updatedContent = Buffer.from(`
# Sample Document (Updated)

This is an updated version of the sample document.

Updated at: ${new Date().toISOString()}
Content: Lorem ipsum dolor sit amet, consectetur adipiscing elit.
New content: This file has been updated with new information.
    `.trim());

    const versionRef = await fileManager.storeFileVersion(fileRef.id, updatedContent, {
      originalName: "sample-document.md",
      mimeType: "text/plain",
      additionalMetadata: {
        category: "documentation",
        tags: ["sample", "example", "updated"],
        updateReason: "Added new content"
      }
    });

    console.log("New version created:", {
      id: versionRef.id,
      version: versionRef.version,
      parentId: versionRef.parentId
    });

    console.log("\n7. Getting file history...");
    
    const history = await fileManager.getFileHistory(fileRef.id);
    console.log("File versions:", history.map(v => ({
      id: v.id,
      version: v.version,
      size: v.size,
      createdAt: new Date(v.createdAt).toISOString()
    })));

    console.log("\n8. Storage statistics...");
    
    const stats = await fileManager.getStorageStats();
    console.log("Storage stats:", {
      totalFiles: stats.totalFiles,
      totalSize: `${Math.round(stats.totalSize / 1024)} KB`,
      uniqueFiles: stats.uniqueFiles,
      duplicateFiles: stats.duplicateFiles
    });

    console.log("\n9. Finding orphaned files...");
    
    // In a real application, you would extract file references from all events
    // For demo purposes, we'll simulate this with the files we know are in use
    const knownReferencedFileIds = [fileRef.id, versionRef.id];
    
    const orphanedFiles = await fileManager.findOrphanedFiles(knownReferencedFileIds);
    console.log(`Found ${orphanedFiles.length} orphaned files`);

    console.log("\n10. Simulating file cleanup...");
    
    // Note: In a real application, you'd run cleanup periodically
    // For demo purposes, we'll show how it would work but not actually delete
    console.log(`Files that would be cleaned up: ${orphanedFiles.length}`);

    console.log("\n✅ File storage example completed successfully!");

  } catch (error) {
    console.error("❌ Example failed:", error.message);
    console.error(error.stack);
  } finally {
    // Clean up
    fileManager.close();
  }
}

runExample();