import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';

test('fast failures, unreviewed previews and unsaved outputs cannot win the quality benchmark',()=>{
 const dir=mkdtempSync(join(tmpdir(),'bonzai-benchmark-report-'));
 try{
  const fixture=(id,extra)=>({fixture:id,seed:17,success:true,persisted:true,reopened:true,errors:[],generationMs:1000,calls:[],...extra});
  writeFileSync(join(dir,'manifest.json'),JSON.stringify({label:'test',revision:'test',results:[fixture('failed',{success:false,generationMs:1}),fixture('unreviewed',{}),fixture('unsaved',{persisted:false}),fixture('passed',{})]}));
  for(const id of ['unsaved','passed']){
   mkdirSync(join(dir,id+'-17'));writeFileSync(join(dir,id+'-17','visual-review.json'),JSON.stringify({status:'passed',reviewer:'test',scores:{recognizability:4,construction:4,materials:4,lighting:4,briefFidelity:4,function:4}}));
  }
  execFileSync(process.execPath,['scripts/report-3d-benchmark.mjs',dir]);
  const summary=JSON.parse(readFileSync(join(dir,'summary.json')));
  assert.equal(summary.total,4);assert.equal(summary.qualityPassed,1);assert.equal(summary.medianValidMs,1000);
  assert.deepEqual(summary.rows.filter(r=>r.valid).map(r=>r.fixture),['passed']);
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('a visually attractive game still needs recorded interaction checks',()=>{
 const dir=mkdtempSync(join(tmpdir(),'bonzai-game-report-'));
 try {
  const interaction={movement:true,collision:true,objectives:true,win:true,defeat:true,restart:true,evidence:'Keyboard playthrough recording'};
  const results=['appearance-only','played','broken-restart'].map(fixture=>({fixture,kind:'game',seed:17,success:true,persisted:true,reopened:true,errors:[],generationMs:1000,calls:[]}));
  writeFileSync(join(dir,'manifest.json'),JSON.stringify({label:'test',results}));
  for(const {fixture} of results){
   mkdirSync(join(dir,fixture+'-17'));
   writeFileSync(join(dir,fixture+'-17','visual-review.json'),JSON.stringify({status:'passed',reviewer:'test',scores:{recognizability:4,construction:4,materials:4,lighting:4,briefFidelity:4,function:4},
    ...(fixture==='appearance-only'?{}:{interaction:{...interaction,...(fixture==='broken-restart'?{restart:false}:{})}})}));
  }
  execFileSync(process.execPath,['scripts/report-3d-benchmark.mjs',dir]);
  const summary=JSON.parse(readFileSync(join(dir,'summary.json')));
  assert.equal(summary.total,3);assert.equal(summary.qualityPassed,1);
  assert.deepEqual(summary.rows.filter(r=>r.valid).map(r=>r.fixture),['played']);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
