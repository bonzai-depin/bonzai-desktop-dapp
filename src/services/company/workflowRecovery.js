import { keccak256, toUtf8Bytes } from 'ethers';

export const WORKFLOW_BRIDGE_MESSAGE = 'Task saving needs the updated desktop app. Finish any running work, then restart BonzAI and reopen this task.';
export const WORKFLOW_RECOVERED_MESSAGE = 'Your result is backed up on this device. Reopen this task after restarting BonzAI to finish saving it.';

export function workflowBridgeReady(api = globalThis.window?.electronAPI) {
  return typeof api?.db?.issues?.saveWorkflowResult === 'function'
    && typeof api?.db?.issues?.reviewWorkflowResult === 'function';
}

const extensions = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/mpeg': 'mp3', 'audio/ogg': 'ogg', 'audio/flac': 'flac', 'video/mp4': 'mp4', 'video/webm': 'webm', 'audio/webm': 'webm' };
const defaults = { image: 'png', audio: 'wav', music: 'wav', video: 'mp4', '3d': 'glb' };
const locks = new Map();
function serialize(key, run) {
  const next = (locks.get(key) || Promise.resolve()).catch(() => {}).then(run);
  locks.set(key, next);
  void next.finally(() => { if (locks.get(key) === next) locks.delete(key); }).catch(() => {});
  return next;
}

/** Small local recovery manifest; media bytes live in the existing blob store.
 * Available on older desktop bridges too, so an update cannot strand a result.
 * Each operation rereads the manifest under a lock, preserving concurrent outputs.
 */
export function createWorkflowRecovery(context, getApi = () => globalThis.window?.electronAPI) {
  if (!context?.companyId || !context?.issueId || !context?.skillId) return null;
  const scope = { companyId: context.companyId, issueId: context.issueId, skillId: context.skillId };
  const key = `workflowResultRecovery.v1.${keccak256(toUtf8Bytes(JSON.stringify(scope)))}`;
  async function read() {
    const api = getApi();
    if (!api?.store?.get || !api?.store?.set) throw new Error('Local result recovery is unavailable. Keep this task open and retry saving.');
    const saved = await api.store.get(key, null);
    if (!saved) return [];
    if (saved.version !== 1 || JSON.stringify(saved.scope) !== JSON.stringify(scope) || !Array.isArray(saved.pending)) throw new Error('The local result backup could not be read. Keep this task open.');
    return saved.pending;
  }
  async function write(pending) {
    const saved = await getApi().store.set(key, { version: 1, scope, pending });
    if (saved === false) throw new Error('The local result backup could not be written. Keep this task open and retry saving.');
  }
  return {
    load: () => serialize(key, read),
    stage: input => serialize(key, async () => {
      const pending = await read();
      const previous = pending.find(item => item.sourceId === input.sourceId);
      if (previous) return previous;
      const artifacts = [];
      for (const artifact of input.artifacts) {
        if (['text', 'code'].includes(artifact.pipeline) && artifact.meta?.payloadEncoding === 'text') {
          artifacts.push(artifact); continue;
        }
        const api = getApi();
        const mime = artifact.payload?.match(/^data:([^;,]+);base64,/i)?.[1]?.toLowerCase();
        const ext = extensions[mime] || artifact.meta?.localPath?.match(/\.([a-z0-9]{1,12})$/i)?.[1]?.toLowerCase() || defaults[artifact.pipeline];
        const meta = { source: 'workflow-recovery', sourceId: input.sourceId, mimeType: mime };
        const blob = artifact.meta?.payloadEncoding === 'path'
          ? await api?.db?.blobs?.writeFromPath?.(artifact.meta.localPath || artifact.payload, ext, meta)
          : await api?.db?.blobs?.write?.(artifact.payload, ext, meta);
        if (!blob?.path) throw new Error('The generated media could not be backed up. Keep this task open and retry saving.');
        artifacts.push({ ...artifact, payload: blob.path, meta: { ...artifact.meta, localPath: blob.path, payloadEncoding: 'path' } });
      }
      const staged = { ...input, artifacts };
      await write([...pending, staged]);
      return staged;
    }),
    remove: sourceId => serialize(key, async () => write((await read()).filter(item => item.sourceId !== sourceId))),
  };
}
