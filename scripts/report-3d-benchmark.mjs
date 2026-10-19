#!/usr/bin/env node
import { readFileSync,existsSync,writeFileSync } from 'node:fs';
import { resolve,join } from 'node:path';
const directories=process.argv.slice(2).map(value=>resolve(value));
if(!directories.length)throw Error('Pass one or more benchmark result directories.');
const median=values=>{if(!values.length)return null;const sorted=values.slice().sort((a,b)=>a-b),middle=Math.floor(sorted.length/2);return sorted.length%2?sorted[middle]:(sorted[middle-1]+sorted[middle])/2;};
const seconds=value=>value==null?'—':(value/1000).toFixed(1);
const report=[];
for(const directory of directories){
 const manifest=JSON.parse(readFileSync(join(directory,'manifest.json')));
 const rows=manifest.results.map(result=>{
  const reviewFile=join(directory,`${result.fixture}-${result.seed}`,'visual-review.json');
  const review=existsSync(reviewFile)?JSON.parse(readFileSync(reviewFile)):null;
  const reviewed=review?.status==='passed'&&review?.reviewer&&review?.scores&&['recognizability','construction','materials','lighting','briefFidelity','function'].every(key=>Number.isFinite(review.scores[key])&&review.scores[key]>=4&&review.scores[key]<=5);
  const played=result.kind!=='game'||(review?.interaction?.evidence&&['movement','collision','objectives','win','defeat','restart'].every(key=>review.interaction[key]===true));
  const valid=result.success&&result.persisted&&result.reopened&&!result.errors?.length&&!result.inspection?.errors?.length&&!result.assemblyReport?.errors?.length&&reviewed&&played;
  const calls=result.calls||[];
  return {fixture:result.fixture,seed:result.seed,status:result.status,valid:!!valid,rendered:!!result.success,
   generationMs:result.generationMs??result.elapsedMs??null,llmMs:calls.reduce((sum,c)=>sum+(c.elapsedMs||0),0),
   prefillMs:calls.every(c=>Number.isFinite(c.timings?.prompt_ms))?calls.reduce((sum,c)=>sum+c.timings.prompt_ms,0):null,
   outputTokens:calls.every(c=>Number.isFinite(c.usage?.completion_tokens))?calls.reduce((sum,c)=>sum+c.usage.completion_tokens,0):null,
   repairCalls:calls.filter(c=>['patch','rebuild'].includes(c.stage)).length,errors:result.errors,review:review?.status||'unavailable'};
 });
 const summary={label:manifest.label,revision:manifest.revision,total:rows.length,rendered:rows.filter(r=>r.rendered).length,
  qualityPassed:rows.filter(r=>r.valid).length,medianGenerationMs:median(rows.filter(r=>r.rendered).map(r=>r.generationMs).filter(Number.isFinite)),
  medianValidMs:median(rows.filter(r=>r.valid).map(r=>r.generationMs).filter(Number.isFinite)),rows,
  limitations:['Failed and unreviewed runs remain in the denominator.','No p95 or confidence interval is asserted for small samples.','A visual score is not a guarantee for arbitrary prompts.']};
 writeFileSync(join(directory,'summary.json'),JSON.stringify(summary,null,2));report.push(summary);
 console.log(`${summary.label}: ${summary.rendered}/${summary.total} rendered; ${summary.qualityPassed}/${summary.total} quality passed. Median rendered: ${seconds(summary.medianGenerationMs)}s; median validated: ${seconds(summary.medianValidMs)}s`);
 for(const row of rows)console.log(`${row.fixture}/${row.seed} | ${row.status} | ${seconds(row.generationMs)}s | ${row.outputTokens??'?'} tokens | ${row.repairCalls} repairs | review: ${row.review}`);
}
