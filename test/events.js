import {initQueue, stubModel, stubCB} from "../index.js"

//eque is events-queue
const {methods:equeue} = initQueue({db:'test-events.sqlite', test: true});

equeue.reset();

equeue.store({cmd:'first', data: {name:'cool'}}, stubModel, stubCB);
