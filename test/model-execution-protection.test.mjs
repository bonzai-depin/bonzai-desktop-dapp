import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
test('shared model cannot be unloaded or replaced during another active request',()=>{
 const guard=source.slice(source.indexOf('function assertModelIdle()'),source.indexOf('async function unloadModel('));
 let requests=1;
 const context=vm.createContext({llamaServer:{isRunning:()=>true,inFlightCount:()=>requests}});
 vm.runInContext(guard,context);
 assert.throws(()=>vm.runInContext('assertModelIdle()',context),/active request/);
 requests=0;
 assert.doesNotThrow(()=>vm.runInContext('assertModelIdle()',context));
 const load=source.slice(source.indexOf('async function loadModel('),source.indexOf('async function unloadModel('));
 assert.ok(load.indexOf('assertModelIdle();')<load.indexOf('await llamaServer.stopModel();'));
 const unload=source.slice(source.indexOf('async function unloadModel('));
 assert.ok(unload.indexOf('assertModelIdle();')<unload.indexOf('await llamaServer.stopModel();'));
});
test('foreground cancellation has no shared-process kill fallback',()=>{
 const handler=source.slice(source.indexOf('ipcMain.handle("model-abort-chat-stream"'),source.indexOf('ipcMain.handle("model-chat-vision"'));
 assert.match(handler,/_abortChat\(event.sender.id\)/);
 assert.doesNotMatch(handler,/stopModel/);
});
