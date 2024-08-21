import {Database} from "bun:sqlite";
import { renameSync, unlinkSync } from "fs";

const modelSetup = (options ={}) => {
  
  const { dbName = "data/model.sqlite", init = {create:true, strict: true}, deletions = " " } = options;
  // this allows for wiping out existing model and starting fresh
  if (options.reset) {
    const reset = options.reset;
      
    // [] => move data/model.sqlite to data/old-model.sqlite
    // [newName] => move data/model.sqlite to newName; if newName is '' then delete model
      // [oldName, newName] => move from old to new; if new is '' delete old
    try{
      let oldName, newName; 
      if (reset.length === 0) { // writes dbName to dbName-old.sqlite by default
        [oldName, newName] = [dbName, dbName.replace('.', '-old.')]
      } else if (reset.length === 1) { //uses default old name, but takes in new name. deletes if empty string
        [oldName, newName] = [dbName, reset[0]];
      } else {
        [oldName, newName] = reset;
      }
      if (newName) {
        renameSync(oldName, newName); 
      console.log("Database file renamed successfully", oldName, newName );
      } else {
        unlinkSync(oldName);
        console.log("Deleted database file", oldName);
      }  
    } catch (error) {
      console.error("Error munging files:", error, oldName, newName);
    }
  }
  const stateDB = new Database(dbName, init);
  if (options.WAL) stateDB.exec("PRAGMA journal_mode = WAL;");

  //the user table should exist before calling this. If not, this creates it in a barebones way
  stateDB.query('CREATE TABLE IF NOT EXISTS users (user_id INTEGER NOT NULL PRIMARY KEY, user_name TEXT NOT NULL UNIQUE)').run();
  stateDB.query('CREATE TABLE IF NOT EXISTS user_pwds (user_id, pwd TEXT NOT NULL)').run();
  stateDB.query('CREATE TABLE IF NOT EXISTS access_ip (ip TEXT NOT NULL PRIMARY KEY)').run();
  stateDB.query('CREATE TABLE IF NOT EXISTS access_group_names (group_id INTEGER NOT NULL PRIMARY KEY, group_name TEXT NOT NULL UNIQUE)').run();
  stateDB.query('CREATE TABLE IF NOT EXISTS access_group_user (group_id INTEGER NOT NULL, user_id INTEGER NOT NULL, PRIMARY KEY(group_id, user_id))').run();
  stateDB.query('CREATE TABLE IF NOT EXISTS access_roles (access_role TEXT NOT NULL, user_id INTEGER NOT NULL)').run();
  stateDB.query('CREATE INDEX IF NOT EXISTS access_user_roles ON access_roles(user_id)').run();

  const model = {
    db: stateDB, 
    queries : {
      isIPAllowed : stateDB.query('SELECT 1 FROM access_ip WHERE ip = $ip LIMIT 1'),
      isInGroup : stateDB.query('SELECT 1 FROM access_group_user WHERE user_id = $id AND group_id = $group LIMIT 1'),
      selectRoles : stateDB.query('SELECT access_role FROM access_roles WHERE user_id = $user'),
      storeUser : stateDB.query('INSERT INTO users (user_name) VALUES ($user_name)'),
      storePassword : stateDB.query('INSERT INTO user_pwds (user_id, pwd) VALUES ($user_id, $pwd)'),
      insertNewPassword : stateDB.query('UPDATE user_pwds SET pwd=$pwd WHERE user_id= (SELECT (user_id) FROM users WHERE user_name = $user_name)'),
      getPassword : stateDB.query('SELECT pwd FROM users u INNER JOIN user_pwds p USING (user_id) WHERE u.user_name = $user_name'),
      //deletions allows more removals based on user ids
      removeUser : stateDB.query(
        `BEGIN TRANSACTION; ${deletions}
        DELETE FROM user_pwds WHERE user_id=$user_id;
        DELETE FROM access_group_user WHERE user_id=$user_id;
        DELETE FROM access_roles WHERE user_id=$user_id;
        DELETE FROM users WHERE user_id=$user_id;
        COMMIT;
        `)
    },
    //methods are passed in the queries object. 
    methods : {
      registerUser ({user_name='', user_password=''}, stateDB) {
        try {
          if (!user_name) throw('No user_name provided when trying to register new user');
          if (!user_password) throw(`No password provided when registering ${user_name}`);
          let [user_id, _] = stateDB.storeUser.run({user_name});
          stateDB.storePassword({user_id, user_password});
        } catch (e) {
          throw new Error(`Error in storing ${user_name}`, {cause:e});
        }
      },  
      updatePWD({user_name, user_password}, stateDB) {
        try {
          stateDB.insertNewPassword.run({user_name, user_password});
        } catch (e) {
          throw new Error(`Error in inserting new password of ${user_name}`);
        }
      },
    
      async login({user_name, user_password}, stateDB) {
        try {
          let {hashed_pwd, user_id} = stateDB.getPassword({user_name}).get();
          let valid = false;
          if (hashed_pwd && user_password) {
            valid = Bun.password.verify(user_password, hashed_pwd);
          }
          if (valid)  {
            return user_id; //verified
          } else {
            return false; 
          }
        } catch (e) {
          throw new Error(`Error in verifying username ${user_name} and ${user_password}`, {cause:e});
        }
      },
  
      verifyToken({user_name, token}, stateDB) {
        let user_id = stateDB.verifyToken({user_name, token}).get();
        return user_id;
      },

      removeToken({user_id}) {
        
      },

      deleteUser({user_id}, stateDB) {
        try {
          stateDB.removeUser(user_id);   
        } catch (e) {
          throw new Error(`Error in deleting ${user_id}`, {cause:e});
        }
      } 
    },
    roles : {

    },

  

  // this is some authorization access logic checking
  // all means everyone's allowed so no checking
  // user means user is authorized; data should have user and they should be the same
  // group means group should be in data and the database checks groupid and userid
  // net means needs ip to be on iplist to get passed
  // everything else is custom roles and we handle it by grabbing roles of user and then checking.  
  // roles should be a set, stateDB needs to have queries for selectRoles, groups, net 
  authorize({user, ip, roles, data}) {
    const stateDB = this.queries;
    if ( (!roles) || (roles.size === 0) || roles.has('all') )  return true; 
    if (roles.has('user_id')) {
      if (data.user && user === data.user)  return true;
    }
    if (roles.has('user')) {
      if (user) return true;
    }
    if (roles.has('net)')){
      if (stateDB.isIPAllowed.get(ip))  return true;
    }
    if (roles.has('group') && data.groupID) {
      if (stateDB.isInGroup.get({id, group:data.groupID})) return true; 
    }
    //get all roles for user
    let userRoles = stateDB.selectRoles.all({user});
    return userRoles.some(role => roles.has(role));
  },

};

return model; 

};

export {modelSetup};


