import test from 'node:test';
import assert from 'node:assert/strict';
import { roleplayVideoSource, localVideoPath } from '../src/utils/roleplayVideo.js';

test('fresh and persisted video representations resolve to playable sources', () => {
  const raw = 'AAAAIGZ0eXBpc29tAAACAGlzb21pc28ybXA0MQ==';
  assert.equal(roleplayVideoSource(raw), `data:video/mp4;base64,${raw}`);
  assert.equal(roleplayVideoSource(`  ${raw}\n`), `data:video/mp4;base64,${raw}`);
  for (const url of ['data:video/mp4;base64,AAAA', 'blob:http://localhost/clip', 'https://example.org/clip.mp4', `bonzai-blob://${'a'.repeat(64)}.mp4`]) {
    assert.equal(roleplayVideoSource(url), url);
  }
  for (const path of ['/tmp/my clip.mp4', 'C:\\Videos\\my clip.mp4', '\\\\server\\videos\\clip.mp4']) {
    assert.equal(roleplayVideoSource(path, 65001), `http://localhost:65001/media/stream?path=${encodeURIComponent(path)}`);
    assert.equal(localVideoPath(path), path);
  }
  assert.equal(localVideoPath('file:///C:/Videos/my%20clip.mp4'), 'C:/Videos/my clip.mp4');
  assert.equal(localVideoPath('file:///tmp/my%20clip.mp4'), '/tmp/my clip.mp4');
  assert.equal(roleplayVideoSource(null), '');
  assert.equal(roleplayVideoSource({ video: 'bad' }), '');
  assert.equal(roleplayVideoSource('javascript:alert(1)'), '');
});

// Saving must retain portable blob references, rather than losing Windows/file URLs.
test('roleplay persists local video files before their temporary source disappears', async () => {
  const { readFileSync } = await import('node:fs');
  const { parse } = await import('acorn');
  const vm = await import('node:vm');
  const source = readFileSync(new URL('../src/services/roleplayStore.service.js', import.meta.url), 'utf8');
  const ast = parse(source, { ecmaVersion: 'latest', sourceType: 'module' });
  const fn = ast.body.find(n => n.type === 'FunctionDeclaration' && n.id.name === '_resolveMediaRefs');
  const context = vm.createContext({ localVideoPath, console });
  vm.runInContext(source.slice(fn.start, fn.end), context);
  const calls = [];
  const blobs = { writeFromPath: async (path, ext) => { calls.push({ path, ext }); return { id: 'a'.repeat(64) }; } };
  const result = await context._resolveMediaRefs({ video: 'file:///C:/Videos/my%20clip.mp4' }, blobs, 'message-1');
  assert.deepEqual(calls, [{ path: 'C:/Videos/my clip.mp4', ext: 'mp4' }]);
  assert.equal(result.videoBlobId, 'a'.repeat(64));
  assert.equal(result.videoExt, 'mp4');
});
