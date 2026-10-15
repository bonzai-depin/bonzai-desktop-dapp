import test from 'node:test';
import assert from 'node:assert/strict';
import {mintLicenseStatus,mintMediaBytes,recordedMintGeneration,validateMintFormat} from '../src/services/mintValidation.js';
import {operationText} from '../src/i18n/operations.js';

test('noncommercial models and dependencies cannot be overridden by a permissive main model',()=>{
 for(const generation of [{model:'flux-klein'},{license:'CC-BY-NC-4.0'},{license:'MIT',sources:[{license:'flux-non-commercial-license'}]},{commercialAllowed:true,license:'non-commercial'}]) assert.equal(mintLicenseStatus(generation).allowed,false);
 assert.equal(mintLicenseStatus({model:'unknown'}).allowed,false);
 assert.equal(mintLicenseStatus({license:'MIT',loras:['unverified.safetensors']}).allowed,false);
 assert.equal(mintLicenseStatus({license:'Apache-2.0'}).allowed,true);
 assert.equal(mintLicenseStatus({pipeline:'image_turbo'},{image_turbo:{license:'flux-non-commercial-license'}}).allowed,false);
});
test('media decoder preserves text that happens to be valid base64 and decodes only binary media',()=>{
 assert.equal(new TextDecoder().decode(mintMediaBytes('YWJj','text/plain')),'YWJj');
 assert.deepEqual([...mintMediaBytes('data:image/png;base64,AQID','image/png')],[1,2,3]);
 assert.throws(()=>mintMediaBytes('data:image/png;base64,AQID','image/webp'),/format/);
 assert.throws(()=>mintMediaBytes('https://example.com/image.png','image/png'),/decoded/);
 assert.throws(()=>mintMediaBytes(new Uint8Array(),'image/png'),/empty/);
});
test('saved model and parameters win over active UI defaults, zero seed survives',()=>{
 const result=recordedMintGeneration({model:'original',pipeline:'image_quality',seed:0,width:768,timestamp:123,license:'MIT'}, {model:'active',type:'text-to-image'});
 assert.equal(result.model,'original');assert.equal(result.parameters.seed,0);assert.equal(result.parameters.width,768);assert.equal(result.timestamp,123);assert.equal(result.license,'MIT');
});
test('all supported media types enforce a matching format',()=>{
 for(const [type,mime] of Object.entries({image:'image/png',audio:'audio/mpeg',video:'video/mp4',text:'text/plain',object:'application/javascript',training:'application/json'})) assert.doesNotThrow(()=>validateMintFormat(type,mime));
 assert.throws(()=>validateMintFormat('image','audio/mpeg'));
 assert.throws(()=>validateMintFormat('unknown','image/png'));
});
test('Mint stays Mint in every supported language',()=>{
 for(const locale of ['en','fr','es','ru','zh','ja','ko'])for(const label of ['Mint','Mint NFT','Mint token','Mint Collectible'])assert.ok(operationText(label,locale).includes('Mint'));
});
