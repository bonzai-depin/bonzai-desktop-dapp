import test from 'node:test';
import assert from 'node:assert/strict';
import { sceneEnvironmentChanged, streamedDialogue } from '../src/services/roleplayMediaPolicy.js';

test('unchanged scenery and formatting changes do not trigger another background generation', () => {
  const current = { timeOfDay: 'late_night', lighting: 'dim', weather: 'clear' };
  assert.equal(sceneEnvironmentChanged({ ...current }, current), false);
  assert.equal(sceneEnvironmentChanged({ timeOfDay: 'Late night', lighting: null }, current), false);
  assert.equal(sceneEnvironmentChanged({ weather: 'rainy' }, current), true);
});
test('streaming displays dialogue only and waits for incomplete escapes', () => {
  assert.equal(streamedDialogue('<think>secret'), '');
  assert.equal(streamedDialogue('<think>{"response":"secret"}</think>{"response":"Hello'), 'Hello');
  assert.equal(streamedDialogue('{"response":"Hello\\nworld","emotion":"happy"}'), 'Hello\nworld');
  assert.equal(streamedDialogue('{"response":"Hi\\'), 'Hi');
  assert.equal(streamedDialogue('{"response":"Hi\\u00'), 'Hi');
  assert.equal(streamedDialogue('{"emotion":"happy"}'), '');
});
