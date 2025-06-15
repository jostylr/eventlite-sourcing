import { Database } from "bun:sqlite";
import { existsSync, mkdirSync } from "fs";
import { dirname } from "path";

/**
 * Snapshot manager for event sourcing
 * Allows saving and restoring model state at specific points
 */
export class SnapshotManager {
  constructor(options = {}) {
    const {
      dbName = "data/snapshots.sqlite",
      init = { create: true, strict: true },
    } = options;

    // Ensure directory exists
    const dbDir = dirname(dbName);
    if (!existsSync(dbDir)) {
      mkdirSync(dbDir, { recursive: true });
    }

    this.db = new Database(dbName, init);
    if (!options.noWAL) this.db.exec("PRAGMA journal_mode = WAL;");

    // Create snapshots table
    this.db
      .query(
        `
      CREATE TABLE IF NOT EXISTS snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id INTEGER NOT NULL,
        model_name TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        state TEXT NOT NULL,
        metadata TEXT,
        UNIQUE(model_name, event_id)
      )
    `,
      )
      .run();

    // Prepare queries
    this.queries = {
      saveSnapshot: this.db.prepare(`
        INSERT OR REPLACE INTO snapshots (event_id, model_name, created_at, state, metadata)
        VALUES ($eventId, $modelName, $createdAt, $state, $metadata)
      `),
      getLatestSnapshot: this.db.prepare(`
        SELECT * FROM snapshots
        WHERE model_name = $modelName AND event_id <= $eventId
        ORDER BY event_id DESC
        LIMIT 1
      `),
      getSnapshotByEventId: this.db.prepare(`
        SELECT * FROM snapshots
        WHERE model_name = $modelName AND event_id = $eventId
      `),
      listSnapshots: this.db.prepare(`
        SELECT id, event_id, model_name, created_at, metadata
        FROM snapshots
        WHERE model_name = $modelName
        ORDER BY event_id DESC
        LIMIT $limit OFFSET $offset
      `),
      deleteSnapshot: this.db.prepare(`
        DELETE FROM snapshots
        WHERE model_name = $modelName AND event_id = $eventId
      `),
      deleteOldSnapshots: this.db.prepare(`
        DELETE FROM snapshots
        WHERE model_name = $modelName AND event_id < $eventId
      `),
    };
  }

  /**
   * Create a snapshot of the current model state
   * @param {string} modelName - Identifier for the model
   * @param {number} eventId - The last processed event ID
   * @param {Object} model - The model instance
   * @param {Object} metadata - Optional metadata about the snapshot
   * @returns {Object} Snapshot info
   */
  async createSnapshot(modelName, eventId, model, metadata = {}) {
    try {
      // Extract state from model
      const state = await this.extractModelState(model);

      const result = this.queries.saveSnapshot.run({
        eventId,
        modelName,
        createdAt: Date.now(),
        state: JSON.stringify(state),
        metadata: JSON.stringify(metadata),
      });

      return {
        success: true,
        snapshotId: result.lastInsertRowid,
        eventId,
        modelName,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Restore model state from a snapshot
   * @param {string} modelName - Identifier for the model
   * @param {number} eventId - Find snapshot at or before this event ID
   * @param {Object} model - The model instance to restore into
   * @returns {Object} Restore result with eventId to replay from
   */
  async restoreSnapshot(modelName, eventId, model) {
    try {
      const snapshot = this.queries.getLatestSnapshot.get({
        modelName,
        eventId,
      });

      if (!snapshot) {
        return {
          success: false,
          error: "No snapshot found",
          replayFrom: 0,
        };
      }

      const state = JSON.parse(snapshot.state);
      await this.restoreModelState(model, state);

      return {
        success: true,
        snapshotId: snapshot.id,
        eventId: snapshot.event_id,
        replayFrom: snapshot.event_id + 1,
        metadata: JSON.parse(snapshot.metadata || "{}"),
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        replayFrom: 0,
      };
    }
  }

  /**
   * Extract state from a model
   * @param {Object} model - The model instance
   * @returns {Object} Serializable state
   */
  async extractModelState(model) {
    const state = {
      tables: {},
      version: 1,
    };

    // Handle stub models
    if (!model._db || typeof model._db.query !== "function") {
      throw new Error("Invalid model: missing database or query function");
    }

    // Get all tables from the model database
    const tables = model._db
      .query(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
      )
      .all();

    for (const { name } of tables) {
      // Get table schema
      const schema = model._db.query(`PRAGMA table_info(${name})`).all();

      // Get all data from table
      const data = model._db.query(`SELECT * FROM ${name}`).all();

      state.tables[name] = {
        schema: schema,
        data: data,
      };
    }

    return state;
  }

  /**
   * Restore state into a model
   * @param {Object} model - The model instance
   * @param {Object} state - The state to restore
   */
  async restoreModelState(model, state) {
    const db = model._db;

    // Handle stub models
    if (!db || typeof db.exec !== "function") {
      return;
    }

    // Start transaction
    db.exec("BEGIN TRANSACTION");

    try {
      // Clear existing data
      const tables = db
        .query(
          "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
        )
        .all();

      for (const { name } of tables) {
        db.query(`DELETE FROM ${name}`).run();
      }

      // Restore each table
      for (const [tableName, tableData] of Object.entries(state.tables)) {
        if (tableData.data.length === 0) continue;

        // Build insert query dynamically
        const columns = Object.keys(tableData.data[0]);
        const placeholders = columns.map((col) => `$${col}`).join(", ");
        const insertQuery = db.prepare(
          `INSERT INTO ${tableName} (${columns.join(", ")}) VALUES (${placeholders})`,
        );

        // Insert all rows
        for (const row of tableData.data) {
          insertQuery.run(row);
        }
      }

      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }

  /**
   * List available snapshots for a model
   * @param {string} modelName - Identifier for the model
   * @param {number} limit - Maximum number of results
   * @param {number} offset - Offset for pagination
   * @returns {Array} List of snapshot metadata
   */
  listSnapshots(modelName, limit = 10, offset = 0) {
    return this.queries.listSnapshots
      .all({
        modelName,
        limit,
        offset,
      })
      .map((snapshot) => ({
        ...snapshot,
        metadata: JSON.parse(snapshot.metadata || "{}"),
      }));
  }

  /**
   * Delete a specific snapshot
   * @param {string} modelName - Identifier for the model
   * @param {number} eventId - Event ID of the snapshot
   * @returns {boolean} Success
   */
  deleteSnapshot(modelName, eventId) {
    const result = this.queries.deleteSnapshot.run({
      modelName,
      eventId,
    });
    return result.changes > 0;
  }

  /**
   * Delete all snapshots older than a specific event ID
   * @param {string} modelName - Identifier for the model
   * @param {number} eventId - Keep snapshots at or after this event ID
   * @returns {number} Number of deleted snapshots
   */
  deleteOldSnapshots(modelName, eventId) {
    const result = this.queries.deleteOldSnapshots.run({
      modelName,
      eventId,
    });
    return result.changes;
  }

  /**
   * Close the snapshot database
   */
  close() {
    this.db.close();
  }
}

/**
 * Convenience function to create a snapshot manager
 * @param {Object} options - Configuration options
 * @returns {SnapshotManager} Snapshot manager instance
 */
export function initSnapshots(options = {}) {
  return new SnapshotManager(options);
}
