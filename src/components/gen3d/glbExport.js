import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

export const GLB_MIME = 'model/gltf-binary';

export function validateGLB(value) {
  const bytes = value instanceof ArrayBuffer ? new Uint8Array(value) : value;
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < 20) throw new Error('GLB export is empty or invalid.');
  const header = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (header.getUint32(0, true) !== 0x46546c67 || header.getUint32(4, true) !== 2 || header.getUint32(8, true) !== bytes.byteLength) {
    throw new Error('GLB export has an invalid glTF 2.0 header.');
  }
  return bytes;
}

// Export only authored geometry, never the viewer's floor, lights or helpers.
// Runtime JavaScript, physics and postprocessing remain in the source/HTML viewer.
export async function exportObjectGLB(root) {
  if (!root?.isObject3D) throw new Error('Load a 3D asset before exporting.');
  let meshes = 0;
  root.traverse(node => { if (node.isMesh) meshes++; });
  if (!meshes) throw new Error('This asset has no exportable meshes.');
  root.updateMatrixWorld(true);
  const result = await new GLTFExporter().parseAsync(root, {
    binary: true, onlyVisible: true, animations: root.animations || [],
  });
  return validateGLB(result);
}

// Rebuild the selected history record in isolation; exporting an older item must
// never silently export the currently displayed scene or replace the user's work.
export async function exportCodeGLB(code) {
  if (!code?.trim()) throw new Error('The 3D source is missing.');
  const [{ createApp }, { default: Viewer }] = await Promise.all([
    import('vue'), import('../ThreeViewer.vue'),
  ]);
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-10000px;top:0;width:640px;height:640px;pointer-events:none';
  host.setAttribute('aria-hidden', 'true');
  document.body.appendChild(host);
  const app = createApp(Viewer, { enablePhysics: false, presentation: 'studio' });
  try {
    const viewer = app.mount(host);
    const deadline = Date.now() + 60000;
    while (!viewer.isReady) {
      if (Date.now() > deadline) throw new Error('The 3D export renderer did not start.');
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    const root = await viewer.applyModuleCode(code, 'replace');
    return await exportObjectGLB(root);
  } finally {
    app.unmount();
    host.remove();
  }
}

export async function uploadGLBArtifact({ bytes, uploadContent, generation, attribution }) {
  const data = validateGLB(bytes);
  const receipt = await uploadContent({ data, contentType: GLB_MIME,
    generation: { type: '3d-model', model: generation.model, timestamp: generation.timestamp || Date.now() }, attribution });
  if (!receipt?.url?.startsWith('ipfs://')) throw new Error('GLB upload did not return a decentralized content URI.');
  return { uri: receipt.url, type: GLB_MIME, name: 'asset.glb', size: data.byteLength };
}
