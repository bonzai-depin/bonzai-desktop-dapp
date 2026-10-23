import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

test('concurrent hardware requests share one background probe and return live memory immediately', async () => {
  const source=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
  const start=source.indexOf('let _cachedSystemInfo = null;');
  const end=source.indexOf('// Restore user', start);
  const calls=[];
  let release;
  const pending=new Promise(resolve=>{release=resolve;});
  const context=vm.createContext({os:{totalmem:()=>32000,freemem:()=>16000},getLocalIP:()=> '127.0.0.1',process:{platform:'darwin'},performance,console:{log(){},warn(){}},si:Object.fromEntries(['mem','graphics','cpu','osInfo'].map(name=>[name,()=>{calls.push(name);return pending;}]))});
  vm.runInContext(source.slice(start,end),context);
  const results=await Promise.all([context.systemInformation(),context.systemInformation(),context.systemInformation()]);
  assert.equal(results[0].ramAvailable,16000);
  assert.equal(calls.length,4);
  release({});
  await new Promise(resolve=>setImmediate(resolve));
  await context.systemInformation();
  assert.equal(calls.length,4);
});
