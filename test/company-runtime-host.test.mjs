import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createCompanyRuntime } from '../src/main/companyRuntime.js';
test('only the workspace dispatches commands and only the supervised worker may return results',async()=>{
  const ipc = new EventEmitter(), handlers = new Map(), app=new EventEmitter();ipc.handle=(name,fn)=>handlers.set(name,fn);
  let interrupted, worker, ui={webContents:new EventEmitter(),isDestroyed:()=>false};ui.webContents.send=()=>{};
  class Window extends EventEmitter {constructor(options){super();this.options=options;this.webContents=new EventEmitter();this.webContents.id=71;this.webContents.setWindowOpenHandler=()=>{};this.webContents.send=(channel,payload)=>this.sent={channel,payload};worker=this;}loadURL(url){this.url=url;queueMicrotask(()=>ipc.emit('company-runtime:ready',{sender:this.webContents}));return Promise.resolve();}isDestroyed(){return this.destroyed;}destroy(){this.destroyed=true;this.emit('closed');}}
  const blocks=[];
  const powerSaveBlocker={start:type=>{blocks.push(type);return 9},stop:id=>blocks.push(id)};
  const host=createCompanyRuntime({BrowserWindow:Window,ipcMain:ipc,app,powerSaveBlocker,preload:'/fixture/preload',url:'http://localhost/company-runtime.html',getUI:()=>ui,onInterrupted:id=>interrupted=id});
  try{
    await host.start();assert.equal(worker.options.show,false);assert.equal(worker.options.webPreferences.backgroundThrottling,false);
    ipc.emit('company-runtime:stream',{sender:{}},{type:'runtime-state',activeTeams:1});
    assert.deepEqual(blocks,[]);
    ipc.emit('company-runtime:stream',{sender:worker.webContents},{type:'runtime-state',activeTeams:1});
    ipc.emit('company-runtime:stream',{sender:worker.webContents},{type:'runtime-state',activeTeams:2});
    assert.deepEqual(blocks,['prevent-app-suspension']);
    ipc.emit('company-runtime:stream',{sender:worker.webContents},{type:'runtime-state',activeTeams:0});
    assert.deepEqual(blocks,['prevent-app-suspension',9]);
    ipc.emit('company-runtime:stream',{sender:worker.webContents},{type:'runtime-state',activeTeams:1});
    assert.throws(()=>handlers.get('company-runtime:invoke')({sender:{}},'approve',[]),/workspace/);
    await assert.rejects(()=>host.command('arbitraryIPC',[]),/Unsupported/);
    const value=handlers.get('company-runtime:invoke')({sender:ui.webContents},'tickRole',['team','COO']);await new Promise(resolve=>setImmediate(resolve));
    const requestId=worker.sent.payload.requestId;
    ipc.emit('company-runtime:result',{sender:{}},{requestId,value:'forged'});
    // A visible renderer can reload while the durable executor remains alive.
    ui={webContents:new EventEmitter(),isDestroyed:()=>false};ui.webContents.send=()=>{};
    ipc.emit('company-runtime:result',{sender:worker.webContents},{requestId,value:{done:true}});
    assert.deepEqual(await value,{done:true});assert.equal(worker.destroyed,undefined);
    const active=host.command('tickRole',['team','COO']);await new Promise(resolve=>setImmediate(resolve));
    worker.webContents.emit('render-process-gone');
    await assert.rejects(()=>active,/interrupted/);assert.equal(interrupted,71);
  }finally{app.emit('before-quit');assert.equal(worker.destroyed,true);assert.equal(blocks.at(-1),9);}
});
