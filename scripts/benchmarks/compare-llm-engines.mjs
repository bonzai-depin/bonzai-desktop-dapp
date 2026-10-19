/** Local, fixed-workload comparison of OpenAI-compatible inference servers.
 * Never launches engines, downloads weights, or sends private conversation data.
 */
import fs from 'node:fs/promises';
import os from 'node:os';
import {performance} from 'node:perf_hooks';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
export const workloads = [
 {id:'prose',prompt:'Explain how a heat pump works in six short paragraphs. Use simple English.'},
 {id:'json',prompt:'Return only JSON with customer, equipment, temperature_c and urgency. Acme Foods cold room CR-04 reached 12 degrees Celsius at 02:15; dispatch is urgent.'},
 {id:'code',prompt:'Write a JavaScript function that groups work orders by technician and sorts each group by priority then date. Include validation and three examples. Output only code.'},
 {id:'long-context',prompt:Array.from({length:256},(_,i)=>`Work order ${i}: site S${i%16}, technician T${i%8}, scheduled maintenance.`).join('\n')+'\nSummarize the scheduling pattern and explain how to detect duplicate assignments.'},
];
export function validateConfig(config){
 if(!Array.isArray(config.engines)||!config.engines.length)throw Error('Provide at least one engine. Run engines separately if memory is limited.');
 for(const engine of config.engines){
  const url=new URL(engine.url);
  if(url.protocol!=='http:'||!['localhost','127.0.0.1','[::1]'].includes(url.hostname)||url.username||url.password||url.search||url.hash)throw Error('Only local HTTP engine endpoints are allowed.');
  for(const key of ['name','model','revision','quantization','runtimeVersion'])if(typeof engine[key]!=='string'||!engine[key].trim())throw Error(`Engine needs ${key} for reproducible comparisons.`);
 }
 if(!Number.isInteger(config.repeats??3)||(config.repeats??3)<2||(config.repeats??3)>20)throw Error('Use 2–20 measured repetitions.');
}
export async function measure(engine,workload,{fetchImpl=fetch,maxTokens=512,timeoutMs=300000}={}){
 const start=performance.now();let first=null,text='',usage=null,timings=null,finishReason=null,buffer='',done=false;
 const response=await fetchImpl(engine.url.replace(/\/$/,'')+'/chat/completions',{
  method:'POST',redirect:'error',signal:AbortSignal.timeout(timeoutMs),headers:{'Content-Type':'application/json'},
  body:JSON.stringify({model:engine.model,messages:[{role:'user',content:workload.prompt}],temperature:0,seed:42,max_tokens:maxTokens,stream:true,stream_options:{include_usage:true},chat_template_kwargs:{enable_thinking:false}})
 });
 if(!response.ok)throw Error(`Engine returned HTTP ${response.status}`);
 if(!response.body)throw Error('Missing response stream');
 const decoder=new TextDecoder();
 const consume=line=>{
  if(!line.startsWith('data:'))return;
  const data=line.slice(5).trim();if(data==='[DONE]'){done=true;return;}if(!data)return;
  const chunk=JSON.parse(data);if(chunk.error)throw Error(chunk.error.message||'Engine stream error');
  usage=chunk.usage||usage;timings=chunk.timings||timings;
  const choice=chunk.choices?.[0];finishReason=choice?.finish_reason||finishReason;
  const part=choice?.delta?.content||choice?.delta?.reasoning_content||'';
  if(part){const now=performance.now();first??=now;text+=part;}
 };
 for await(const bytes of response.body){buffer+=decoder.decode(bytes,{stream:true});let nl;while((nl=buffer.indexOf('\n'))>=0){consume(buffer.slice(0,nl).trimEnd());buffer=buffer.slice(nl+1);}}
 buffer+=decoder.decode();if(buffer.trim())consume(buffer.trimEnd());
 if(!done&&!finishReason)throw Error('Stream ended without completion; not a valid benchmark sample');
 const elapsedMs=performance.now()-start;
 const tokens=Number.isInteger(usage?.completion_tokens)?usage.completion_tokens:null;
 return {elapsedMs,ttftMs:first===null?null:first-start,completionTokens:tokens,promptTokens:usage?.prompt_tokens??null,
  endToEndTokensPerSecond:tokens===null?null:tokens*1000/elapsedMs,
  serverDecodeTokensPerSecond:timings?.predicted_per_second??null,
  outputSha256:createHash('sha256').update(text).digest('hex'),finishReason,
  jsonValid:workload.id==='json'?(()=>{try{const v=JSON.parse(text);return ['customer','equipment','temperature_c','urgency'].every(k=>k in v);}catch{return false;}})():null};
}
export async function run(config){
 validateConfig(config);const results=[];
 for(const engine of config.engines)for(const workload of workloads){
  // One discarded warm-up; subsequent repeated-prefix behavior is explicit.
  await measure(engine,workload);
  for(let i=0;i<(config.repeats??3);i++)results.push({engine,workload:workload.id,pass:i+1,...await measure(engine,workload)});
 }
 return {schema:'bonzai-engine-comparison-1',recordedAt:new Date().toISOString(),hardware:{platform:os.platform(),arch:os.arch(),cpu:os.cpus()[0]?.model,memoryBytes:os.totalmem(),label:config.hardwareLabel||null},policy:{seed:42,temperature:0,maxTokens:512,warmups:1,prefix:'repeated identical prompt; cache reuse allowed',thinking:false,concurrency:1},results};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const [, ,configPath,outputPath]=process.argv;
 if(!configPath||!outputPath)throw Error('Usage: node scripts/benchmarks/compare-llm-engines.mjs config.json results.json');
 const report=await run(JSON.parse(await fs.readFile(configPath,'utf8')));
 await fs.writeFile(outputPath,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
 console.log(`Saved ${report.results.length} samples to ${outputPath}`);
}
