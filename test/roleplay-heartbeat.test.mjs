import test from 'node:test';
import assert from 'node:assert/strict';
import { heartbeatConfig, heartbeatDue } from '../src/services/roleplayHeartbeat.js';
test('heartbeat bounds prevent unlimited or malformed background generation',()=>{
 assert.deepEqual(heartbeatConfig(),{idleTimeout:5,messageInterval:15,maxMessages:12});
 assert.deepEqual(heartbeatConfig({idleTimeout:-1,messageInterval:0,maxMessages:999}),{idleTimeout:1,messageInterval:5,maxMessages:48});
});
test('background work requires inactivity, elapsed interval and no foreground generation',()=>{
 const input={enabled:true,busy:false,lastActive:0,lastRun:0,now:16*60000,config:{}};
 assert.equal(heartbeatDue(input),true);
 assert.equal(heartbeatDue({...input,lastActive:15*60000}),false);
 assert.equal(heartbeatDue({...input,lastRun:14*60000}),false);
 assert.equal(heartbeatDue({...input,busy:true}),false);
 assert.equal(heartbeatDue({...input,enabled:false}),false);
});

test('activity bar distinguishes paused, finishing, busy and next check',async()=>{
 const {heartbeatActivity}=await import('../src/services/roleplayHeartbeat.js');
 const base={config:{},now:60000,lastActive:0,lastRun:0};
 assert.equal(heartbeatActivity({...base,enabled:true}).remaining,840);
 assert.equal(heartbeatActivity({...base,enabled:false}).stage,'Paused');
 assert.equal(heartbeatActivity({...base,enabled:false,generating:true}).stage,'Finishing current update');
 assert.equal(heartbeatActivity({...base,enabled:false,count:12}).stage,'Update limit reached');
 assert.equal(heartbeatActivity({...base,enabled:true,busy:true}).stage,'Waiting for current generation');
});
