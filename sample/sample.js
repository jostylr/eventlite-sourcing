import {initQueue, modelSetup} from '../index.js';

const evQ = initQueue({
  //dbName: 'events.sqlite',
  risky:true
});

const model = modelSetup({
  reset : [''],
  tables (db) {
    db.query('CREATE TABLE variables (name TEXT PRIMARY KEY, value NUMBER)').run();
  },
  
  queries (db) {
    return {
      store : db.query('INSERT INTO variables(name, value) VALUES ($name, $value) ON CONFLICT (name) DO UPDATE SET value = excluded.value'),
      lookup : db.query('SELECT (value) FROM variables WHERE name = $name')
    };
  },

  methods (queries) {
    return {
      store ({name, value}, ) {
        queries.store.run({name, value})
        return [`${name} is now ${value}`, 'stored'];
      },
        
      add ({left, right, name}) {
        let {value:l} = queries.lookup.get(left);
        let {value:r} = queries.lookup.get(right) ||{};
        let sum = l+r;
        //console.log('left:', l, 'right', r, 'sum', sum)
        queries.store.run({name, value:sum}); 
        return [`${name}, as a result of addition, is now ${sum}`, 'added and stored'];
      }
    }
  }
});


evQ.reset();

let events = [
  ['store', {name: 'x', value:5}], 
  ['store', {name: 'y', value:7}],
  ['add', {left: 'x', right:'y', name:'z'}],
  ['store', {name:'x', value:8}],
  ['add', {left:'z', right:'x', name:'w'}]
].map( ([cmd, data]) => ({cmd, data}));


let cb = 
{ 
  _default(res, row) {
    console.log(`${row.datetime}: ${res}`);
  }, 

  _error({msg, ...other}) {
    console.log('ERROR:', msg, other);
  } 
};

events.forEach(
  (item) => evQ.store(item, model, cb)
);

