import test from 'node:test';
import assert from 'node:assert/strict';
import { mediaHistory, persistMediaHistory, loadMediaHistory } from '../src/stores/mediaHistory.js';
test('completion after navigation updates the new view and ordered durable history', async () => {
  const saved = {};
  global.window = { electronAPI: { store: { get: async key => saved[key] || [], set: async (key, rows) => { await new Promise(resolve => setTimeout(resolve, 5)); saved[key] = rows; } } } };
  const originalView = mediaHistory('video');
  await loadMediaHistory('video');
  const reopenedView = mediaHistory('video');
  originalView.value = [...originalView.value, {id:'first', question:'First clip'}];
  const first = persistMediaHistory('video', originalView.value);
  reopenedView.value = [...reopenedView.value, {id:'second', question:'Second clip'}];
  const second = persistMediaHistory('video', reopenedView.value);
  await Promise.all([first, second]);
  assert.deepEqual(saved.videoInferences.map(row => row.id), ['first','second']);
  assert.equal(originalView, reopenedView);
  assert.equal((await loadMediaHistory('video')).length, 2);
});
