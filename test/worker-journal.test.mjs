import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createWorkerJournal } from '../src/main/workerJournal.js';
test('durable receipts retain paid replay protection beyond 1000 runs and migrate only once',()=>{
 const db=new DatabaseSync(':memory:');
 db.transaction=fn=>()=>{db.exec('BEGIN');try{fn();db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}};
 const legacy={value:{old:{createdAt:1,paidId:'old-payment',status:'completed'}},get(){return this.value;},delete(){this.value={};}};
 try {
  const journal=createWorkerJournal(()=>db,legacy);assert.equal(journal.get('old').status,'completed');
  for(let i=0;i<1002;i++)journal.set(`run-${i}`,{createdAt:i+2,paidId:`paid-${i}`,status:'completed'});
  assert.equal(Object.keys(journal.all()).length,1003);assert.ok(journal.hasPaid('old-payment'));
  assert.throws(()=>journal.set('duplicate',{createdAt:9999,paidId:'old-payment'}),/UNIQUE/);
  assert.equal(createWorkerJournal(()=>db,legacy).get('old').status,'completed');
  assert.equal(journal.list().length,100);
 }finally{db.close();}
});
