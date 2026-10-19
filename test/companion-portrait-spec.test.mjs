import test from 'node:test';
import assert from 'node:assert/strict';
import { companionPortraitDimensions, buildCompanionPortraitPrompt } from '../src/skills/companionPortrait.js';
test('portrait requests remain square even when callers supply landscape or invalid dimensions', () => {
  for (const options of [{}, { width: 1024, height: 768 }, { height: 512 }, { width: '768' }, { width: -1 }, { width: Infinity }]) {
    const size = companionPortraitDimensions(options);
    assert.equal(size.width, size.height);
    assert.ok(Number.isInteger(size.width) && size.width >= 256);
  }
});
test('creation prompt makes native borderless composition explicit after identity and style', () => {
  const { prompt, negativePrompt } = buildCompanionPortraitPrompt({ appearance: 'Silver hair and glasses', imagePromptBase: 'Portrait of a professor' });
  assert.match(prompt, /native square 1:1/);
  assert.match(prompt, /all four edges and all four corners/);
  assert.match(prompt, /No blank perimeter or white margin/);
  assert.match(negativePrompt, /border, frame, polaroid, white margins/);
  assert.match(prompt, /Silver hair and glasses/);
});
