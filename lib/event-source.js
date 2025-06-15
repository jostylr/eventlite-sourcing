import { Database } from "bun:sqlite";
import { existsSync, mkdirSync } from "fs";
import { dirname } from "path";

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
  } = options;

  // Ensure the directory exists
  const dbDir = dirname(dbName);
  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true });
  }

  const db = new Database(dbName, init);
  if (options.WAL) db.exec("PRAGMA journal_mode = WAL;");
  if (options.reset) {
    db.query("DROP TABLE IF EXISTS queue").run();
  }
  const create = db.query(
    "CREATE TABLE IF NOT EXISTS queue ( id INTEGER PRIMARY KEY AUTOINCREMENT, version INTEGER DEFAULT 1, datetime INTEGER NOT NULL, user TEXT, ip TEXT, cmd TEXT NOT NULL, data TEXT, correlation_id TEXT, causation_id INTEGER, metadata TEXT); ",
  );
  create.run();

  // Create indexes for efficient querying
  db.query(
    "CREATE INDEX IF NOT EXISTS idx_correlation_id ON queue(correlation_id)",
  ).run();
  db.query(
    "CREATE INDEX IF NOT EXISTS idx_causation_id ON queue(causation_id)",
  ).run();

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
        cb = this._cb;
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
      return this.execute(row, model, cb);
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
        (cb[cmd] ?? cb._default)(res, row); //res is whatever returned for cb to take an action. Probably some data and some webpages to update, notify
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
        cb._error(errObj);
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
