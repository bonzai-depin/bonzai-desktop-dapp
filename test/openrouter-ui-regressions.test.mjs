import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {parse as parseVue} from '@vue/compiler-sfc';
import {parse} from 'acorn';
import {userFacingError} from '../src/services/userFacingError.js';
test('credit errors omit Electron transport details, including saved error strings',()=>{
 assert.equal(userFacingError("Error invoking remote method 'model-chat-stream': Error: Your OpenRouter spending limit or credits have been reached."),'Your OpenRouter spending limit or credits have been reached.');
 assert.equal(userFacingError('TypeError: Cannot read properties of null'),'Generation could not finish. Please try again.');
});
const source=parseVue(fs.readFileSync(new URL('../src/components/Generative3D.vue',import.meta.url),'utf8')).descriptor.script.content;
const ast=parse(source,{ecmaVersion:'latest',sourceType:'module'});
function declaration(name){let found;function walk(node){if(!node||typeof node!=='object')return;if(node.type==='VariableDeclarator'&&node.id.name===name)found=node;for(const val of Object.values(node)){if(Array.isArray(val))val.forEach(walk);else if(val&&typeof val==='object')walk(val);}}walk(ast);return source.slice(found.init.start,found.init.end);}
test('3D remote readiness never loads or probes a local LLM',async()=>{
 const context=vm.createContext({remoteInference:{active:true,model:'remote/code'},refreshRemoteInference:async()=>{},lastStatus:{value:''},codeModel:{value:{}},window:{electronAPI:new Proxy({},{get(){throw new Error('Unexpected local call');}})}});
 const load=vm.runInContext(`(${declaration('loadModelForGenerationRaw')})`,context);
 await load();assert.equal(context.lastStatus.value,'Using remote/code');
});
test('3D streams through the configured transport without querying local context',async()=>{
 let subscriber;const context=vm.createContext({remoteInference:{active:true},performance,codeModel:{value:{}},window:{electronAPI:{completionBudget:()=>{throw new Error('Local context queried');},onChatToken:cb=>{subscriber=cb;return()=>{};},chatStream:async()=>{subscriber('const ');subscriber('scene');return {text:'const scene',model:'remote/code',usage:{completion_tokens:2}}}}}});
 const call=vm.runInContext(`(${declaration('callLLMRaw')})`,context);const updates=[];
 const result=await call('Create a scene',{maxTokens:8192},chunk=>updates.push(chunk.text));
 assert.deepEqual(updates,['const ','const scene']);assert.equal(result.text,'const scene');
});
test('OpenRouter chat forwards tokens over IPC before completion',async()=>{
 const main=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
 const tree=parse(main,{ecmaVersion:'latest',sourceType:'module'});
 const fn=tree.body.find(n=>n.type==='FunctionDeclaration'&&n.id.name==='remoteChat');
 let finish;const hold=new Promise(r=>finish=r);let first;const tokenSeen=new Promise(r=>first=r);const events=[];
 const context=vm.createContext({AbortController,remoteChatHistory:[],_setChatAbort:()=>{},openRouter:{models:async()=>[{id:'remote/chat',context:32768}],status:()=>({model:'remote/chat',maxTokens:2048}),complete:async({onToken})=>{onToken('Hello');first();await hold;onToken(' world');return{text:'Hello world'};}}});
 const chat=vm.runInContext(`(${main.slice(fn.start,fn.end)})`,context);
 let completed=false;const pending=chat({sender:{id:1,isDestroyed:()=>false,send:(channel,text)=>events.push({channel,text})}},{message:'Hi',isolated:true},true).then(v=>{completed=true;return v;});
 await tokenSeen;assert.equal(completed,false);assert.deepEqual(events,[{channel:'chat-token',text:'Hello'}]);finish();assert.equal(await pending,'Hello world');
});
