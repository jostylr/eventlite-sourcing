import {Database} from "bun:sqlite";

const eventCallbacks = {
  stub: {
    _error  (red ) {
        const  {msg, error, cmd, data, ...row} = red;
        console.log(msg, error, cmd, 'and then the data', data, 'and finally the rest of the row data', row );
    },
    _default(res, row) {
      const {cmd} = row;
      console.log(`${cmd} sent to be processed by main program with response`,res, 'and data', row.data);
    } 
  }, 

  void: {
    _error  () { },
    _default() { } 
  },

  error: {
    _error  ({msg, error, cmd, data, ...row}) { 
      console.log(msg, error, cmd, 'and then the data', data, 'and finally the rest of the row data', row );
   },
    _default() { } 
  },

  done : () => {}

}



//stateDB should have db which is open database connection, methods for executing commands, 
//queries for storing db queries, and roles for saying who can do what commands. 
// options: {dbInit: {create:true, strict:true}, hash:{} for pwds, noWal:false}
const initQueue = function ( options ={}) {
  const { dbName = "data/events.sqlite", init = {create:true, strict: true}, hash, 
  datetime = () => (new Date()).toString().split(' (')[0] } = options;
  const db = new Database(dbName, init);
  if (options.WAL) db.exec("PRAGMA journal_mode = WAL;");
  if (options.reset) {
    db.query('DROP TABLE IF EXISTS queue').run();
  }
  const create = db.query('CREATE TABLE IF NOT EXISTS queue ( id INTEGER PRIMARY KEY AUTOINCREMENT, datetime INTEGER NOT NULL, user TEXT, ip TEXT, cmd TEXT NOT NULL, data TEXT); ');
  create.run();

  const queries = {
    create,
    cycle : db.prepare("SELECT id, datetime, user, ip, cmd, data FROM queue WHERE id >= $start ORDER BY id LIMIT 1000 OFFSET $offset"),
    cycle : db.prepare("SELECT id, datetime, user, ip, cmd, data FROM queue WHERE id >= $start AND id < $stop ORDER BY id LIMIT 1000 OFFSET $offset"),
    getRowByID : db.prepare("SELECT id, datetime, user, ip, cmd, data FROM queue WHERE id = $id"),
    storeRow : db.prepare("INSERT INTO queue (datetime, user, ip, cmd, data) VALUES($datetime,$user,$ip,$cmd,$data) RETURNING *"),
    getLastRow : db.prepare("SELECT id, datetime, user, ip, cmd, data FROM queue ORDER BY id DESC LIMIT 1")

  }    

  const methods = {

    retrieveByID(id) {
      return  queries.getRowByID.get({id});
    },


    store({user ='', ip ='', cmd, data ={} }, model, cb) {
      if (!model) { model = this._model} //_model is default fallback to avoid having to always put in model
      if (!cb) {cb = this._cb} 
      if (!cmd) {
        cb._error({msg: `No command given; aborting`, priority: 2, user, ip, cmd, data});
        return;
      }
      const row = queries.storeRow.get({datetime: datetime(), user, ip, cmd, data:JSON.stringify(data)});
      row.data = JSON.parse(row.data); //Would use the raw data, but this ensures that this is replayable as stringify to parse is not idempotent for odd cases
      return this.execute(row, model, cb);;  
    },



//This just runs through a command and executes it
//It is generic
// it requires a method for every command
// the state should be a database that the method will manipulate
// the cb is a callback that activates any notifications, etc that need to happen
// cb should habe an error method which can be null to suppress any error stuff
// model: {queries, methods}
  execute (row, model , cb) {
    const {id, datetime, user, ip, cmd, data} = row;
    let res; 
    try {
      if (model[cmd]) {
        res = model[cmd](data, {datetime, user, ip, cmd, id});
      } else if (model._queries[cmd]) { //simple pass through to query
        res = model.get(cmd,data);
      } else {
        res = model._default(data, {datetime, user, ip, cmd, id});
      }
      (cb[cmd] ?? cb._default)(res, row); //res is whatever returned for cb to take an action. Probably some data and some webpages to update, notify
      model._done(row, res);
      return res; //may be useful info
    } catch (error) {
        const errObj = { msg: `${user} at ${ip} initiated  ${cmd} that led to an error: ${error.message}`, 
          error, res, data, user, ip, cmd, id, datetime}
        cb._error(errObj);
        model._error(errObj);
        return;
    }
  },

  cycleThrough(model, doneCB, whileCB = voidCB, {start, stop} = {start:0, stop:null}) {
    let offset = 0;
    let fun;
    if (stop) {
      if (typeof stop === 'number') {
        fun = queries.cycleStop;
      } else if (typeof stop === 'string') {
        //figure out a date thing
      }
    } else {
       fun = queries.cycle
    }
    while (true) {
      let results =  fun.all({offset, start, stop});
      //console.log(results);
      if (!results.length) {break;}
      for (const row of results) {
        row.data = JSON.parse(row.data);
        this.execute(row, model, whileCB); 
      }//mainly do nothing, but have error property
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

  return {_queries:queries, ...methods};

};


export {initQueue, eventCallbacks};