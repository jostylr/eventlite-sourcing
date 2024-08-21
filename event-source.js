import {Database} from "bun:sqlite";

const stubModel = {
  authorize () {
    return true;
  }, 
  queries : { }, 
  methods : {
    _default(data, _queries, row) {
      const {cmd} = row;
      console.log(`${cmd} is unknown to model.`, `The data is`, data);
      return '';
    } 

  }, 
  roles : {
    _default : ['all']
  }
};

const stubCB = {
  _error  (red ) {
      const  {msg, error, cmd, data, ...row} = red;
      console.log(msg, error, cmd, 'and then the data', data, 'and finally the rest of the row data', row );
  },
  _default(res, row) {
    const {cmd} = row;
    console.log(`${cmd} sent to be processed by main program with response`,res, 'and data', row.data);
  } 
}

const voidCB = {
  _error  () { },
  _default() { } 
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
  const create = db.query('CREATE TABLE IF NOT EXISTS queue ( id INTEGER PRIMARY KEY, datetime TEXT NOT NULL, user TEXT, ip TEXT, cmd TEXT NOT NULL, data TEXT); ');
  create.run();

  const queries = {
    create,
    cycle : db.query("SELECT id, datetime, user, ip, cmd, data FROM queue WHERE id >= $id ORDER BY id LIMIT 1000 OFFSET $offset"),
    getRowByID : db.query("SELECT id, datetime, user, ip, cmd, data FROM queue WHERE id = $id"),
    storeRow : db.query("INSERT INTO queue (datetime, user, ip, cmd, data) VALUES(datetime('now', 'localtime'),$user,$ip,$cmd,$data)"),
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
      if (data.user_password) { //do it here to obscure storing in database
        data.user_password = await ((hash) ? Bun.password.hash(data.user_password, hash) : Bun.password.hash(data.user_password));
      }
      const {lastInsertRowid:id, changes} = queries.storeRow.run({user, ip, cmd, data:JSON.stringify(data)});
      if (changes !== 1) {
        cb._error({msg: `rows changed was ${changes}. It should be 1. Executing last 1`, priority:1, user, ip, cmd, data, id});
      }
      let row = this.retrieveByID(id);
      row.data = JSON.parse(row.data);
      //console.log(data, row, row.data, model, cb);
      await this.execute(row, model, cb);
      return;  
    },



//This just runs through a command and executes it
//It is generic
// it requires a method for every command
// the state should be a database that the method will manipulate
// the cb is a callback that activates any notifications, etc that need to happen
// cb should habe an error method which can be null to suppress any error stuff
// model: {queries, methods, roles, authorize}
  async execute (row, model , cb) {
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
      res = await (model[cmd] ?? model._default )(data, {datetime, user, ip, cmd, id});
      (cb[cmd] ?? cb._default)(res, row); //res is whatever returned for cb to take an action. Probably some data and some webpages to update, notify
      return; 
    } catch (error) {
        cb._error({ msg: `${user} at ${ip} initiated  ${cmd} that led to an error: ${error.message}`, 
          error, res, data, user, ip, /*roles,*/ cmd, id, datetime});
        return;
    }
  },

  cycleThrough(model, doneCB, whileCB = voidCB, rowid = 0) {
    let offset = 0;
    while (true) {
      let results =  this.cycle.all({id:rowid, offset});
      if (!results) {break;}
      results.forEach(row => this.execute(row, model, whileCB)); //mainly do nothing, but have error property
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


export {initQueue, stubModel, stubCB, voidCB};