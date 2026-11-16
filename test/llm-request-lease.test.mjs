import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { parse } from 'acorn';
import { InferenceCoordinator } from '../src/services/localInferenceCoordinator.js';
const source = fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const tree = parse(source,{ecmaVersion:'latest',sourceType:'module'});
const helper = tree.body.find(node => node.type === 'FunctionDeclaration' && node.id.name === 'runLLMRequest');
test('queued lyrics retain their requested model and cannot be split by a new image', async () => {
  const queue = new InferenceCoordinator();
  const order = [];
  const context = vm.createContext({localInference:queue,structuredClone,currentLoadedModel:{filename:'chat.gguf'},lastLoadedSpec:null,
    chatHistory:['conversation'],currentSystemPrompt:'chat instructions',
    loadModel: async (_event, spec) => queue.run('llm', () => { order.push(spec.filename);context.chatHistory=[];context.currentSystemPrompt=null; })});
  vm.runInContext(source.slice(helper.start,helper.end),context);
  const release = await queue.acquire('media');
  const input = {model:{filename:'lyrics.gguf'},isolated:true,taskLabel:'Generating lyrics'};
  const lyrics = context.runLLMRequest(input, async () => { order.push('lyrics'); });
  input.model.filename = 'changed-after-submit.gguf';
  const image = queue.run('media', () => order.push('image'));
  release();
  await Promise.all([lyrics,image]);
  assert.deepEqual(order,['lyrics.gguf','lyrics','image']);
  assert.deepEqual(Array.from(context.chatHistory),['conversation']);
  assert.equal(context.currentSystemPrompt,'chat instructions');
});

const functions = ['_setChatAbort', '_clearChatAbort', '_abortChat', 'runQueuedStream'];
test('queued stream cancellation never loads a model; concurrent requests do not abort each other', async () => {
  const queue = new InferenceCoordinator();
  const context = vm.createContext({localInference:queue, structuredClone, AbortController,
    currentLoadedModel:null,lastLoadedSpec:null,chatHistory:[],currentSystemPrompt:null,
    loadModel:async()=>assert.fail('cancelled request loaded a model')});
  vm.runInContext('const _chatAbortControllers = new Map();'+source.slice(helper.start,helper.end)+functions.map(name=>{
    const node=tree.body.find(n=>n.type==='FunctionDeclaration'&&n.id.name===name);
    return source.slice(node.start,node.end);
  }).join('\n'),context);
  const release=await queue.acquire('media');
  const first=context.runQueuedStream({sender:{id:1}}, {},()=>assert.fail('cancelled request ran'));
  const second=context.runQueuedStream({sender:{id:1}}, {},()=>42);
  assert.equal(queue.pending.length,2);
  assert.equal(context._abortChat(1),true);
  await assert.rejects(first);
  assert.equal(queue.pending.length,1);
  release();
  assert.equal(await second,42);
  const a=new AbortController(), b=new AbortController();
  context._setChatAbort('remote',a);context._setChatAbort('remote',b);
  assert.equal(a.signal.aborted,false);
  context._clearChatAbort('remote',a);
  context._abortChat('remote');assert.equal(b.signal.aborted,true);
});

test('remote chat requests start in parallel while the local device is occupied', async () => {
  const queue = new InferenceCoordinator();
  const release = await queue.acquire('media');
  const started = [], finish = [];
  const context = vm.createContext({localInference:queue,openRouter:{active:()=>true},
    remoteChat:(_event,input)=>{started.push(input.message);return new Promise(resolve=>finish.push(resolve));}});
  for (const name of ['chat','chatStream','chatStreamStateless']) {
    const node=tree.body.find(n=>n.type==='FunctionDeclaration'&&n.id.name===name);
    vm.runInContext(source.slice(node.start,node.end),context);
  }
  const pending = [context.chat({}, {message:'one'}),context.chatStream({}, {message:'two'}),context.chatStreamStateless({}, {message:'three'})];
  assert.deepEqual(started,['one','two','three']);
  assert.equal(queue.pending.length,0);
  finish.forEach(resolve=>resolve('done'));
  await Promise.all(pending);
  release();
});
