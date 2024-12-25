# Basic Database Setup

## Events Sourcing

This is my attempt to make a quick and easy event recording db that is a simple system for storing commands and their data to be reissued.

This will have a databse initializer whose main (only) table is the queue and uses rowid as id, datetime, user, ip address, cmd, data

To use, import initQueue and call it with an object that has options:

- dbname is the filename for the sqlite file to house the event log. default: data/events.sqlite
- init is the set of options to pass to sqlite. default: create:true, strict:true. [bun's sqlite](https://bun.sh/docs/api/sqlite)
- hash is an object that one can pass options for the algorithms. default: none. [bun's options](https://bun.sh/docs/api/hashing#bun-password)
- noWAL. Set to true to not have Write Ahead Log mode. Typically recommended to have WAL but probably doesn't matter in this case as this is super simple.
- test. If true, it will add a reset function on the methods allowing one to wipe out the log. Just use this for testing. Seriously.

initQueue returns an object {queries, methods}. The queries are for the db queries directly. This should probably not be accessed. The methods object returns:

- `retrieveByID(id):row`. Given a rowid, retrieves an event. Probably not needed outside of the internals.
- `async store({user ='', ip ='', cmd, data ={}}, model, cb):void`
  This does the actual storing. user and ip help track what is going on and used in authorization. The cmd is a string and should match a function name on the model being used. Data is whatever should be passed into that function.The model and cb parameters are passed along to execute. See that one.
  Store is async as it hashes the value of user_password if present in the data. This is async operation.
- `async execute(row, model, cb):void`. Row is the event row object stored in the db. It consists of the user, ip address, cmd, data, and datetime. Model is the interface to the changing database that the events are manipulating. See the model section below. The callback cb is an object which is explained under callback
- `cycleThrough(model, doneCB, whileCB, rowid):void`. This is how one can loop through a bunch of already stored events and execute them to evolve the model. doneCB will be called once the loop is done. the whileCB is called after each event; this is a do-nothing by default if nothing is provided; it should be similar setup as the execute function's cb. rowid is a starting place if one wants to start at a particular row.

### Model

This is the interface to, presumably, another sqlite database, but it could be whatever. The idea is that this is the backend with the data in a stored form for easy retrieval. The events are storing data for easy replay while the model is the current state.

It should be an object with a queries object, methods object. The methods object should have a `_default` key that tells what to do when a command is not recognized. Authorization and roles should all be handled prior to the event saving. A tables function can be passed to set up the tables for use in the model databse.

Methods are given `data, model.queries, {datetime, user, ip, cmd, id}` That last stuff is the row minus the data. The queries object allows the function to access the queries to the database that have been defined. Otherwise, it can't see the database.

Queries can be used however, but the presumption is that they are db.query objects.

The file model.js exports the function modelSetup which takes in some options (dbName: database name for model, WAL mode if desired, init for initiating the database). The modelSetup creates a model with several premade queries and methods.

The parsing is in part `dbName = "data/model.sqlite", init = {create:true, strict: true}, deletions = " ", tables, queries, methods, done=null, error=null}` . One can also pass in a default function for processing unknown commands. If the stub:true option is passed in, then it .

### CB

The envisioned use of the callback is to trigger new webpage generations and to notify listeners of changes.

It should be an object which takes in a command and produces a callback function that should accept (res, row) arguments where row is the all the inputs stored in the event and the res is whatever the model methods may have returned, if anything.

The whileCB in the cycleThrough is modelled the same way though typically, one would not want to act on most of that. The doneCB takes no arguments. One can think of it as a "compile all static assets and assume everything has changed".

The callback should have an `_error` method and a `_default` method. The default takes in the same arguments and is just there to catch any undefined behavior. The error method takes in a single object why has `{msg, data, user, ip, roles, cm, id, datetime}` at a minimum (row data and a message). If the error was an actual error thrown while processing the particular exceutions, then it also includes the error object as error and the response res which is probably undefined, but could be defined depending on where the error happened.
