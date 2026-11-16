import test from 'node:test';
import assert from 'node:assert/strict';
import {freshGenerationSeed} from '../src/services/generationSeed.js';
test('new inference seeds are distinct and valid across rapid submissions',()=>{
 const seeds=Array.from({length:10000},freshGenerationSeed);
 assert.equal(new Set(seeds).size,seeds.length);
 assert.ok(seeds.every(seed=>Number.isInteger(seed)&&seed>=0&&seed<2**31));
});
