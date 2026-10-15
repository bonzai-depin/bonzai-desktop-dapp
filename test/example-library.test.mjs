import test from 'node:test';
import assert from 'node:assert/strict';
import {EXAMPLE_LIBRARY,GAME_GENRES,ASSET_KITS,filterExamples} from '../src/components/gen3d/exampleLibrary.js';
test('every genre includes an asset, a level and a scoped playable prototype',()=>{
 assert.equal(GAME_GENRES.length,28);assert.equal(EXAMPLE_LIBRARY.length,296);
 assert.equal(new Set(EXAMPLE_LIBRARY.map(x=>x.id)).size,296);
 for(const genre of GAME_GENRES){
  for(const kind of ['object','level','game'])assert.ok(filterExamples({genre:genre.id,kind}).length>0,`${genre.id}/${kind}`);
 }
 for(const example of EXAMPLE_LIBRARY){assert.ok(example.title&&example.description&&example.prompt);if(example.kind==='game'){assert.match(example.prompt,/single-player/);assert.match(example.prompt,/restart/);assert.match(example.prompt,/GAME/);}if(example.kind==='level')assert.match(example.prompt,/not a claim of working game mechanics/);}
});
test('search combines genre/type filters and finds subject-specific briefs',()=>{
 assert.equal(filterExamples({kind:'game',genre:'racing'}).length,1);
 assert.equal(filterExamples({query:'cascading fountain'})[0].id,'cascading-fountain');
 assert.ok(filterExamples({query:'lantern'}).some(x=>x.genre==='horror'));
 assert.equal(filterExamples({query:'not-a-real-example'}).length,0);
});

test('asset kits contain distinct construction briefs with interoperable dimensions',()=>{
 assert.equal(ASSET_KITS.length,20);
 assert.equal(filterExamples({kind:'object'}).length,240);
 for(const kit of ASSET_KITS){
  const assets=filterExamples({kit:kit.id});
  assert.equal(assets.length,10);
  assert.equal(new Set(assets.map(x=>x.description)).size,10);
  assert.ok(assets.every(x=>x.kind==='object' && x.prompt.includes('connection dimensions')));
  for(const genre of kit.genres)assert.ok(GAME_GENRES.some(x=>x.id===genre));
 }
 assert.equal(filterExamples({kit:'castle',genre:'strategy',kind:'object'}).length,10);
 assert.equal(filterExamples({kit:'castle',genre:'racing'}).length,0);
 assert.equal(filterExamples({query:'royal gem crown'}).length,1);
});
