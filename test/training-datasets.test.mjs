import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../src/services/trainingDatasets.js',import.meta.url),'utf8');
const {saveTrainingDataset,listTrainingDatasets}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
test('curated examples persist locally, while invalid data and failed writes never report success',async()=>{
 let stored=[];global.window={electronAPI:{store:{get:async()=>structuredClone(stored),set:async(k,v)=>{stored=structuredClone(v)}}}};
 const rows=[{text:'My writing sample'},{prompt:'A customer question',completion:'Our ideal response'}];
 const saved=await saveTrainingDataset({name:' My voice ',purpose:'personal',rows});
 assert.equal(saved.name,'My voice');assert.deepEqual((await listTrainingDatasets())[0].rows,rows);
 for(const invalid of [[],[null],[{prompt:'Incomplete'}]])await assert.rejects(saveTrainingDataset({name:'Invalid',rows:invalid}));
 assert.equal(stored.length,1);
 window.electronAPI.store.set=async()=>{throw Error('Disk unavailable')};
 await assert.rejects(saveTrainingDataset({name:'Unsaved',rows}),/Disk unavailable/);
 assert.equal(stored.length,1);
});
