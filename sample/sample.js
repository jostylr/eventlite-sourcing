import {initQueue, modelSetup} from '../index.js';

const {methods} = initQueue({
  //dbName: 'events.sqlite',
  test:true
});

const model = modelSetup({
  //dbName : 'sample.sqlite'
});


let db = model.db;
db.query('DROP TABLE IF EXISTS variables').run();
db.query('CREATE TABLE variables (name TEXT PRIMARY KEY, value NUMBER)').run();

methods.reset();

let events = [
  ['store', {name: 'x', value:5}], 
  ['store', {name: 'y', value:7}],
  ['add', {left: 'x', right:'y', name:'z'}],
  ['store', {name:'x', value:8}],
  ['add', {left:'z', right:'x', name:'w'}]
].map( ([cmd, data]) => ({cmd, data}));



let modelMethods = [
  ['store', 
    ['all'], 
    ({name, value}, state) => {
      state.store.run({name, value});
      return [`${name} is now ${value}`, 'stored'];
    }
  ],
  ['add', 
    ['all'], 
    ({left, right, name}, state) => {
        let {value:l} = state.lookup.get(left);
        let {value:r} = state.lookup.get(right) ||{};
        let sum = l+r;
        console.log('left:', l, 'right', r, 'sum', sum)
        state.store.run({name, value:sum}); 
        return [`${name}, as a result of addition, is now ${sum}`, 'added and stored'];
      }
  ]
];

modelMethods.forEach( ([cmd, roles, executor]) => {
  model.methods[cmd] = executor;
  model.roles[cmd] = new Set(roles);
});

model.queries = {
  ...model.queries,
  store : db.query('INSERT INTO variables(name, value) VALUES ($name, $value) ON CONFLICT (name) DO UPDATE SET value = excluded.value'),
  lookup : db.query('SELECT (value) FROM variables WHERE name = $name'),
};
 

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
  (item) => methods.store(item, model, cb)
);

