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
  const { dbName = "data/events.sqlite", init = {create:true, strict: true}, hash } = options;
  const db = new Database(dbName, init);
  if (options.WAL) db.exec("PRAGMA journal_mode = WAL;");
  if (options.reset) {
    db.query('DROP TABLE IF EXISTS queue').run();
  }
  const create = db.query('CREATE TABLE IF NOT EXISTS queue ( id INTEGER PRIMARY KEY AUTOINCREMENT, datetime INTEGER NOT NULL, user TEXT, ip TEXT, cmd TEXT NOT NULL, data TEXT); ');
  create.run();

  const queries = {
    create,
    cycle : db.prepare("SELECT id, datetime, user, ip, cmd, data FROM queue WHERE id >= $id ORDER BY id LIMIT 1000 OFFSET $offset"),
    getRowByID : db.prepare("SELECT id, datetime, user, ip, cmd, data FROM queue WHERE id = $id"),
    storeRow : db.prepare("INSERT INTO queue (datetime, user, ip, cmd, data) VALUES(unixepoch('now'),$user,$ip,$cmd,$data) RETURNING *"),
    getLastRow : db.prepare("SELECT id, datetime, user, ip, cmd, data FROM queue ORDER BY id DESC LIMIT 1")

  }    

  const methods = {

    retrieveByID(id) {
      return  queries.getRowByID.get({id});
    },


    async store({user ='', ip ='', cmd, data ={} }, model, cb) {
      if (!cmd) {
        cb._error({msg: `No command given; aborting`, priority: 2, user, ip, cmd, data});
        return;
      }
      if (!model) { model = this._model} //_model is default fallback to avoid having to always put in model
      if (!cb) {cb = this._cb} 
      // check for _hash_this key names and hash those, removing the _hash_this
      await Promise.all(
        Object.keys(data)
        .filter( (key) => key.endsWith('_hash_this'))
        .map( async (key) => {
          const trunc = key.slice(0,-10);
          const pwd = data[key];
          data[trunc] = await ( (hash) ? Bun.password.hash(pwd, hash): Bun.password.hash(pwd));
          delete data[key];
       })
      );
      
      //const results = 
      const row = queries.storeRow.get({user, ip, cmd, data:JSON.stringify(data)});
      /* doesn't seem to work just gives 0 for both
      console.log(results);
      const {lastInsertRowid:id, changes} = results;
      if (changes !== 1) {
        cb._error({msg: `rows changed was ${changes}. It should be 1. Executing last 1`, priority:1, user, ip, cmd, data, id});
      }
      */
      //let row = queries.getLastRow.get();
      //console.log(row);
      row.data = data; //JSON.parse(row.data);
      //console.log(data, row, row.data, model, cb);
      return this.execute(row, model, cb);;  
    },



//This just runs through a command and executes it
//It is generic
// it requires a method for every command
// the state should be a database that the method will manipulate
// the cb is a callback that activates any notifications, etc that need to happen
// cb should habe an error method which can be null to suppress any error stuff
// model: {queries, methods, roles, authorize}
  execute (row, model , cb) {
    const {id, datetime, user, ip, cmd, data} = row;
    /*const roles = model.roles[cmd] ?? methods.roles._default;
    let valid = model.authorize({user, ip, roles , data});
    if (!valid) {
      cb._error({ msg: `${user} at ${ip} is not authorized to invoke ${cmd}`, 
        data, user, ip, roles, cmd, id, datetime});
      return;
    }*/
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
      return res; //may be useful info
    } catch (error) {
        cb._error({ msg: `${user} at ${ip} initiated  ${cmd} that led to an error: ${error.message}`, 
          error, res, data, user, ip, /*roles,*/ cmd, id, datetime});
        return;
    }
  },

  cycleThrough(model, doneCB, whileCB = voidCB, rowid = 0) {
    let offset = 0;
    while (true) {
      let results =  queries.cycle.all({id:rowid, offset});
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