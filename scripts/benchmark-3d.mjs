#!/usr/bin/env node
// Runs the actual Submit -> renderer -> history pipeline in an isolated browser.
// The Electron bridge is replaced with a LOCAL llama-server, never a user store.
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync, createReadStream, existsSync, copyFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import {VISUAL_REVIEW_FORMAT} from '../src/components/gen3d/visualQuality.js';

const args = Object.fromEntries(process.argv.slice(2).map(arg => { const at=arg.indexOf('='); return [arg.slice(2,at<0?undefined:at),at<0?true:arg.slice(at+1)]; }));
const suite = JSON.parse(readFileSync(new URL('../test/fixtures/3d-benchmark.json',import.meta.url)));
if (args.help) {
  console.log('node scripts/benchmark-3d.mjs --ui=http://127.0.0.1:5179 --llm=http://127.0.0.1:64213 --fixtures=screen|all|lantern,chair --seeds=17,41,97 --out=/absolute/path [--vision=http://127.0.0.1:64112] [--label=baseline]');
  process.exit(0);
}
const ui=String(args.ui||process.env.BONZAI_UI_URL||'http://127.0.0.1:5179');
const llm=String(args.llm||'http://127.0.0.1:64213');
for (const address of [ui,llm,args.vision].filter(Boolean)) {
  if (!['localhost','127.0.0.1','[::1]'].includes(new URL(address).hostname)) throw Error('Benchmark endpoints must be loopback; prompts and renders remain local.');
}
const output=resolve(String(args.out||`.local-release-archive/3d-benchmark/${Date.now()}`));
if(existsSync(join(output,'manifest.json')))throw Error('Choose a fresh output directory; previous benchmark evidence is preserved.');
mkdirSync(output,{recursive:true});
const selection=String(args.fixtures||'screen');
const fixtures=suite.fixtures.filter(f=>selection==='all'||(selection==='screen'?f.screen:selection.split(',').includes(f.id)));
const seeds=String(args.seeds||'17').split(',').map(Number);
if(!fixtures.length||seeds.some(n=>!Number.isSafeInteger(n)))throw Error('Choose known fixtures and integer seeds.');
const props=await fetch(llm+'/props').then(r=>r.json());
const memory=()=>({freeBytes:os.freemem(),swap:os.platform()==='darwin'?execFileSync('sysctl',['-n','vm.swapusage'],{encoding:'utf8'}).trim():null});
const manifest={suiteVersion:suite.version,label:args.label||'baseline',startedAt:new Date().toISOString(),
  revision:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),dirty:execFileSync('git',['status','--porcelain'],{encoding:'utf8'}),
  system:{platform:os.platform(),release:os.release(),arch:os.arch(),cpu:os.cpus()[0]?.model,ramBytes:os.totalmem()},
  runtime:props,vision:args.vision||null,fixtures:fixtures.map(f=>f.id),seeds,results:[],memoryBefore:memory(),
  limitations:['Model startup is measured separately.','No claim of AAA quality without visual and interactive review.','Browser storage is isolated; Electron IPC persistence is covered by separate tests.']};
const saveManifest=()=>writeFileSync(join(output,'manifest.json'),JSON.stringify(manifest,null,2));saveManifest();
writeFileSync(join(output,'source.diff'),execFileSync('git',['diff'],{encoding:'utf8',maxBuffer:20*1024*1024}));
const newSources=execFileSync('git',['ls-files','--others','--exclude-standard','src/components/gen3d','src/services/completionMetrics.js','scripts/benchmark-3d.mjs','scripts/benchmark-3d-decoding.mjs','scripts/report-3d-benchmark.mjs','test/fixtures/3d-benchmark.json'],{encoding:'utf8'}).trim().split('\n').filter(Boolean);
for(const path of newSources){const target=join(output,'untracked-source',path);mkdirSync(resolve(target,'..'),{recursive:true});copyFileSync(path,target);}
const controllers=new Set();
const browser=await chromium.launch({channel:'chrome',headless:true});
let interrupted=false;process.once('SIGINT',()=>{interrupted=true;for(const controller of controllers)controller.abort();browser.close().catch(()=>{});});
try {
 for(const seed of seeds)for(const fixture of fixtures){
  if(interrupted)break;
  const dir=join(output,`${fixture.id}-${seed}`);mkdirSync(dir,{recursive:true});
  const result={fixture:fixture.id,kind:fixture.kind,seed,checks:fixture.checks,calls:[],errors:[],status:'running',visualReview:null};
  manifest.results.push(result);saveManifest();
  const fixtureStarted=performance.now();
  const page=await browser.newPage({viewport:{width:1280,height:900}});
  page.on('pageerror',e=>result.errors.push(e.message));
  page.on('console',msg=>{if(msg.type()==='error'&&/Shader Error|VALIDATE_STATUS|GL_INVALID/.test(msg.text()))result.errors.push(msg.text());});
  let callIndex=0;
  await page.exposeFunction('benchmarkGenerate',async(prompt,options={},visionImage)=>{
   const index=++callIndex,start=performance.now();
   const stage=visionImage?'vision':prompt.startsWith('Design a coherent functional assembly')||prompt.includes('Return a compact GAME BLUEPRINT')?'plan':prompt.includes('minimal exact text edits')?'patch':prompt.includes('Measured issues:')?'rebuild':'code';
   const record={index,stage,promptChars:prompt.length,options,startedAt:new Date().toISOString()};result.calls.push(record);saveManifest();
   writeFileSync(join(dir,`${index}-${stage}-prompt.txt`),prompt);
   console.log(`${fixture.id}/${seed}: ${stage} (${prompt.length} chars)`);
   const content=visionImage?[{type:'text',text:prompt},{type:'image_url',image_url:{url:`data:image/jpeg;base64,${visionImage}`}}]:prompt;
   let text='',buffer='',firstTokenMs=null,usage=null,timings=null,finishReason=null,lastProgress=0;
   const controller=new AbortController();controllers.add(controller);
   try {
    const response=await fetch((visionImage?args.vision:llm)+'/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json'},
      signal:AbortSignal.any([controller.signal,AbortSignal.timeout(Number(args.timeout||1800)*1000)]),
      body:JSON.stringify({messages:[{role:'user',content}],stream:true,stream_options:{include_usage:true},max_tokens:options.maxTokens||900,temperature:options.temperature??.1,seed,
        ...(visionImage&&options.review?{response_format:VISUAL_REVIEW_FORMAT}:{}),
        chat_template_kwargs:{enable_thinking:false},cache_prompt:true})});
    if(!response.ok)throw Error(`Local inference ${response.status}: ${await response.text()}`);
    const decoder=new TextDecoder();
    for await(const chunk of response.body){
     buffer+=decoder.decode(chunk,{stream:true});let newline;
     while((newline=buffer.indexOf('\n'))>=0){
      const line=buffer.slice(0,newline).trim();buffer=buffer.slice(newline+1);
      if(!line.startsWith('data:')||line.slice(5).trim()==='[DONE]')continue;
      const data=JSON.parse(line.slice(5));const delta=data.choices?.[0]?.delta?.content||'';
      if(delta){
       firstTokenMs??=performance.now()-start;text+=delta;
       if(text.length-lastProgress>=1024){lastProgress=text.length;writeFileSync(join(dir,`${index}-${stage}-partial.txt`),text);}
      }
      usage=data.usage||usage;timings=data.timings||timings;finishReason=data.choices?.[0]?.finish_reason||finishReason;
     }
    }
    Object.assign(record,{elapsedMs:performance.now()-start,firstTokenMs,usage,timings,finishReason,outputChars:text.length});
    writeFileSync(join(dir,`${index}-${stage}-response.txt`),text);saveManifest();
    console.log(`${fixture.id}/${seed}: ${stage} done ${(record.elapsedMs/1000).toFixed(1)}s, ${usage?.completion_tokens??'?'} tokens, ${finishReason}`);
    return {text,tokenCount:usage?.completion_tokens??null,elapsedMs:record.elapsedMs,prefillMs:timings?.prompt_ms??null,genMs:timings?.predicted_ms??null,firstTokenMs,usage,timings,finishReason};
   }catch(error){Object.assign(record,{elapsedMs:performance.now()-start,error:error.message});writeFileSync(join(dir,`${index}-${stage}-response.txt`),text);saveManifest();throw error;}
   finally{controllers.delete(controller);}
  });
  try {
   await page.route('**/*',r=>new URL(r.request().url()).origin===new URL(ui).origin?r.continue():r.abort());
   await page.goto(ui+'/src/assets/tokens.css');
   await page.setContent('<html><body><div id="app"></div></body></html>');
   await page.evaluate(async({seed,vision,model})=>{
    const source=await fetch('/src/components/Generative3D.vue').then(r=>r.text());
    const runtime=source.match(/from ["']([^"']*\/vue\.js(?:\?[^"']*)?)["']/)[1];
    const {createApp}=await import(runtime),{default:Component}=await import('/src/components/Generative3D.vue');
    const {createI18nPlugin}=await import('/src/i18n/index.js');
    // Freeze the current code for a trial even if the development checkout is
    // edited while a long model response is in flight.
    if(window.__VUE_HMR_RUNTIME__){window.__VUE_HMR_RUNTIME__.reload=()=>{};window.__VUE_HMR_RUNTIME__.rerender=()=>{};}
    // Freeze only the creative-direction seed, not clocks or trace UUIDs.
    const original=crypto.getRandomValues.bind(crypto);
    crypto.getRandomValues=array=>array instanceof Uint32Array&&array.length===1?(array[0]=seed,array):original(array);
    window.saved={};window.renderRuns=[];
    window.electronAPI={store:{get:async(k,f)=>window.saved[k]??f,set:async(k,v)=>{window.saved[k]=structuredClone(v);}},
      checkModel:async()=>true,loadModel:async()=>({success:true}),llamaRuntimeStatus:async()=>({running:true,modelName:model}),resetChat:async()=>{},getSystemInfo:async()=>({}),
      chat:(prompt,options)=>window.benchmarkGenerate(prompt,options),
      analyzeLocalImage:async p=>{if(!vision)throw Error('Vision judge disabled for this benchmark; manual review required');const r=await window.benchmarkGenerate(p.prompt,{maxTokens:p.max_tokens,temperature:.1,review:p.review===true},p.image_base64);return {response:r.text};}};
    window.vm=createApp(Component).use(createI18nPlugin()).mount('#app');
   },{seed,vision:!!args.vision,model:String(props.model_path||'').split('/').at(-1)});
   await page.waitForFunction(()=>window.vm.threeViewer?.isReady&&window.vm.isModel&&!window.vm.threeViewer.isGenerating&&window.vm.threeViewer.scene.getObjectByName('GeneratedObject'),{timeout:120000});
   const start=performance.now();
   const outcome=await page.evaluate(async fixture=>{
    const vm=window.vm,v=vm.threeViewer;vm.creationMode=fixture.kind;vm.form.prompt=fixture.brief;
    const apply=v.applyModuleCode.bind(v);v.applyModuleCode=async(...args)=>{const started=performance.now();try{const root=await apply(...args);window.renderRuns.push({elapsedMs:performance.now()-started,inspection:v.inspectConstruction()});return root;}catch(e){window.renderRuns.push({elapsedMs:performance.now()-started,error:e.message});throw e;}};
    await vm.onSubmit();
    // The gallery hides failed attempts. The benchmark must retain them in its
    // denominator and keep their traces rather than selecting a previous success.
    const record=window.saved.unifiedObjectInferences?.at(-1)||null;
    const before=v.scene.getObjectByName('GeneratedObject');
    const inspection=record?.success?v.inspectConstruction():null;
    const views=record?.success?v.captureQualityViews():[];
    // Replay the persisted result through the same public history action.
    let reopened=false;
    if(record?.success){await vm.applyInference(record);reopened=!!v.scene.getObjectByName('GeneratedObject')&&v.scene.getObjectByName('GeneratedObject')!==before;}
    return {status:vm.lastStatus,record,inspection,views,renderRuns:window.renderRuns,reopened,trace:window.saved.last3dGenerationTrace||null,persisted:Object.values(window.saved).flat().some(item=>item?.id===record?.id&&item.code)};
   },fixture);
   result.elapsedMs=performance.now()-start;
   writeFileSync(join(dir,'history.json'),JSON.stringify(outcome.record,null,2));
   for(const [index,view] of outcome.views.entries())writeFileSync(join(dir,`view-${index+1}.jpg`),Buffer.from(view.dataUrl.split(',')[1],'base64'));
   const {record,views,...rest}=outcome;Object.assign(result,rest,{success:record?.success===true,qualityStatus:record?.qualityStatus,assemblyReport:record?.assemblyReport,
    status:record?.success?'rendered-awaiting-review':'failed',failureReason:record?.success?null:(record?.notes||outcome.status),generationMs:record?.elapsedMs??null,frames:views.length,codeChars:record?.code?.length||0});
   writeFileSync(join(dir,'visual-review.json'),JSON.stringify({status:'pending',dimensions:suite.reviewDimensions,checks:fixture.checks,notes:'Inspect all views. For games, play through win, defeat and restart before passing function.'},null,2));
  }catch(error){result.status='failed';result.errors.push(error.message);}
  finally{result.trialMs=performance.now()-fixtureStarted;for(const controller of controllers)controller.abort();await page.close();saveManifest();console.log(`${fixture.id}/${seed}: ${result.status}`);}
 }
}finally{
 await browser.close();manifest.finishedAt=new Date().toISOString();manifest.interrupted=interrupted;manifest.memoryAfter=memory();saveManifest();
 if(props.model_path){try{const hash=createHash('sha256');for await(const chunk of createReadStream(props.model_path))hash.update(chunk);manifest.modelSha256=hash.digest('hex');}catch(e){manifest.modelHashError=e.message;}}
 saveManifest();console.log(`Results: ${output}`);
}
