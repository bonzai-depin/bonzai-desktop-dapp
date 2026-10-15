import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createBlobProtocolHandler, localMediaResponse } from '../src/main/localMediaProtocol.js';

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'bonzai-media-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const id = 'a'.repeat(64);
  const filePath = path.join(root, 'aa', `${id}.mp4`);
  await mkdir(path.dirname(filePath));
  await writeFile(filePath, '0123456789');
  const handle = createBlobProtocolHandler(root);
  return { root, filePath, id, handle, url: `bonzai-blob://${id}.mp4` };
}

test('saved media advertises its size and retains both old and canonical blob URLs', async t => {
  const { handle, url, id } = await fixture(t);
  for (const source of [url, `${url}/`, `bonzai-blob:///${id}.mp4`, url.toUpperCase()]) {
    const response = await handle(new Request(source));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'video/mp4');
    assert.equal(response.headers.get('content-length'), '10');
    assert.equal(response.headers.get('accept-ranges'), 'bytes');
    assert.equal(await response.text(), '0123456789');
  }
});

test('MP4 index reads and seeking return the exact requested bytes', async t => {
  const { handle, url } = await fixture(t);
  for (const [range, contentRange, bytes] of [
    ['bytes=0-', 'bytes 0-9/10', '0123456789'],
    ['bytes=3-5', 'bytes 3-5/10', '345'],
    ['bytes=8-999', 'bytes 8-9/10', '89'],
    ['bytes=-4', 'bytes 6-9/10', '6789'],
    ['bytes=-99', 'bytes 0-9/10', '0123456789'],
    ['bytes=0-0', 'bytes 0-0/10', '0'],
  ]) {
    const response = await handle(new Request(url, { headers: { Range: range } }));
    assert.equal(response.status, 206, range);
    assert.equal(response.headers.get('content-range'), contentRange);
    assert.equal(response.headers.get('content-length'), String(bytes.length));
    assert.equal(await response.text(), bytes);
  }
});

test('unsatisfiable ranges fail cleanly, unsupported range formats fall back to the full file', async t => {
  const { handle, url } = await fixture(t);
  for (const range of ['bytes=10-', 'bytes=9-1', 'bytes=-0', 'bytes=-', 'bytes=999999999999999999999-']) {
    const response = await handle(new Request(url, { headers: { Range: range } }));
    assert.equal(response.status, 416, range);
    assert.equal(response.headers.get('content-range'), 'bytes */10');
    assert.equal(await response.text(), '');
  }
  for (const range of ['items=0-1', 'bytes=0-1,4-5']) {
    const response = await handle(new Request(url, { headers: { Range: range } }));
    assert.equal(response.status, 200);
    assert.equal(await response.text(), '0123456789');
  }
});

test('HEAD, empty, missing and forbidden files do not open an unbounded media stream', async t => {
  const { handle, url, filePath, root, id } = await fixture(t);
  const head = await handle(new Request(url, { method: 'HEAD', headers: { Range: 'bytes=1-2' } }));
  assert.equal(head.status, 200);
  assert.equal(head.headers.get('content-length'), '10');
  assert.equal(await head.text(), '');
  assert.equal((await handle(new Request(url, { method: 'POST' }))).status, 405);
  for (const bad of [`bonzai-blob://${id}.txt`, `bonzai-blob://${id}.mp4/nested`, 'bonzai-blob:///etc/passwd', `bonzai-blob://user@${id}.mp4`, `bonzai-blob://${id}.mp4:8000`]) {
    assert.ok([400, 403].includes((await handle({ url: bad, method: 'GET', headers: new Headers() })).status));
  }
  const missing = await handle(new Request(`bonzai-blob://${'b'.repeat(64)}.mp4`));
  assert.equal(missing.status, 404);
  assert.equal(missing.headers.get('cache-control'), 'no-store');
  assert.equal((await localMediaResponse(new Request(url), root)).status, 404);
  await writeFile(filePath, '');
  const empty = await handle(new Request(url));
  assert.equal(empty.headers.get('content-length'), '0');
  assert.equal(await empty.text(), '');
  assert.equal((await handle(new Request(url, { headers: { Range: 'bytes=0-' } }))).status, 416);
});

test('a player can cancel a bounded stream before seeking again', async t => {
  const { filePath, url, handle } = await fixture(t);
  const bytes = Buffer.alloc(2 * 1024 * 1024, 7);
  await writeFile(filePath, bytes);
  const response = await handle(new Request(url));
  const reader = response.body.getReader();
  assert.ok((await reader.read()).value.byteLength <= 64 * 1024);
  await reader.cancel();
  const tail = await handle(new Request(url, { headers: { Range: 'bytes=-16' } }));
  assert.equal(tail.status, 206);
  assert.deepEqual(Buffer.from(await tail.arrayBuffer()), bytes.subarray(-16));
});

test('images and audio retain their media types through the shared blob handler', async t => {
  const { root, id, handle } = await fixture(t);
  for (const [ext, mime] of [['webp', 'image/webp'], ['mp3', 'audio/mpeg'], ['glb', 'model/gltf-binary']]) {
    await writeFile(path.join(root, 'aa', `${id}.${ext}`), 'test');
    const response = await handle(new Request(`bonzai-blob://${id}.${ext}`));
    assert.equal(response.headers.get('content-type'), mime);
    assert.equal(await response.text(), 'test');
  }
});
