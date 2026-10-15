import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeOperation,generationPatch,orderOperations} from '../src/services/activity/operations.js';
test('stages can reset measured progress without inventing overall completion',()=>{
 const old=mergeOperation(null,{id:'one',status:'running',progress:100},10);
 const next=mergeOperation(old,{id:'one',status:'running',stage:'encoding',progress:0},20);
 assert.equal(next.progress,0);assert.equal(next.startedAt,10);assert.equal(next.finishedAt,null);
 assert.equal(mergeOperation(next,{status:'completed'},30).finishedAt,30);
});
test('progress only exists when measured, and enhancements route to video',()=>{
 assert.equal(generationPatch({generation_id:'1',kind:'video_enhance'}).mode,'video');
 assert.equal(generationPatch({generation_id:'1',kind:'video_enhance'}).progress,null);
 assert.equal(generationPatch({generation_id:'2',kind:'qwen3-tts'}).mode,'music');
});
test('errors stay prominent while idle teams and completed work remain quiet',()=>{
 const rows=[{id:'idle',status:'monitoring'},{id:'done',status:'completed'},{id:'run',status:'running'},{id:'error',status:'failed'}];
 assert.deepEqual(orderOperations(rows).map(o=>o.id),['error','run','idle','done']);
});
