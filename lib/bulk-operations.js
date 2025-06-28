import { createReadStream, createWriteStream } from "fs";
import { pipeline } from "stream/promises";
import { Transform } from "stream";

/**
 * Bulk Operations Utility for EventLite Sourcing
 * Provides efficient bulk export/import and batch processing capabilities
 */

class BulkOperations {
  constructor(eventQueue) {
    this.eventQueue = eventQueue;
  }

  /**
   * Export events to JSON Lines format (efficient for large datasets)
   */
  async exportToJSONL(filePath, options = {}) {
    const {
      batchSize = 1000,
      startId = 0,
      endId = null,
      correlationId = null,
      user = null,
      cmd = null,
      includeMetadata = true,
    } = options;

    const writeStream = createWriteStream(filePath, { encoding: 'utf8' });
    let totalExported = 0;

    try {
      for await (const batch of this.eventQueue.streamEvents({
        batchSize,
        startId,
        endId,
        correlationId,
        user,
        cmd,
      })) {
        for (const event of batch) {
          const exportData = {
            id: event.id,
            version: event.version,
            datetime: event.datetime,
            user: event.user,
            ip: event.ip,
            cmd: event.cmd,
            data: event.data,
            correlation_id: event.correlation_id,
            causation_id: event.causation_id,
          };

          if (includeMetadata) {
            exportData.metadata = event.metadata;
          }

          writeStream.write(JSON.stringify(exportData) + '\n');
          totalExported++;
        }
      }

      writeStream.end();
      return { success: true, totalExported };
    } catch (error) {
      writeStream.destroy();
      throw new Error(`Export failed: ${error.message}`);
    }
  }

  /**
   * Import events from JSON Lines format
   */
  async importFromJSONL(filePath, options = {}) {
    const {
      batchSize = 100,
      validate = true,
      skipErrors = false,
      model = null,
      callbacks = null,
    } = options;

    const readStream = createReadStream(filePath, { encoding: 'utf8' });
    let totalImported = 0;
    let totalErrors = 0;
    const errors = [];

    const processLine = (line) => {
      if (!line.trim()) return null;
      
      try {
        const event = JSON.parse(line);
        
        if (validate) {
          if (!event.cmd) {
            throw new Error('Missing required field: cmd');
          }
          if (typeof event.data !== 'object') {
            throw new Error('Invalid data field: must be object');
          }
        }

        return event;
      } catch (error) {
        if (!skipErrors) {
          throw new Error(`Invalid JSON on line: ${error.message}`);
        }
        errors.push({ line, error: error.message });
        return null;
      }
    };

    const batchProcessor = new Transform({
      objectMode: true,
      transform(chunk, encoding, callback) {
        const lines = chunk.toString().split('\n');
        const events = [];

        for (const line of lines) {
          const event = processLine(line);
          if (event) {
            events.push(event);
          }
        }

        if (events.length > 0) {
          this.push(events);
        }
        callback();
      }
    });

    try {
      let buffer = '';
      let eventBatch = [];

      readStream.on('data', (chunk) => {
        buffer += chunk;
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer

        for (const line of lines) {
          const event = processLine(line);
          if (event) {
            eventBatch.push(event);

            if (eventBatch.length >= batchSize) {
              try {
                this.eventQueue.storeBulk(eventBatch, model, callbacks);
                totalImported += eventBatch.length;
                eventBatch = [];
              } catch (error) {
                totalErrors += eventBatch.length;
                if (!skipErrors) {
                  throw error;
                }
                errors.push({ batch: eventBatch.length, error: error.message });
                eventBatch = [];
              }
            }
          }
        }
      });

      readStream.on('end', () => {
        // Process remaining events in buffer
        if (buffer.trim()) {
          const event = processLine(buffer);
          if (event) {
            eventBatch.push(event);
          }
        }

        // Process final batch
        if (eventBatch.length > 0) {
          try {
            this.eventQueue.storeBulk(eventBatch, model, callbacks);
            totalImported += eventBatch.length;
          } catch (error) {
            totalErrors += eventBatch.length;
            if (!skipErrors) {
              throw error;
            }
            errors.push({ batch: eventBatch.length, error: error.message });
          }
        }
      });

      return new Promise((resolve, reject) => {
        readStream.on('end', () => {
          resolve({
            success: true,
            totalImported,
            totalErrors,
            errors: errors.slice(0, 100), // Limit error details
          });
        });

        readStream.on('error', reject);
      });
    } catch (error) {
      throw new Error(`Import failed: ${error.message}`);
    }
  }

  /**
   * Export events to CSV format
   */
  async exportToCSV(filePath, options = {}) {
    const {
      batchSize = 1000,
      startId = 0,
      endId = null,
      correlationId = null,
      user = null,
      cmd = null,
      includeHeaders = true,
    } = options;

    const writeStream = createWriteStream(filePath, { encoding: 'utf8' });
    let totalExported = 0;
    let isFirstBatch = true;

    try {
      for await (const batch of this.eventQueue.streamEvents({
        batchSize,
        startId,
        endId,
        correlationId,
        user,
        cmd,
      })) {
        if (isFirstBatch && includeHeaders) {
          writeStream.write('id,version,datetime,user,ip,cmd,data,correlation_id,causation_id,metadata\n');
          isFirstBatch = false;
        }

        for (const event of batch) {
          const csvRow = [
            event.id,
            event.version,
            event.datetime,
            this.escapeCsvField(event.user || ''),
            this.escapeCsvField(event.ip || ''),
            this.escapeCsvField(event.cmd),
            this.escapeCsvField(JSON.stringify(event.data)),
            this.escapeCsvField(event.correlation_id || ''),
            event.causation_id || '',
            this.escapeCsvField(JSON.stringify(event.metadata || {})),
          ].join(',');

          writeStream.write(csvRow + '\n');
          totalExported++;
        }
      }

      writeStream.end();
      return { success: true, totalExported };
    } catch (error) {
      writeStream.destroy();
      throw new Error(`CSV export failed: ${error.message}`);
    }
  }

  /**
   * Batch process events with custom processor function
   */
  async batchProcess(processorFn, options = {}) {
    const {
      batchSize = 100,
      startId = 0,
      endId = null,
      correlationId = null,
      user = null,
      cmd = null,
      parallel = false,
      maxConcurrency = 4,
    } = options;

    let totalProcessed = 0;
    let totalErrors = 0;
    const errors = [];

    try {
      if (parallel && maxConcurrency > 1) {
        // Parallel processing with concurrency control
        const processingPromises = [];
        
        for await (const batch of this.eventQueue.streamEvents({
          batchSize,
          startId,
          endId,
          correlationId,
          user,
          cmd,
        })) {
          const processPromise = (async () => {
            try {
              const result = await processorFn(batch);
              totalProcessed += batch.length;
              return result;
            } catch (error) {
              totalErrors += batch.length;
              errors.push({ batch: batch.length, error: error.message });
              throw error;
            }
          })();

          processingPromises.push(processPromise);

          // Control concurrency
          if (processingPromises.length >= maxConcurrency) {
            await Promise.allSettled(processingPromises.splice(0, 1));
          }
        }

        // Wait for remaining promises
        await Promise.allSettled(processingPromises);
      } else {
        // Sequential processing
        for await (const batch of this.eventQueue.streamEvents({
          batchSize,
          startId,
          endId,
          correlationId,
          user,
          cmd,
        })) {
          try {
            await processorFn(batch);
            totalProcessed += batch.length;
          } catch (error) {
            totalErrors += batch.length;
            errors.push({ batch: batch.length, error: error.message });
          }
        }
      }

      return {
        success: true,
        totalProcessed,
        totalErrors,
        errors: errors.slice(0, 100),
      };
    } catch (error) {
      throw new Error(`Batch processing failed: ${error.message}`);
    }
  }

  /**
   * Migrate events to new format
   */
  async migrateEvents(migrationFn, options = {}) {
    const {
      batchSize = 100,
      targetVersion = 2,
      dryRun = false,
    } = options;

    const results = {
      totalProcessed: 0,
      totalMigrated: 0,
      errors: [],
      dryRun,
    };

    try {
      for await (const batch of this.eventQueue.streamEvents({ batchSize })) {
        const migratedBatch = [];

        for (const event of batch) {
          try {
            // Skip events that are already at target version or higher
            if (event.version >= targetVersion) {
              results.totalProcessed++;
              continue;
            }

            const migratedEvent = await migrationFn(event, targetVersion);
            
            if (migratedEvent) {
              migratedEvent.version = targetVersion;
              migratedBatch.push(migratedEvent);
              results.totalMigrated++;
            }
            
            results.totalProcessed++;
          } catch (error) {
            results.errors.push({
              eventId: event.id,
              error: error.message,
            });
          }
        }

        // Store migrated events if not a dry run
        if (!dryRun && migratedBatch.length > 0) {
          this.eventQueue.storeBulk(migratedBatch);
        }
      }

      return results;
    } catch (error) {
      throw new Error(`Migration failed: ${error.message}`);
    }
  }

  /**
   * Escape CSV field for safe output
   */
  escapeCsvField(field) {
    if (typeof field !== 'string') {
      field = String(field);
    }
    
    if (field.includes(',') || field.includes('"') || field.includes('\n')) {
      return '"' + field.replace(/"/g, '""') + '"';
    }
    
    return field;
  }

  /**
   * Get processing statistics
   */
  async getProcessingStats(options = {}) {
    const {
      startId = 0,
      endId = null,
      timeRange = null,
    } = options;

    const stats = {
      totalEvents: 0,
      eventsByCommand: {},
      eventsByUser: {},
      eventsByVersion: {},
      dateRange: { min: null, max: null },
      correlationIds: new Set(),
      rootEvents: 0,
      childEvents: 0,
    };

    for await (const batch of this.eventQueue.streamEvents({
      batchSize: 1000,
      startId,
      endId,
    })) {
      for (const event of batch) {
        stats.totalEvents++;

        // Command statistics
        stats.eventsByCommand[event.cmd] = (stats.eventsByCommand[event.cmd] || 0) + 1;

        // User statistics
        if (event.user) {
          stats.eventsByUser[event.user] = (stats.eventsByUser[event.user] || 0) + 1;
        }

        // Version statistics
        stats.eventsByVersion[event.version] = (stats.eventsByVersion[event.version] || 0) + 1;

        // Date range
        if (!stats.dateRange.min || event.datetime < stats.dateRange.min) {
          stats.dateRange.min = event.datetime;
        }
        if (!stats.dateRange.max || event.datetime > stats.dateRange.max) {
          stats.dateRange.max = event.datetime;
        }

        // Correlation tracking
        if (event.correlation_id) {
          stats.correlationIds.add(event.correlation_id);
        }

        // Root vs child events
        if (event.causation_id) {
          stats.childEvents++;
        } else {
          stats.rootEvents++;
        }
      }
    }

    stats.uniqueCorrelations = stats.correlationIds.size;
    delete stats.correlationIds; // Remove the Set for cleaner output

    return stats;
  }
}

export { BulkOperations };