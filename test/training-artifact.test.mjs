import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../src/services/trainingArtifact.js',import.meta.url),'utf8');
const {trainingArtifact}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
test('content type and artifact format remain independent across all creative media',()=>{
 for(const content_type of ['text','speech','music','image','video'])for(const artifact_type of ['lora','checkpoint']){
 const result=trainingArtifact({content_type,artifact_type});assert.equal(result.content,content_type);assert.equal(result.format,artifact_type);assert.equal(result.operation,'training');
 }
 assert.equal(trainingArtifact({type:'llm_lora'}).content,'text');
 assert.equal(trainingArtifact({type:'sdxl_lora'}).content,'image');
 assert.equal(trainingArtifact({type:'audio_lora'}).contentLabel,'Audio · unspecified');
 assert.equal(trainingArtifact({type:'abliteration'}).operation,'abliteration');
 assert.equal(trainingArtifact({type:'abliteration'}).format,'checkpoint');
});

test('Training and Uncensor libraries are separated by operation, not content type',()=>{
 const artifacts=[{type:'llm_lora'},{type:'abliteration'},{content_type:'music',artifact_type:'checkpoint'}];
 assert.deepEqual(artifacts.filter(m=>trainingArtifact(m).operation==='training'),[artifacts[0],artifacts[2]]);
 assert.deepEqual(artifacts.filter(m=>trainingArtifact(m).operation==='abliteration'),[artifacts[1]]);
});
