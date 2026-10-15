import test from 'node:test';
import assert from 'node:assert/strict';
import {parseVisualReview,passesVisualReview,reviewSceneQuality} from '../src/components/gen3d/visualQuality.js';
const rating=(score,verdict='refine')=>({score,silhouette:score,proportions:score,materials:score,criticalDetails:score,verdict,defects:verdict==='pass'?[]:['Missing curved surfaces']});
test('missing scores, invented verdicts and attractive effects cannot pass malformed or weak geometry reviews',()=>{
 for(const value of ['', '{}',JSON.stringify({...rating(.9,'pass'),proportions:null}),JSON.stringify({...rating(.9,'pass'),verdict:'great'})])assert.equal(parseVisualReview(value).verdict,'unavailable');
 assert.equal(passesVisualReview({...rating(.9,'pass'),silhouette:.2}),false);
 assert.equal(passesVisualReview(rating(.8,'pass')),false,'a recognisable blockout is not a production-quality pass');
 assert.equal(passesVisualReview(rating(.9)),false);
 assert.equal(passesVisualReview({...rating(.9,'pass'),defects:['Lighting hides the geometry']}),false);
 assert.equal(passesVisualReview(parseVisualReview(JSON.stringify(rating(.85,'pass')))),true);
});
test('visual defects drive corrected renders and require a second actual review before passing',async()=>{
 let calls=0;
 const result=await reviewSceneQuality({code:'bad',snapshot:'bad-image',review:async image=>{calls++;return image==='good-image'?rating(.85,'pass'):rating(.3);},refine:async()=> 'good',render:async code=>`${code}-image`});
 assert.equal(result.status,'reviewed');assert.equal(result.code,'good');assert.equal(calls,2);
});
test('worse or failed corrections restore the last reviewed asset',async()=>{
 const renders=[];
 const result=await reviewSceneQuality({code:'original',snapshot:'original',review:async image=>rating(image==='original'?.6:.2),refine:async()=> 'worse',render:async code=>{renders.push(code);return code;}});
 assert.deepEqual(renders,['worse','original']);assert.equal(result.code,'original');assert.equal(result.status,'needs-refinement');
});
test('unavailable vision preserves a usable draft and does not claim verified quality or trigger corrections',async()=>{
 const result=await reviewSceneQuality({code:'draft',snapshot:'image',review:async()=>{throw new Error('Vision not installed');},refine:async()=>{throw new Error('Must not refine');},render:async()=>{throw new Error('Must not render');}});
 assert.equal(result.status,'unreviewed');assert.equal(result.code,'draft');assert.equal(result.passes.length,1);
});
test('persistent visible defects stop after two correction attempts',async()=>{
 let attempts=0;
 const result=await reviewSceneQuality({code:'draft',snapshot:'image',review:async()=>rating(.4),refine:async code=>{attempts++;return code+' revised';},render:async()=> 'image'});
 assert.equal(attempts,2);assert.equal(result.status,'needs-refinement');
});
test('a failed correction does not discard the original usable render',async()=>{
 const rendered=[];
 const result=await reviewSceneQuality({code:'original',snapshot:'image',review:async()=>rating(.4),refine:async()=> 'broken',render:async code=>{rendered.push(code);if(code==='broken')throw new Error('Shader failed');return 'image';}});
 assert.deepEqual(rendered,['broken','original']);assert.equal(result.code,'original');assert.equal(result.status,'needs-refinement');
});
test('inflated overall scores do not conceal weak material or construction categories',()=>{
 const review=parseVisualReview(JSON.stringify({...rating(.6,'pass'),score:1}));
 assert.equal(review.score,.6);assert.equal(passesVisualReview(review),false);
});
test('a higher total score cannot trade away identity-critical construction',async()=>{
 const before={...rating(.7),criticalDetails:.8};
 const after={...rating(.85),criticalDetails:.55};
 const renders=[];
 const result=await reviewSceneQuality({code:'sound',snapshot:'sound',review:async image=>image==='sound'?before:after,
 refine:async()=> 'pretty-but-broken',render:async code=>{renders.push(code);return code;}});
 assert.equal(result.code,'sound');assert.deepEqual(renders,['pretty-but-broken','sound']);
});
test('a good front view cannot hide a failed reverse construction view',async()=>{
 const {aggregateViewReviews}=await import('../src/components/gen3d/visualQuality.js');
 const result=aggregateViewReviews([{label:'front',review:rating(.95,'pass')},{label:'back',review:rating(.4)}]);
 assert.equal(passesVisualReview(result),false);assert.equal(result.score,.4);assert.match(result.defects[0],/^back:/);
 const unavailable=aggregateViewReviews([{label:'front',review:rating(.95,'pass')},{label:'back',review:{verdict:'unavailable'}}]);
 assert.equal(unavailable.verdict,'unavailable');
});
test('a no-op correction is recorded instead of silently appearing to improve the asset',async()=>{
 const result=await reviewSceneQuality({code:'original',snapshot:'image',review:async()=>rating(.4),refine:async code=>code,render:async()=>{throw new Error('No change must not render');}});
 assert.equal(result.code,'original');assert.equal(result.passes.at(-1).verdict,'correction-failed');assert.match(result.passes.at(-1).raw,/no change/);
});
