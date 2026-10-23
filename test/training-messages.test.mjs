import test from 'node:test';
import assert from 'node:assert/strict';
import {trainingErrorMessage,trainingProgressMessage} from '../src/services/trainingMessages.js';
test('publisher access failures never expose configuration names or credentials',()=>{
 for(const locale of ['en','fr']){
  const message=trainingErrorMessage('Access denied. Set HF_TOKEN=hf_secret in Space secrets',locale);
  assert.doesNotMatch(message,/HF_TOKEN|hf_secret|Space secrets|export /);
  assert.match(message,locale==='fr'?/éditeur/:/publisher/);
 }
});
test('tool banners and tracebacks become actionable export errors',()=>{
 assert.match(trainingErrorMessage('Quantization failed: version 0.7 /Users/private/model.gguf'),/selected format/);
 assert.doesNotMatch(trainingErrorMessage('Traceback: /Users/private/data.py'),/Traceback|Users/);
});
test('progress retains batch counts without exposing raw logs',()=>{
 assert.equal(trainingProgressMessage('probe','[harmful] prompts 17-32/512'), 'Analyzing model responses… 32 / 512');
 assert.equal(trainingProgressMessage('summon','HF_TOKEN is NOT set'), 'Preparing the model…');
});
