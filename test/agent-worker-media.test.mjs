import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createWorkerMedia } from '../src/main/agentWorkerMedia.js';
import { mediaHash } from '../src/main/agentWorkerHost.js';

test('media delivery persists bytes, strips paths, bounds reads and supports multi-output workflows', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'bonzai-worker-media-'));
  const blobs = { blobPath: (id, ext) => path.join(root, `${id}.${ext}`), async write(bytes, ext) { const id = mediaHash(bytes); await fs.writeFile(this.blobPath(id, ext), bytes); return { id }; } };
  const media = createWorkerMedia({ blobs, roots: [root] });
  try {
    const input = Buffer.from('test audio binary\u0000data');
    const result = await media.prepare({ text: 'Meditation transcript', artifacts: [{ pipeline: 'audio', payload: input.toString('base64'), meta: { payloadEncoding: 'base64' } }] }, {});
    assert.equal(result.artifacts.length, 1); assert.equal(result.artifacts[0].sha256, mediaHash(input));
    assert.equal(JSON.stringify(result).includes(root), false);
    assert.deepEqual(await media.read(result.artifacts[0], 5, 4), input.subarray(5, 9));
    await fs.writeFile(path.join(root, 'generated.mp3'), input);
    const saved = await media.prepare({ pipeline: 'audio', payload: path.join(root, 'generated.mp3'), meta: { payloadEncoding: 'path' } }, {});
    assert.equal(saved.artifacts[0].mimeType, 'audio/mpeg');
    const webp = Buffer.from('RIFF0000WEBPpayload');
    const image = await media.prepare({ pipeline: 'image', payload: webp.toString('base64') }, {});
    assert.equal(image.artifacts[0].mimeType, 'image/webp');
    assert.equal(image.artifacts[0].ext, 'webp');
    await assert.rejects(() => media.prepare({ pipeline: 'audio', payload: '/etc/hosts', meta: { payloadEncoding: 'path' } }, {}), /outside/);
    await assert.rejects(() => media.read({ id: '../secret', ext: 'wav' }, 0, 4), /Invalid/);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('training delivery includes weights/config but excludes datasets, logs and symlinks',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'worker-training-')),folder=path.join(root,'model_1');await fs.mkdir(folder);
 const blobs={async writeFromPathStream(file){const bytes=await fs.readFile(file);return{id:mediaHash(bytes),size:bytes.length};}};
 const media=createWorkerMedia({blobs,roots:[root],trainedRoot:()=>root});
 try {
  for(const name of ['model.safetensors','config.json','training.log','dataset.json','credentials.json'])await fs.writeFile(path.join(folder,name),name);
  const result=await media.prepare({pipeline:'fineTune',meta:{modelId:'model_1'}},{});
  assert.deepEqual(result.artifacts.map(a=>a.name).sort(),['config.json','model.safetensors']);
  assert.equal(JSON.stringify(result).includes(root),false);
  await fs.symlink('/etc/hosts',path.join(folder,'linked.bin'));
  await assert.rejects(media.prepare({pipeline:'fineTune',meta:{modelId:'model_1'}},{}),/Linked/);
  await assert.rejects(media.prepare({pipeline:'fineTune',meta:{modelId:'../secret'}},{}),/identity/);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});

test('sharded models retain their load manifest but never transmit optimizer checkpoints', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'bonzai-model-shards-'));
  const folder = path.join(root, 'model_2');
  await fs.mkdir(path.join(folder, 'checkpoint-100'), { recursive: true });
  const blobs = { async writeFromPathStream(file) { const bytes = await fs.readFile(file); return { id: mediaHash(bytes), size: bytes.length }; } };
  const media = createWorkerMedia({ blobs, roots: [root], trainedRoot: () => root });
  try {
    for (const name of ['model-00001-of-00001.safetensors', 'config.json', 'optimizer.bin', 'tokenizer.model', 'checkpoint-100/model.safetensors']) await fs.writeFile(path.join(folder, name), '{}');
    const index = path.join(folder, 'model.safetensors.index.json');
    await fs.writeFile(index, JSON.stringify({ weight_map: { layer: 'model-00001-of-00001.safetensors' } }));
    const output = { pipeline: 'fineTune', meta: { modelId: 'model_2' } };
    const result = await media.prepare(output, {});
    assert.deepEqual(result.artifacts.map(a => a.name).sort(), ['config.json', 'model-00001-of-00001.safetensors', 'model.safetensors.index.json', 'tokenizer.model']);
    await fs.writeFile(index, JSON.stringify({ weight_map: { layer: '../private.safetensors' } }));
    await assert.rejects(media.prepare(output, {}), /Invalid model shard path/);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
