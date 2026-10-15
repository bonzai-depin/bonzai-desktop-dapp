import test from 'node:test';
import assert from 'node:assert/strict';
import { visibleText, visibleRecord } from '../src/shared/visibleText.js';
test('reasoning never leaks while streaming complete or unfinished tags', () => {
  const response = '<think>hidden thought</think>Visible answer';
  for (let n = 1; n <= response.length; n++) {
    const text = visibleText(response.slice(0, n));
    assert.ok(!text.includes('<') && !text.includes('hidden') && !text.includes('thought'), `${n}: ${text}`);
  }
  assert.equal(visibleText('Before <THINK mode="slow">secret <analysis>nested</analysis></THINK> After'), 'Before  After');
  assert.equal(visibleText('&lt;think&gt;secret&lt;/think&gt;Answer'), 'Answer');
  assert.equal(visibleText('Answer <think>unfinished'), 'Answer');
  assert.equal(visibleText('<thinking>secret</thinking>2 < 3'), '2 < 3');
  assert.deepEqual(visibleRecord({ text: '<think>secret</think>Saved result', reasoning_content: 'secret' }), { text: 'Saved result' });
});
