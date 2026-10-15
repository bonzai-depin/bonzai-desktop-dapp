import { ethers } from 'ethers';
/** Turn existing workflow result structures into text plus actual media deliveries. */
export function collectWorkerOutputs(value) {
  const artifacts = [];
  const mediaKeys = { image: 'image', image_base64: 'image', image_path: 'image', narration: 'audio', audio: 'audio', audio_base64: 'audio', audio_path: 'audio', video: 'video', video_base64: 'video', video_path: 'video' };
  const walk = (item, key = '', depth = 0) => {
    if (depth > 16) throw new Error('Workflow output is too deeply nested.');
    if (typeof item === 'string' && mediaKeys[key] && item) {
      artifacts.push({ pipeline: mediaKeys[key], payload: item, meta: { payloadEncoding: /^(?:\/|[a-z]:[\\/])/i.test(item) ? 'path' : 'base64' } });
      return `[${mediaKeys[key]} attachment ${artifacts.length}]`;
    }
    if (Array.isArray(item)) return item.map(v => walk(v, '', depth + 1));
    if (item && typeof item === 'object') return Object.fromEntries(Object.entries(item).map(([k, v]) => [k, walk(v, k, depth + 1)]));
    return item;
  };
  const clean = walk(value);
  return { text: typeof clean === 'string' ? clean : JSON.stringify(clean, null, 2), artifacts };
}

/** Compact evidence commits the full text without exceeding escrow packet limits. */
export function workerDeliveryEvidence(run) {
  return { version: 1, requestId: run.id || run.requestId, jobId: run.jobId,
    textHash: ethers.keccak256(ethers.toUtf8Bytes(String(run.result?.text || ''))),
    artifacts: (run.result?.artifacts || []).map(({id,sha256,ext,size,mimeType}) => ({id,sha256,ext,size,mimeType})) };
}
