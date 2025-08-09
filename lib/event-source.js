import { Database } from "bun:sqlite";
import { existsSync, mkdirSync } from "fs";
import { dirname } from "path";

// Simple LRU cache implementation for query results
class QueryCache {
  constructor(maxSize = 1000, ttl = 300000) { // 5 minute TTL default
    this.maxSize = maxSize;
    this.ttl = ttl;
    this.cache = new Map();
    this.accessOrder = new Map();
  }

  _isExpired(entry) {
    return Date.now() - entry.timestamp > this.ttl;
  }

  _evictLRU() {
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.accessOrder.keys().next().value;
      this.cache.delete(oldestKey);
      this.accessOrder.delete(oldestKey);
    }
  }

  get(key) {
    const entry = this.cache.get(key);
    if (!entry || this._isExpired(entry)) {
      this.cache.delete(key);
      this.accessOrder.delete(key);
      return null;
    }
    
    // Update access order
    this.accessOrder.delete(key);
    this.accessOrder.set(key, true);
    
    return entry.value;
  }

  set(key, value) {
    this._evictLRU();
    
    const entry = {
      value: value,
      timestamp: Date.now()
    };
    
    this.cache.set(key, entry);
    this.accessOrder.set(key, true);
  }

  clear() {
    this.cache.clear();
    this.accessOrder.clear();
  }

  size() {
    return this.cache.size;
  }
}

const eventCallbacks = {
  stub: {
    _error(red) {
      const { msg, error, cmd, data, ...row } = red;
      console.log(
        msg,
        error,
        cmd,
        "and then the data",
        data,
        "and finally the rest of the row data",
        row,
      );
    },
    _default(res, row) {
      const { cmd } = row;
      console.log(
        `${cmd} sent to be processed by main program with response`,
        res,
        "and data",
        row.data,
      );
    },
  },

  void: {
    _error() {},
    _default() {},
  },

  error: {
    _error({ msg, error, cmd, data, ...row }) {
      console.log(
        msg,
        error,
        cmd,
        "and then the data",
        data,
        "and finally the rest of the row data",
        row,
      );
    },
    _default() {},
  },

  done: () => {},
};

//stateDB should have db which is open database connection, methods for executing commands,
//queries for storing db queries, and roles for saying who can do what commands.
// options: {dbInit: {create:true, strict:true}, hash:{} for pwds, noWal:false}
const initQueue = function (options = {}) {
  const {
    dbName = "data/events.sqlite",
    init = { create: true, strict: true },
    hash,
    datetime = () => Date.now(), // old default,but want seconds for poratability (new Date()).toString().split(' (')[0] }
    cache = { enabled: true, maxSize: 1000, ttl: 300000 },
    indexes = {
      // Core indexes (recommended to keep for functionality)
      correlation_id: true,
      causation_id: true,
      
      // Performance indexes (can be disabled for maximum write speed)
      cmd: false,           // Enable if you query by command type frequently
      user: false,          // Enable if you query by user frequently  
      datetime: false,      // Enable if you do time-range queries frequently
      version: false,       // Enable if you query by version frequently
      
      // Composite indexes (highest overhead, use sparingly)
      correlation_cmd: false,     // Enable for correlation + command queries
      user_datetime: false,       // Enable for user + time range queries
    },
  } = options;

  // Initialize query cache if enabled
  const queryCache = cache.enabled ? new QueryCache(cache.maxSize, cache.ttl) : null;

  // Ensure the directory exists
  const dbDir = dirname(dbName);
  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true });
  }

  const db = new Database(dbName, init);
  if (options.WAL) db.exec("PRAGMA journal_mode = WAL;");
  if (options.reset) {
    db.query("DROP TABLE IF EXISTS queue").run();
    db.query("DROP TABLE IF EXISTS pending_events").run();
    db.query("DROP TABLE IF EXISTS wait_conditions").run();
  }
  const create = db.query(
    "CREATE TABLE IF NOT EXISTS queue ( id INTEGER PRIMARY KEY AUTOINCREMENT, version INTEGER DEFAULT 1, datetime INTEGER NOT NULL, user TEXT, ip TEXT, cmd TEXT NOT NULL, data TEXT, correlation_id TEXT, causation_id INTEGER, metadata TEXT); ",
  );
  create.run();

  // Create pending events table for wait conditions
  const createPendingEvents = db.query(`
    CREATE TABLE IF NOT EXISTS pending_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_data TEXT NOT NULL,
      wait_conditions TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER,
      correlation_id TEXT,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'ready', 'expired', 'executed', 'cancelled'))
    );
  `);
  createPendingEvents.run();

  // Create wait conditions table for tracking individual conditions
  const createWaitConditions = db.query(`
    CREATE TABLE IF NOT EXISTS wait_conditions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pending_event_id INTEGER NOT NULL,
      condition_type TEXT NOT NULL,
      condition_data TEXT NOT NULL,
      satisfied BOOLEAN DEFAULT FALSE,
      FOREIGN KEY (pending_event_id) REFERENCES pending_events(id) ON DELETE CASCADE
    );
  `);
  createWaitConditions.run();

  // Create indexes based on configuration
  if (indexes.correlation_id) {
    db.query("CREATE INDEX IF NOT EXISTS idx_correlation_id ON queue(correlation_id)").run();
  }
  if (indexes.causation_id) {
    db.query("CREATE INDEX IF NOT EXISTS idx_causation_id ON queue(causation_id)").run();
  }
  if (indexes.cmd) {
    db.query("CREATE INDEX IF NOT EXISTS idx_cmd ON queue(cmd)").run();
  }
  if (indexes.user) {
    db.query("CREATE INDEX IF NOT EXISTS idx_user ON queue(user)").run();
  }
  if (indexes.datetime) {
    db.query("CREATE INDEX IF NOT EXISTS idx_datetime ON queue(datetime)").run();
  }
  if (indexes.version) {
    db.query("CREATE INDEX IF NOT EXISTS idx_version ON queue(version)").run();
  }
  if (indexes.correlation_cmd) {
    db.query("CREATE INDEX IF NOT EXISTS idx_composite_correlation_cmd ON queue(correlation_id, cmd)").run();
  }
  if (indexes.user_datetime) {
    db.query("CREATE INDEX IF NOT EXISTS idx_composite_user_datetime ON queue(user, datetime)").run();
  }

  // Create indexes for pending events tables
  db.query("CREATE INDEX IF NOT EXISTS idx_pending_status ON pending_events(status)").run();
  db.query("CREATE INDEX IF NOT EXISTS idx_pending_correlation ON pending_events(correlation_id)").run();
  db.query("CREATE INDEX IF NOT EXISTS idx_pending_expires ON pending_events(expires_at)").run();
  db.query("CREATE INDEX IF NOT EXISTS idx_wait_conditions_pending ON wait_conditions(pending_event_id)").run();
  db.query("CREATE INDEX IF NOT EXISTS idx_wait_conditions_satisfied ON wait_conditions(satisfied)").run();

  const queries = {
    create,
    cycle: db.prepare(
      "SELECT id, version, datetime, user, ip, cmd, data, correlation_id, causation_id, metadata FROM queue WHERE id >= $start ORDER BY id LIMIT 1000 OFFSET $offset",
    ),
    cycleStop: db.prepare(
      "SELECT id, version, datetime, user, ip, cmd, data, correlation_id, causation_id, metadata FROM queue WHERE id >= $start AND id < $stop ORDER BY id LIMIT 1000 OFFSET $offset",
    ),
    getRowByID: db.prepare(
      "SELECT id, version, datetime, user, ip, cmd, data, correlation_id, causation_id, metadata FROM queue WHERE id = $id",
    ),
    storeRow: db.prepare(
      "INSERT INTO queue (version, datetime, user, ip, cmd, data, correlation_id, causation_id, metadata) VALUES($version,$datetime,$user,$ip,$cmd,$data,$correlation_id,$causation_id,$metadata) RETURNING *",
    ),
    getLastRow: db.prepare(
      "SELECT id, version, datetime, user, ip, cmd, data, correlation_id, causation_id, metadata FROM queue ORDER BY id DESC LIMIT 1",
    ),
    getByCorrelationId: db.prepare(
      "SELECT id, version, datetime, user, ip, cmd, data, correlation_id, causation_id, metadata FROM queue WHERE correlation_id = $correlationId ORDER BY id",
    ),
    getChildEvents: db.prepare(
      "SELECT id, version, datetime, user, ip, cmd, data, correlation_id, causation_id, metadata FROM queue WHERE causation_id = $causationId ORDER BY id",
    ),
    
    // Paginated queries for large result sets
    getByCorrelationIdPaginated: db.prepare(
      "SELECT id, version, datetime, user, ip, cmd, data, correlation_id, causation_id, metadata FROM queue WHERE correlation_id = $correlationId ORDER BY id LIMIT $limit OFFSET $offset",
    ),
    getChildEventsPaginated: db.prepare(
      "SELECT id, version, datetime, user, ip, cmd, data, correlation_id, causation_id, metadata FROM queue WHERE causation_id = $causationId ORDER BY id LIMIT $limit OFFSET $offset",
    ),
    getEventsByUserPaginated: db.prepare(
      "SELECT id, version, datetime, user, ip, cmd, data, correlation_id, causation_id, metadata FROM queue WHERE user = $user ORDER BY datetime DESC LIMIT $limit OFFSET $offset",
    ),
    getEventsByCmdPaginated: db.prepare(
      "SELECT id, version, datetime, user, ip, cmd, data, correlation_id, causation_id, metadata FROM queue WHERE cmd = $cmd ORDER BY datetime DESC LIMIT $limit OFFSET $offset",
    ),
    getEventsInTimeRangePaginated: db.prepare(
      "SELECT id, version, datetime, user, ip, cmd, data, correlation_id, causation_id, metadata FROM queue WHERE datetime >= $start AND datetime <= $end ORDER BY datetime DESC LIMIT $limit OFFSET $offset",
    ),
    
    // Count queries for pagination
    countByCorrelationId: db.prepare(
      "SELECT COUNT(*) as count FROM queue WHERE correlation_id = $correlationId",
    ),
    countChildEvents: db.prepare(
      "SELECT COUNT(*) as count FROM queue WHERE causation_id = $causationId",
    ),
    countEventsByUser: db.prepare(
      "SELECT COUNT(*) as count FROM queue WHERE user = $user",
    ),
    countEventsByCmd: db.prepare(
      "SELECT COUNT(*) as count FROM queue WHERE cmd = $cmd",
    ),
    countEventsInTimeRange: db.prepare(
      "SELECT COUNT(*) as count FROM queue WHERE datetime >= $start AND datetime <= $end",
    ),
    
    // Bulk operations
    bulkInsert: db.prepare(
      "INSERT INTO queue (version, datetime, user, ip, cmd, data, correlation_id, causation_id, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ),
    
    // Pending events queries
    storePendingEvent: db.prepare(
      "INSERT INTO pending_events (event_data, wait_conditions, created_at, expires_at, correlation_id, status) VALUES ($event_data, $wait_conditions, $created_at, $expires_at, $correlation_id, $status) RETURNING *",
    ),
    getPendingEventsByStatus: db.prepare(
      "SELECT * FROM pending_events WHERE status = $status ORDER BY created_at",
    ),
    getPendingEventById: db.prepare(
      "SELECT * FROM pending_events WHERE id = $id",
    ),
    updatePendingEventStatus: db.prepare(
      "UPDATE pending_events SET status = $status WHERE id = $id",
    ),
    deletePendingEvent: db.prepare(
      "DELETE FROM pending_events WHERE id = $id",
    ),
    getExpiredPendingEvents: db.prepare(
      "SELECT * FROM pending_events WHERE expires_at IS NOT NULL AND expires_at < $now AND status = 'pending'",
    ),
    
    // Wait conditions queries
    storeWaitCondition: db.prepare(
      "INSERT INTO wait_conditions (pending_event_id, condition_type, condition_data, satisfied) VALUES ($pending_event_id, $condition_type, $condition_data, $satisfied)",
    ),
    getWaitConditions: db.prepare(
      "SELECT * FROM wait_conditions WHERE pending_event_id = $pending_event_id",
    ),
    updateWaitConditionSatisfied: db.prepare(
      "UPDATE wait_conditions SET satisfied = $satisfied WHERE id = $id",
    ),
    getUnsatisfiedConditions: db.prepare(
      "SELECT * FROM wait_conditions WHERE pending_event_id = $pending_event_id AND satisfied = FALSE",
    ),
    getReadyPendingEvents: db.prepare(`
      SELECT pe.* FROM pending_events pe
      WHERE pe.status = 'pending' 
      AND NOT EXISTS (
        SELECT 1 FROM wait_conditions wc 
        WHERE wc.pending_event_id = pe.id AND wc.satisfied = FALSE
      )
    `),
  };

  const methods = {
    retrieveByID(id) {
      const row = queries.getRowByID.get({ id });
      if (row) {
        row.data = JSON.parse(row.data);
        row.metadata = JSON.parse(row.metadata || "{}");
      }
      return row;
    },

    store(
      {
        user = "",
        ip = "",
        cmd,
        data = {},
        version = 1,
        correlationId,
        causationId,
        metadata = {},
      },
      model,
      cb,
    ) {
      if (!model) {
        model = this._model;
      } //_model is default fallback to avoid having to always put in model
      if (!cb) {
        cb = this._cb || eventCallbacks.void;
      }
      if (!cmd) {
        cb._error({
          msg: `No command given; aborting`,
          priority: 2,
          user,
          ip,
          cmd,
          data,
        });
        return;
      }

      // Generate correlation ID if not provided
      if (!correlationId && !causationId) {
        correlationId = crypto.randomUUID();
      } else if (causationId && !correlationId) {
        // Inherit correlation ID from parent event
        const parentEvent = this.retrieveByID(causationId);
        if (parentEvent) {
          correlationId = parentEvent.correlation_id;
        }
      }

      const row = queries.storeRow.get({
        version,
        datetime: datetime(),
        user,
        ip,
        cmd,
        data: JSON.stringify(data),
        correlation_id: correlationId,
        causation_id: causationId,
        metadata: JSON.stringify(metadata),
      });
      row.data = JSON.parse(row.data); //Would use the raw data, but this ensures that this is replayable as stringify to parse is not idempotent for odd cases
      row.metadata = JSON.parse(row.metadata || "{}");
      const result = this.execute(row, model, cb);
      
      // Check pending events after storing new event (non-blocking)
      setTimeout(() => {
        try {
          // Only check if pending events tables exist
          if (this._hasPendingEventsTables()) {
            this.checkAllPendingEvents();
          }
        } catch (error) {
          // Silently ignore errors for backward compatibility
        }
      }, 0);
      
      return result;
    },

    //This just runs through a command and executes it
    //It is generic
    // it requires a method for every command
    // the state should be a database that the method will manipulate
    // the cb is a callback that activates any notifications, etc that need to happen
    // cb should habe an error method which can be null to suppress any error stuff
    // model: {queries, methods, migrations}
    execute(row, model, cb) {
      const {
        id,
        version,
        datetime,
        user,
        ip,
        cmd,
        data,
        correlation_id,
        causation_id,
        metadata,
      } = row;
      let res;
      try {
        // Apply migrations if needed
        let processedData = data;
        if (model._migrations && model._migrations[cmd]) {
          const cmdMigrations = model._migrations[cmd];
          for (let v = version; v < cmdMigrations.length + 1; v++) {
            if (cmdMigrations[v - 1]) {
              processedData = cmdMigrations[v - 1](processedData);
            }
          }
        }

        if (model[cmd]) {
          res = model[cmd](processedData, {
            datetime,
            user,
            ip,
            cmd,
            id,
            version,
            correlationId: correlation_id,
            causationId: causation_id,
            metadata,
          });
        } else if (model._queries[cmd]) {
          //simple pass through to query
          res = model.get(cmd, processedData);
        } else {
          res = model._default(processedData, {
            datetime,
            user,
            ip,
            cmd,
            id,
            version,
            correlationId: correlation_id,
            causationId: causation_id,
            metadata,
          });
        }
        const onDefault = (cb && (cb[cmd] || cb._default)) || eventCallbacks.void._default;
        onDefault(res, row); //res is whatever returned for cb to take an action. Probably some data and some webpages to update, notify
        model._done(row, res);
        return res; //may be useful info
      } catch (error) {
        const errObj = {
          msg: `${user} at ${ip} initiated  ${cmd} that led to an error: ${error.message}`,
          error,
          res,
          data,
          user,
          ip,
          cmd,
          id,
          version,
          datetime,
          correlation_id,
          causation_id,
          metadata,
        };
        const onError = (cb && cb._error) || eventCallbacks.void._error;
        onError(errObj);
        model._error(errObj);
        return;
      }
    },

    // Get all events with the same correlation ID
    getTransaction(correlationId) {
      return queries.getByCorrelationId.all({ correlationId }).map((row) => ({
        ...row,
        data: JSON.parse(row.data),
        metadata: JSON.parse(row.metadata || "{}"),
      }));
    },

    // Get direct children of an event
    getChildEvents(eventId) {
      return queries.getChildEvents
        .all({ causationId: eventId })
        .map((row) => ({
          ...row,
          data: JSON.parse(row.data),
          metadata: JSON.parse(row.metadata || "{}"),
        }));
    },

    // Get event lineage (parent and children)
    getEventLineage(eventId) {
      const event = this.retrieveByID(eventId);
      if (!event) return null;

      const lineage = {
        event: {
          ...event,
          data:
            typeof event.data === "string"
              ? JSON.parse(event.data)
              : event.data,
          metadata:
            typeof event.metadata === "string"
              ? JSON.parse(event.metadata || "{}")
              : event.metadata,
        },
        parent: null,
        children: [],
      };

      // Get parent
      if (event.causation_id) {
        const parent = this.retrieveByID(event.causation_id);
        if (parent) {
          lineage.parent = {
            ...parent,
            data:
              typeof parent.data === "string"
                ? JSON.parse(parent.data)
                : parent.data,
            metadata:
              typeof parent.metadata === "string"
                ? JSON.parse(parent.metadata || "{}")
                : parent.metadata,
          };
        }
      }

      // Get children
      lineage.children = this.getChildEvents(eventId);

      return lineage;
    },

    // Store event with context (helper method)
    storeWithContext(eventData, context, model, cb) {
      const enrichedEvent = {
        ...eventData,
        correlationId: context.correlationId || eventData.correlationId,
        causationId:
          context.causationId || context.parentEventId || eventData.causationId,
        metadata: {
          ...eventData.metadata,
          ...context.metadata,
        },
      };

      return this.store(enrichedEvent, model, cb);
    },

    cycleThrough(
      model,
      doneCB,
      whileCB = eventCallbacks.void,
      { start, stop } = { start: 0, stop: null },
    ) {
      let offset = 0;
      let fun;
      if (stop) {
        if (typeof stop === "number") {
          fun = queries.cycleStop;
        } else if (typeof stop === "string") {
          //figure out a date thing
        }
      } else {
        fun = queries.cycle;
      }
      while (true) {
        let results = fun.all({ offset, start, stop });
        //console.log(results);
        if (!results.length) {
          break;
        }
        for (const row of results) {
          row.data = JSON.parse(row.data);
          row.metadata = JSON.parse(row.metadata || "{}");
          this.execute(row, model, whileCB);
        } //mainly do nothing, but have error property
        offset += results.length;
      }
      doneCB(); //prep pages
      return;
    },

    // Cached query methods for performance
    retrieveByIDCached(id) {
      if (!queryCache) return this.retrieveByID(id);
      
      const cacheKey = `byId:${id}`;
      let result = queryCache.get(cacheKey);
      
      if (result === null) {
        result = this.retrieveByID(id);
        if (result) {
          queryCache.set(cacheKey, result);
        }
      }
      
      return result;
    },

    getTransactionCached(correlationId) {
      if (!queryCache) return this.getTransaction(correlationId);
      
      const cacheKey = `transaction:${correlationId}`;
      let result = queryCache.get(cacheKey);
      
      if (result === null) {
        result = this.getTransaction(correlationId);
        queryCache.set(cacheKey, result);
      }
      
      return result;
    },

    // Paginated query methods
    getByCorrelationIdPaginated(correlationId, { limit = 100, offset = 0 } = {}) {
      const totalCount = queries.countByCorrelationId.get({ correlationId }).count;
      const events = queries.getByCorrelationIdPaginated
        .all({ correlationId, limit, offset })
        .map((row) => ({
          ...row,
          data: JSON.parse(row.data),
          metadata: JSON.parse(row.metadata || "{}"),
        }));

      return {
        events,
        totalCount,
        hasMore: offset + limit < totalCount,
        nextOffset: offset + limit < totalCount ? offset + limit : null,
      };
    },

    getChildEventsPaginated(eventId, { limit = 100, offset = 0 } = {}) {
      const totalCount = queries.countChildEvents.get({ causationId: eventId }).count;
      const events = queries.getChildEventsPaginated
        .all({ causationId: eventId, limit, offset })
        .map((row) => ({
          ...row,
          data: JSON.parse(row.data),
          metadata: JSON.parse(row.metadata || "{}"),
        }));

      return {
        events,
        totalCount,
        hasMore: offset + limit < totalCount,
        nextOffset: offset + limit < totalCount ? offset + limit : null,
      };
    },

    getEventsByUserPaginated(user, { limit = 100, offset = 0 } = {}) {
      const totalCount = queries.countEventsByUser.get({ user }).count;
      const events = queries.getEventsByUserPaginated
        .all({ user, limit, offset })
        .map((row) => ({
          ...row,
          data: JSON.parse(row.data),
          metadata: JSON.parse(row.metadata || "{}"),
        }));

      return {
        events,
        totalCount,
        hasMore: offset + limit < totalCount,
        nextOffset: offset + limit < totalCount ? offset + limit : null,
      };
    },

    getEventsByCmdPaginated(cmd, { limit = 100, offset = 0 } = {}) {
      const totalCount = queries.countEventsByCmd.get({ cmd }).count;
      const events = queries.getEventsByCmdPaginated
        .all({ cmd, limit, offset })
        .map((row) => ({
          ...row,
          data: JSON.parse(row.data),
          metadata: JSON.parse(row.metadata || "{}"),
        }));

      return {
        events,
        totalCount,
        hasMore: offset + limit < totalCount,
        nextOffset: offset + limit < totalCount ? offset + limit : null,
      };
    },

    getEventsInTimeRangePaginated(start, end, { limit = 100, offset = 0 } = {}) {
      const totalCount = queries.countEventsInTimeRange.get({ start, end }).count;
      const events = queries.getEventsInTimeRangePaginated
        .all({ start, end, limit, offset })
        .map((row) => ({
          ...row,
          data: JSON.parse(row.data),
          metadata: JSON.parse(row.metadata || "{}"),
        }));

      return {
        events,
        totalCount,
        hasMore: offset + limit < totalCount,
        nextOffset: offset + limit < totalCount ? offset + limit : null,
      };
    },

    // Bulk operations for performance
    storeBulk(events, model, cb) {
      if (!Array.isArray(events) || events.length === 0) {
        throw new Error("Events must be a non-empty array");
      }

      const transaction = db.transaction((eventsArray) => {
        const results = [];
        
        for (const event of eventsArray) {
          const {
            user = "",
            ip = "",
            cmd,
            data = {},
            version = 1,
            correlationId,
            causationId,
            metadata = {},
          } = event;

          if (!cmd) {
            throw new Error(`No command given for event; aborting bulk insert`);
          }

          const storedEvent = queries.bulkInsert.run(
            version,
            datetime(),
            user,
            ip,
            cmd,
            JSON.stringify(data),
            correlationId,
            causationId,
            JSON.stringify(metadata)
          );

          const row = {
            id: storedEvent.lastInsertRowid,
            version,
            datetime: datetime(),
            user,
            ip,
            cmd,
            data,
            correlation_id: correlationId,
            causation_id: causationId,
            metadata,
          };

          // Execute the event if model and callback are provided
          if (model && cb) {
            const result = this.execute(row, model, cb);
            results.push({ row, result });
          } else {
            results.push({ row, result: null });
          }
        }

        return results;
      });

      // Clear cache on bulk operations
      if (queryCache) {
        queryCache.clear();
      }

      return transaction(events);
    },

    // Streaming export for large datasets
    async *streamEvents({ 
      batchSize = 1000, 
      startId = 0, 
      endId = null,
      correlationId = null,
      user = null,
      cmd = null 
    } = {}) {
      let currentId = startId;
      
      while (true) {
        let query, params;
        
        if (correlationId) {
          query = "SELECT * FROM queue WHERE correlation_id = ? AND id >= ? ORDER BY id LIMIT ?";
          params = [correlationId, currentId, batchSize];
        } else if (user) {
          query = "SELECT * FROM queue WHERE user = ? AND id >= ? ORDER BY id LIMIT ?";
          params = [user, currentId, batchSize];
        } else if (cmd) {
          query = "SELECT * FROM queue WHERE cmd = ? AND id >= ? ORDER BY id LIMIT ?";
          params = [cmd, currentId, batchSize];
        } else {
          query = endId 
            ? "SELECT * FROM queue WHERE id >= ? AND id <= ? ORDER BY id LIMIT ?"
            : "SELECT * FROM queue WHERE id >= ? ORDER BY id LIMIT ?";
          params = endId ? [currentId, endId, batchSize] : [currentId, batchSize];
        }

        const statement = db.prepare(query);
        const batch = statement.all(...params);
        
        if (batch.length === 0) {
          break;
        }

        const processedBatch = batch.map(row => ({
          ...row,
          data: JSON.parse(row.data),
          metadata: JSON.parse(row.metadata || "{}")
        }));

        yield processedBatch;
        
        currentId = batch[batch.length - 1].id + 1;
        
        if (endId && currentId > endId) {
          break;
        }
      }
    },

    // Cache management methods
    clearCache() {
      if (queryCache) {
        queryCache.clear();
      }
    },

    getCacheStats() {
      if (!queryCache) {
        return { enabled: false };
      }
      
      return {
        enabled: true,
        size: queryCache.size(),
        maxSize: queryCache.maxSize,
        ttl: queryCache.ttl,
      };
    },

    // Wait condition methods
    storeWhen(event, model, callbacks) {
      const {
        cmd,
        data = {},
        user = "",
        ip = "",
        version = 1,
        correlationId,
        causationId,
        metadata = {},
        waitFor,
        timeout,
      } = event;

      if (!waitFor) {
        // No wait conditions, store normally
        return this.store(event, model, callbacks);
      }

      if (!cmd) {
        throw new Error("No command given");
      }

      // Generate correlation ID if not provided
      const finalCorrelationId = correlationId || 
        (causationId ? this.retrieveByID(causationId)?.correlation_id : crypto.randomUUID());

      // Serialize the event for storage
      const eventData = JSON.stringify({
        cmd,
        data,
        user,
        ip,
        version,
        correlationId: finalCorrelationId,
        causationId,
        metadata,
      });

      // Calculate expiration time
      const createdAt = datetime();
      const expiresAt = timeout ? createdAt + timeout : null;

      // Store pending event
      const result = queries.storePendingEvent.run({
        event_data: eventData,
        wait_conditions: JSON.stringify(waitFor),
        created_at: createdAt,
        expires_at: expiresAt,
        correlation_id: finalCorrelationId,
        status: 'pending',
      });

      const pendingEventId = result.lastInsertRowid;

      // Parse and store wait conditions
      this._parseAndStoreWaitConditions(pendingEventId, waitFor);

      // Check if conditions are already satisfied
      this._checkPendingEventConditions(pendingEventId);

      return { pendingEventId: pendingEventId, status: 'pending' };
    },

    _parseAndStoreWaitConditions(pendingEventId, waitFor) {
      const conditions = [];

      if (waitFor.all) {
        waitFor.all.forEach((condition, index) => {
          conditions.push({
            pending_event_id: pendingEventId,
            condition_type: 'all_condition',
            condition_data: JSON.stringify({ ...condition, index }),
            satisfied: false,
          });
        });
      }

      if (waitFor.any) {
        waitFor.any.forEach((condition, index) => {
          conditions.push({
            pending_event_id: pendingEventId,
            condition_type: 'any_condition',
            condition_data: JSON.stringify({ ...condition, index }),
            satisfied: false,
          });
        });
      }

      if (waitFor.count) {
        conditions.push({
          pending_event_id: pendingEventId,
          condition_type: 'count_condition',
          condition_data: JSON.stringify(waitFor.count),
          satisfied: false,
        });
      }

      if (waitFor.sequence) {
        waitFor.sequence.forEach((condition, index) => {
          conditions.push({
            pending_event_id: pendingEventId,
            condition_type: 'sequence_condition',
            condition_data: JSON.stringify({ ...condition, index, order: index }),
            satisfied: false,
          });
        });
      }

      // Store all conditions
      conditions.forEach(condition => {
        queries.storeWaitCondition.run({
          pending_event_id: condition.pending_event_id,
          condition_type: condition.condition_type,
          condition_data: condition.condition_data,
          satisfied: condition.satisfied,
        });
      });
    },

    _evaluateCondition(condition, recentEventId = null) {
      const conditionData = JSON.parse(condition.condition_data);
      
      switch (condition.condition_type) {
        case 'all_condition':
        case 'any_condition':
          return this._evaluatePatternCondition(conditionData);
          
        case 'count_condition':
          return this._evaluateCountCondition(conditionData);
          
        case 'sequence_condition':
          return this._evaluateSequenceCondition(conditionData, condition.pending_event_id);
          
        default:
          return false;
      }
    },

    _evaluatePatternCondition(conditionData) {
      const { pattern, correlationId, where, minCount = 1 } = conditionData;
      
      // Build query based on condition
      let events;
      if (correlationId) {
        events = queries.getByCorrelationId.all({ correlationId });
      } else {
        // If no correlationId specified, we can't evaluate this condition
        return false;
      }

      // Filter by pattern (command)
      if (pattern) {
        events = events.filter(event => event.cmd === pattern);
      }

      // Filter by additional conditions
      if (where) {
        events = events.filter(event => {
          const data = JSON.parse(event.data);
          return this._matchesWhere(data, where);
        });
      }

      return events.length >= minCount;
    },

    _evaluateCountCondition(conditionData) {
      const { pattern, correlationId, count, where } = conditionData;
      
      let events;
      if (correlationId) {
        events = queries.getByCorrelationId.all({ correlationId });
      } else {
        return false;
      }

      // Filter by pattern
      if (pattern) {
        events = events.filter(event => event.cmd === pattern);
      }

      // Filter by where conditions
      if (where) {
        events = events.filter(event => {
          const data = JSON.parse(event.data);
          return this._matchesWhere(data, where);
        });
      }

      return events.length >= count;
    },

    _evaluateSequenceCondition(conditionData, pendingEventId) {
      // For sequence conditions, we need to check if all previous sequence conditions are satisfied
      const allSequenceConditions = queries.getWaitConditions.all({ pending_event_id: pendingEventId })
        .filter(c => c.condition_type === 'sequence_condition')
        .sort((a, b) => JSON.parse(a.condition_data).order - JSON.parse(b.condition_data).order);

      const currentOrder = conditionData.order;
      
      // Check if all previous sequence conditions are satisfied
      for (let i = 0; i < currentOrder; i++) {
        if (!allSequenceConditions[i] || !allSequenceConditions[i].satisfied) {
          return false;
        }
      }

      // Now check if current condition is met
      return this._evaluatePatternCondition(conditionData);
    },

    _matchesWhere(data, where) {
      for (const [key, condition] of Object.entries(where)) {
        const value = data[key];
        
        if (typeof condition === 'object' && condition !== null) {
          // Handle operators like { $gte: 80 }
          for (const [operator, expectedValue] of Object.entries(condition)) {
            switch (operator) {
              case '$gte':
                if (!(value >= expectedValue)) return false;
                break;
              case '$gt':
                if (!(value > expectedValue)) return false;
                break;
              case '$lte':
                if (!(value <= expectedValue)) return false;
                break;
              case '$lt':
                if (!(value < expectedValue)) return false;
                break;
              case '$eq':
                if (value !== expectedValue) return false;
                break;
              case '$ne':
                if (value === expectedValue) return false;
                break;
              default:
                return false;
            }
          }
        } else {
          // Direct equality check
          if (value !== condition) return false;
        }
      }
      return true;
    },

    _checkPendingEventConditions(pendingEventId) {
      const pendingEvent = queries.getPendingEventById.get({ id: pendingEventId });
      if (!pendingEvent || pendingEvent.status !== 'pending') {
        return false;
      }

      const waitConditions = JSON.parse(pendingEvent.wait_conditions);
      const conditions = queries.getWaitConditions.all({ pending_event_id: pendingEventId });

      // Evaluate each condition and update satisfaction status
      for (const condition of conditions) {
        const isSatisfied = this._evaluateCondition(condition);
        
        if (isSatisfied && !condition.satisfied) {
          // Update condition as satisfied
          queries.updateWaitConditionSatisfied.run({ id: condition.id, satisfied: true });
          condition.satisfied = true;
        }
      }

      // Check if event is ready to execute based on wait type
      let isReady = true; // Start with true, and set to false if any required condition is not met
      
      if (waitConditions.all) {
        // All 'all_condition' types must be satisfied
        const allConditions = conditions.filter(c => c.condition_type === 'all_condition');
        const satisfiedAllConditions = allConditions.filter(c => c.satisfied);
        if (allConditions.length === 0 || satisfiedAllConditions.length !== allConditions.length) {
          isReady = false;
        }
      }
      
      if (waitConditions.any) {
        // At least one 'any_condition' type must be satisfied  
        const anyConditions = conditions.filter(c => c.condition_type === 'any_condition');
        const satisfiedAnyConditions = anyConditions.filter(c => c.satisfied);
        if (anyConditions.length === 0 || satisfiedAnyConditions.length === 0) {
          isReady = false;
        }
      }
      
      if (waitConditions.count) {
        // The count condition must be satisfied
        const countConditions = conditions.filter(c => c.condition_type === 'count_condition');
        const satisfiedCountConditions = countConditions.filter(c => c.satisfied);
        if (countConditions.length === 0 || satisfiedCountConditions.length === 0) {
          isReady = false;
        }
      }
      
      if (waitConditions.sequence) {
        // All sequence conditions must be satisfied
        const sequenceConditions = conditions.filter(c => c.condition_type === 'sequence_condition');
        const satisfiedSequenceConditions = sequenceConditions.filter(c => c.satisfied);
        if (sequenceConditions.length === 0 || satisfiedSequenceConditions.length !== sequenceConditions.length) {
          isReady = false;
        }
      }

      // If no wait conditions are specified, the event should not be ready
      if (!waitConditions.all && !waitConditions.any && !waitConditions.count && !waitConditions.sequence) {
        isReady = false;
      }

      if (isReady) {
        queries.updatePendingEventStatus.run({ id: pendingEventId, status: 'ready' });
        return true;
      }

      return false;
    },

    checkAllPendingEvents() {
      const pendingEvents = queries.getPendingEventsByStatus.all({ status: 'pending' });
      
      // Check conditions for all pending events
      for (const pendingEvent of pendingEvents) {
        this._checkPendingEventConditions(pendingEvent.id);
      }

      // Return events that are now ready
      return queries.getPendingEventsByStatus.all({ status: 'ready' });
    },

    executeReadyEvents(model, callbacks) {
      const readyEvents = queries.getPendingEventsByStatus.all({ status: 'ready' });
      const executedEvents = [];

      for (const pendingEvent of readyEvents) {
        try {
          const eventData = JSON.parse(pendingEvent.event_data);
          
          // Execute the event
          const result = this.store(eventData, model, callbacks);
          
          // Mark as executed
          queries.updatePendingEventStatus.run({ id: pendingEvent.id, status: 'executed' });
          
          executedEvents.push({ pendingEvent, result });
        } catch (error) {
          console.error(`Failed to execute pending event ${pendingEvent.id}:`, error);
        }
      }

      return executedEvents;
    },

    expirePendingEvents() {
      const now = datetime();
      const expiredEvents = queries.getExpiredPendingEvents.all({ now });
      
      for (const event of expiredEvents) {
        queries.updatePendingEventStatus.run({ id: event.id, status: 'expired' });
      }

      return expiredEvents;
    },

    cancelPendingEvent(pendingEventId) {
      const pendingEvent = queries.getPendingEventById.get({ id: pendingEventId });
      if (pendingEvent && pendingEvent.status === 'pending') {
        queries.updatePendingEventStatus.run({ id: pendingEventId, status: 'cancelled' });
        return true;
      }
      return false;
    },

    getPendingEventsByCorrelation(correlationId) {
      return queries.getPendingEventsByStatus.all({ status: 'pending' })
        .filter(event => event.correlation_id === correlationId);
    },

    _hasPendingEventsTables() {
      try {
        // Try to query the pending_events table to see if it exists
        db.prepare("SELECT COUNT(*) FROM pending_events WHERE 1=0").get();
        return true;
      } catch (error) {
        return false;
      }
    },
  };

  // don't use outside of testing!
  if (options.risky) {
    queries.drop = db.query("DROP TABLE IF EXISTS queue");
    methods.reset = function () {
      queries.drop.run();
      queries.create.run();
    };
  }

  return { _queries: queries, ...methods };
};

export { initQueue, eventCallbacks };
