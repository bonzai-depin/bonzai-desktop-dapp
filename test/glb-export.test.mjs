import test from 'node:test';
import assert from 'node:assert/strict';
import { validateGLB, uploadGLBArtifact } from '../src/components/gen3d/glbExport.js';
function validHeader() {
  const bytes = new Uint8Array(20); const h = new DataView(bytes.buffer);
  h.setUint32(0, 0x46546c67, true); h.setUint32(4, 2, true); h.setUint32(8, 20, true);
  return bytes;
}
test('invalid or truncated binary cannot be uploaded as a GLB collectible', async () => {
  let uploads = 0;
  for (const bytes of [new Uint8Array(), new TextEncoder().encode('JavaScript is not a binary glTF model'), validHeader().subarray(0, 19)]) {
    await assert.rejects(uploadGLBArtifact({bytes, uploadContent: () => { uploads++; }, generation: {}}), /GLB/);
  }
  assert.equal(uploads, 0);
  assert.equal(validateGLB(validHeader()).byteLength, 20);
});
test('GLB attachment keeps an immutable IPFS URI, binary MIME and size; upload failure propagates', async () => {
  let request;
  const artifact = await uploadGLBArtifact({bytes:validHeader(), generation:{model:'test'}, attribution:{creator:'test'},
    uploadContent: async args => { request=args; return {url:'ipfs://test-cid'}; }});
  assert.equal(request.contentType, 'model/gltf-binary');
  assert.ok(request.data instanceof Uint8Array);
  assert.deepEqual(artifact, {uri:'ipfs://test-cid', type:'model/gltf-binary', name:'asset.glb', size:20});
  await assert.rejects(uploadGLBArtifact({bytes:validHeader(), generation:{}, uploadContent: async()=>{throw new Error('offline');}}), /offline/);
  await assert.rejects(uploadGLBArtifact({bytes:validHeader(), generation:{}, uploadContent: async()=>({url:'https://gateway/model.glb'})}), /decentralized/);
});
