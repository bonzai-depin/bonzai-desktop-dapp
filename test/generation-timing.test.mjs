import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generationElapsedMs, formatGenerationTime } from '../src/shared/generationTiming.js';

test('saved video milliseconds and legacy store seconds resolve to the same time', () => {
  assert.equal(generationElapsedMs({elapsedMs: 1359853}), 1359853);
  assert.equal(generationElapsedMs({elapsed: 1359.853}), 1359853);
  assert.equal(generationElapsedMs({answer: {data: {elapsed_ms: 2596735}}}), 2596735);
  assert.equal(generationElapsedMs({elapsedMs: 0, elapsed: 9}), 0);
  assert.equal(generationElapsedMs({duration: 5}), null); // Clip length is not generation time.
});

test('readable times round across minute/hour boundaries and handle missing records', () => {
  assert.equal(formatGenerationTime(1359853), '22 min 40 sec');
  assert.equal(formatGenerationTime(2596735), '43 min 17 sec');
  assert.equal(formatGenerationTime(3599999), '1 hr');
  assert.equal(formatGenerationTime(60000), '1 min');
  assert.equal(formatGenerationTime(250), '250 ms');
  for (const value of [null, undefined, '', NaN, -1]) assert.equal(formatGenerationTime(value), '');
  assert.ok(formatGenerationTime(65000, 'fr').includes('min'));
  assert.equal(generationElapsedMs({extra:{elapsedMs:'60000 ms'}}),60000);
});
