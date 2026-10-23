import test from 'node:test';
import assert from 'node:assert/strict';
import {estimateLyricsDuration as estimate} from '../src/shared/lyricsDuration.js';
test('duration follows tempo and repeats, excluding production instructions',()=>{
 const verse='[verse]\nOne small light\nOn the shore\nBring me home\nOnce more';
 assert.equal(estimate(verse,120),8);
 assert.equal(estimate(verse,60),16);
 assert.equal(estimate(`${verse}\n${verse}`,120),16);
 assert.equal(estimate(`${verse}\n(Synth pads rise)`,120),8);
 assert.equal(estimate(`[instrumental]\n(Synth pads rise)\n${verse}`,120),16);
 assert.equal(estimate(verse,120,3),6);
 assert.equal(estimate('',120),0);
});
