#!/usr/bin/env node
// Calibrate the installed local visual judge against already reviewed renders.
// Never turn the model's verdict into a replacement for the recorded reviewer.
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {VISUAL_REVIEW_FORMAT,visualReviewPrompt,parseVisualReview,passesVisualReview,aggregateViewReviews} from '../src/components/gen3d/visualQuality.js';

const [directory,endpoint='http://127.0.0.1:64112']=process.argv.slice(2);
if(!directory)throw Error('Usage: node scripts/benchmark-3d-review.mjs /absolute/benchmark-directory [local-vision-endpoint]');
if(!['127.0.0.1','localhost','[::1]'].includes(new URL(endpoint).hostname))throw Error('Review calibration must remain local.');
const root=resolve(directory),file=join(root,'vision-calibration.json');
if(existsSync(file))throw Error('Calibration evidence already exists; preserve it before starting another run.');
const manifest=JSON.parse(readFileSync(join(root,'manifest.json')));
const suite=JSON.parse(readFileSync(new URL('../test/fixtures/3d-benchmark.json',import.meta.url)));
const results={startedAt:new Date().toISOString(),runtime:await fetch(endpoint+'/props').then(r=>r.json()),trials:[],
 limitations:['Small unblinded screening cohort; not a calibrated production accuracy estimate.','The existing recorded review is retained unchanged.']};
const save=()=>writeFileSync(file,JSON.stringify(results,null,2));save();
for(const trial of manifest.results.filter(result=>result.success)){
 const folder=join(root,`${trial.fixture}-${trial.seed}`),fixture=suite.fixtures.find(f=>f.id===trial.fixture);
 const recorded=JSON.parse(readFileSync(join(folder,'visual-review.json')));
 const history=JSON.parse(readFileSync(join(folder,'history.json')));
 const entry={fixture:trial.fixture,seed:trial.seed,recordedStatus:recorded.status,recordedReviewer:recorded.reviewer,views:[]};
 results.trials.push(entry);
 for(let i=1;i<=trial.frames;i++){
  const started=performance.now();
  try {
   const label=history.screenshots?.[i]?.label||`view-${i}`;
   const prompt=visualReviewPrompt(fixture.brief,false,fixture.kind)
    +`\nView: ${label}. This is one inspection angle of the same asset. Judge visible construction only; parts outside this view are not missing. A detail view is cropped intentionally.\nMeasured scene data: ${JSON.stringify({...trial.inspection,assembly:trial.assemblyReport})}`;
   const response=await fetch(endpoint+'/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(180000),
    body:JSON.stringify({messages:[{role:'user',content:[{type:'text',text:prompt},
     {type:'image_url',image_url:{url:'data:image/jpeg;base64,'+readFileSync(join(folder,`view-${i}.jpg`)).toString('base64')}}]}],
     max_tokens:900,temperature:.1,seed:17,response_format:VISUAL_REVIEW_FORMAT,chat_template_kwargs:{enable_thinking:false}})});
   if(!response.ok)throw Error(`Vision HTTP ${response.status}: ${await response.text()}`);
   const body=await response.json(),raw=body.choices?.[0]?.message?.content||'';
   entry.views.push({label:`view-${i}`,elapsedMs:performance.now()-started,usage:body.usage,timings:body.timings,review:parseVisualReview(raw),raw});
  }catch(error){entry.views.push({label:`view-${i}`,elapsedMs:performance.now()-started,error:error.message,review:{verdict:'unavailable',score:null,defects:[]}});}
  save();console.log(`${trial.fixture}: view ${i} ${entry.views.at(-1).review.verdict}`);
 }
 entry.aggregate=aggregateViewReviews(entry.views);entry.modelPassed=passesVisualReview(entry.aggregate);
 entry.falseAcceptance=recorded.status==='failed'&&entry.modelPassed;
 save();
}
results.finishedAt=new Date().toISOString();save();
results.usableReviews=results.trials.filter(t=>t.aggregate.verdict!=='unavailable').length;
results.falseAcceptances=results.trials.filter(t=>t.falseAcceptance).length;
save();
console.log(`Recorded ${results.trials.length} trials; usable reviews: ${results.usableReviews}; false acceptances: ${results.falseAcceptances} (not an accuracy estimate).`);
