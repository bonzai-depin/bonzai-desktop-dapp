import test from 'node:test';
import assert from 'node:assert/strict';
import {readLocalExecutionStatus} from '../src/services/localExecutionStatus.js';
const ready={running:true,pid:11,port:3001,phase:'ready',inFlight:0};
const read=(shared=ready,slots=[],instances=[])=>readLocalExecutionStatus({getRuntimeState:()=>shared,getMetrics:async()=>({slots})},{inventory:()=>instances});

test('shared chat/swap inference is visible when the parallel pool is empty',async()=>{
 const result=await read(ready,[{is_processing:true},{is_processing:false}]);
 assert.equal(result.loaded,1);assert.equal(result.activeRequests,1);assert.equal(result.activityComplete,true);
});
test('tracked requests and server slots are not counted twice; pool requests remain independent',async()=>{
 const result=await read({...ready,inFlight:2},[{is_processing:true}],[{phase:'ready',inFlight:1},{phase:'loading',inFlight:0}]);
 assert.equal(result.loaded,2);assert.equal(result.loading,1);assert.equal(result.activeRequests,3);
});
test('starting, idle and stopped are distinct; unavailable slot metrics are not idle evidence',async()=>{
 assert.equal((await read({...ready,phase:'loading'})).loading,1);
 assert.equal((await read({...ready,phase:'loading'})).loaded,0);
 assert.equal((await read()).activeRequests,0);
 assert.equal((await read()).loaded,1);
 assert.equal((await read({running:false,phase:'stopped',inFlight:0})).loaded,0);
 assert.equal((await read(ready,null)).activityComplete,false);
 assert.equal((await read(ready,[{state:1}])).activityComplete,false);
});
test('model swap during metric collection discards activity from the old process',async()=>{
 let state=ready;
 const result=await readLocalExecutionStatus({getRuntimeState:()=>state,getMetrics:async()=>{state={...ready,pid:12,port:3002,phase:'loading'};return {slots:[{is_processing:true}]};}},{inventory:()=>[]});
 assert.equal(result.loading,1);assert.equal(result.loaded,0);assert.equal(result.activeRequests,0);
});
