import { Database } from "bun:sqlite";
import { renameSync, unlinkSync, existsSync, mkdirSync } from "fs";
import { dirname } from "path";

const modelSetup = (options = {}) => {
  const defult =
    options.default ??
    ((data, meta) => {
      const { cmd } = meta;
      console.log(`${cmd} is unknown to model.`, `The data is`, data);
      return "";
    });

  if (options.stub) {
    return {
      _queries: {},
      _db: {},
      _default: defult,
      _done: () => {},
      _error: () => {},
    };
  }

  const {
    dbName = "data/model.sqlite",
    init = { create: true, strict: true },
    deletions = " ",
    tables,
    queries,
    methods,
    done = null,
    error = null,
  } = options;
  // this allows for wiping out existing model and starting fresh
  if (options.reset) {
    const reset = options.reset;

    // [] => move data/model.sqlite to data/old-model.sqlite
    // [newName] => move data/model.sqlite to newName; if newName is '' then delete model
    // [oldName, newName] => move from old to new; if new is '' delete old
    let oldName, newName;
    try {
      if (reset.length === 0) {
        // writes dbName to dbName-old.sqlite by default
        [oldName, newName] = [dbName, dbName.replace(".", "-old.")];
      } else if (reset.length === 1) {
        //uses default old name, but takes in new name. deletes if empty string
        [oldName, newName] = [dbName, reset[0]];
      } else {
        [oldName, newName] = reset;
      }
      if (newName) {
        renameSync(oldName, newName);
        console.log("Database file renamed successfully", oldName, newName);
      } else {
        try {
          unlinkSync(oldName);
          console.log("Deleted database file", oldName);
        } catch (e) {
          // File doesn't exist, which is fine
          if (e.code !== "ENOENT") {
            throw e;
          }
        }
      }
    } catch (error) {
      console.error("Error munging files:", error, oldName, newName);
    }
  }

  // Ensure the directory exists
  const dbDir = dirname(dbName);
  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true });
  }

  const db = new Database(dbName, init);
  if (options.WAL) db.exec("PRAGMA journal_mode = WAL;");

  if (tables) {
    tables(db);
  }

  const qs = queries ? queries(db) : {};
  const ms = methods ? methods(qs, db) : {};

  return {
    _db: db,
    _queries: qs,
    _default: defult,
    _done: done ?? (() => {}), //row, res is arguments for recording that the event happened.
    _error: error ?? (() => {}), // receives an error object for storing
    ...ms,
    get(cmd, data) {
      try {
        return qs[cmd].get(data);
      } catch (e) {
        throw new Error(
          `Error in using query command ${cmd} with data ${data}`,
          { cause: e },
        );
      }
    },
    all(cmd, data) {
      try {
        return qs[cmd].all(data);
      } catch (e) {
        throw new Error(
          `Error in using query command ${cmd} with data ${data}`,
          { cause: e },
        );
      }
    },
  };
};

export { modelSetup };
