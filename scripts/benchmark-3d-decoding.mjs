#!/usr/bin/env node
// Controlled decode diagnostic, NOT a completed-asset quality benchmark.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {chromium} from 'playwright';
import {completionMetrics} from '../src/services/completionMetrics.js';
const args=Object.fromEntries(process.argv.slice(2).map(arg=>{const i=arg.indexOf('=');return [arg.slice(2,i),arg.slice(i+1)];}));
const url=args.url||'http://127.0.0.1:64213';
if(!['localhost','127.0.0.1','[::1]'].includes(new URL(url).hostname))throw Error('Use a local benchmark runtime.');
if(!args.prompt||!args.out)throw Error('Required: --prompt=/path/prompt.txt --out=/path/results [--tokens=256 --seeds=17,41,97 --label=mtp2]');
const prompt=readFileSync(args.prompt,'utf8'),output=resolve(args.out);mkdirSync(output,{recursive:true});
const tokens=Number(args.tokens||256),seeds=(args.seeds||'17,41,97').split(',').map(Number);
if(!Number.isSafeInteger(tokens)||tokens<1||seeds.some(seed=>!Number.isSafeInteger(seed)))throw Error('Invalid token/seed value');
const manifest={label:args.label||'decode',prompt:resolve(args.prompt),tokens,seeds,props:await fetch(url+'/props').then(r=>r.json()),results:[],limitations:['Fixed-length decode samples do not establish usable-asset quality.','First sample has a different cache state from later samples.','Compare like cache cohorts; do not combine with end-to-end pipeline latency.']};
const previews=(args.preview||'none').split(',');
if(previews.some(value=>!['none','full','reduced'].includes(value)))throw Error('Preview must be none, full or reduced');
if(previews.includes('none')&&previews.length>1)throw Error('Run the no-browser cohort separately from preview comparisons.');
let browser,page;
try {
if(previews.some(mode=>mode!=='none')){
 const ui=args.ui||'http://127.0.0.1:5179';
 if(!['localhost','127.0.0.1','[::1]'].includes(new URL(ui).hostname))throw Error('Use a local UI server.');
 browser=await chromium.launch({channel:'chrome',headless:true});page=await browser.newPage({viewport:{width:1280,height:900}});
 await page.route('**/*',r=>new URL(r.request().url()).origin===new URL(ui).origin?r.continue():r.abort());
 await page.goto(ui+'/src/assets/tokens.css');await page.setContent('<html><body><div id="app"></div></body></html>');
 await page.evaluate(async()=>{
  const source=await fetch('/src/components/Generative3D.vue').then(r=>r.text());
  const path=source.match(/from ["']([^"']*\/vue\.js(?:\?[^"']*)?)["']/)[1];
  const {createApp}=await import(path),{default:Component}=await import('/src/components/Generative3D.vue');
  const {createI18nPlugin}=await import('/src/i18n/index.js');
  window.electronAPI={store:{get:async(k,f)=>f,set:async()=>{}},checkModel:async()=>true,getSystemInfo:async()=>({})};
  window.vm=createApp(Component).use(createI18nPlugin()).mount('#app');
  if(window.__VUE_HMR_RUNTIME__){window.__VUE_HMR_RUNTIME__.reload=()=>{};window.__VUE_HMR_RUNTIME__.rerender=()=>{};}
 });
 await page.waitForFunction(()=>window.vm.threeViewer?.isReady&&!window.vm.threeViewer.isGenerating&&window.vm.threeViewer.scene.getObjectByName('GeneratedObject'),{timeout:120000});
 await page.evaluate(()=>{
  const viewer=window.vm.threeViewer,render=viewer._renderScene.bind(viewer);
  window.renderCount=0;viewer._renderScene=(...args)=>{window.renderCount++;return render(...args);};
 });
}
for(const preview of previews)for(const seed of seeds){
 if(page)await page.evaluate(mode=>{window.vm.llmActiveCalls=mode==='reduced'?1:0;window.renderCount=0;},preview);

 const start=performance.now();
 const response=await fetch(url+'/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(600000),body:JSON.stringify({messages:[{role:'user',content:prompt}],max_tokens:tokens,temperature:0,seed,chat_template_kwargs:{enable_thinking:false},cache_prompt:true})});
 if(!response.ok)throw Error(await response.text());
 const result=await response.json(),text=result.choices?.[0]?.message?.content||'';
 const row={sample:manifest.results.length+1,preview,seed,...completionMetrics({usage:result.usage,timings:result.timings,elapsedMs:performance.now()-start,finishReason:result.choices?.[0]?.finish_reason}),timings:result.timings,usage:result.usage};manifest.results.push(row);
 if(page){row.previewFrames=await page.evaluate(()=>window.renderCount);row.previewFps=row.previewFrames*1000/row.elapsedMs;}
 writeFileSync(join(output,`response-${row.sample}-${preview}-${seed}.txt`),text);writeFileSync(join(output,'manifest.json'),JSON.stringify(manifest,null,2));
 console.log(JSON.stringify({label:manifest.label,...row}));
}

} finally { await browser?.close(); }
