import { artifactLanguage, artifactText, artifactTitle } from './artifactPresentation.js';

export function artifactKind(row = {}) {
  if (artifactLanguage(row) || row.pipeline === 'code') return 'code';
  const pipeline = String(row.pipeline || '').toLowerCase();
  if (['image', 'video', '3d'].includes(pipeline)) return pipeline;
  if (['audio', 'music', 'speech'].includes(pipeline)) return 'audio';
  if (['text', 'vision', 'skill', 'finetune'].includes(pipeline) || !pipeline) return 'text';
  return 'file';
}

export function artifactMime(row = {}) {
  const ext = String(row.blobExt || row.meta?.format || '').toLowerCase().replace(/^\./, '');
  if (ext === 'webm') return artifactKind(row) === 'audio' ? 'audio/webm' : 'video/webm';
  return ({ png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', wav: 'audio/wav', mp3: 'audio/mpeg', ogg: 'audio/ogg', flac: 'audio/flac', mp4: 'video/mp4', glb: 'model/gltf-binary', gltf: 'model/gltf+json', json: 'application/json', pdf: 'application/pdf', txt: 'text/plain', md: 'text/markdown' })[ext]
    || ({ image: 'image/png', audio: 'audio/mpeg', video: 'video/mp4', '3d': 'model/gltf+json', code: 'text/plain', text: 'text/plain' })[artifactKind(row)] || 'application/octet-stream';
}

export function artifactFilename(row = {}) {
  const language = artifactLanguage(row);
  const dataMime = typeof row.payload === 'string' ? row.payload.match(/^data:([^;,]+)/)?.[1] : '';
  const pathExt = row.meta?.localPath?.match(/\.([a-z0-9]{1,12})$/i)?.[1];
  const ext = row.blobExt || pathExt || ({ 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'audio/wav': 'wav', 'audio/mpeg': 'mp3', 'video/mp4': 'mp4', 'video/webm': 'webm' })[dataMime]
    || ({ javascript: 'js', typescript: 'ts', python: 'py' })[language] || language
    || ({ image: 'png', audio: 'mp3', video: 'mp4', '3d': 'gltf', text: 'md', code: 'txt' })[artifactKind(row)] || 'bin';
  const title = (artifactTitle(row) || 'result').replace(/[<>:"/\\|?*\x00-\x1f]+/g, '-').trim().slice(0, 110);
  return title.toLowerCase().endsWith(`.${ext.toLowerCase()}`) ? title : `${title}.${ext}`;
}

/** Resolve only local data. A generated URL must never trigger an external fetch. */
export async function artifactSource(row, api = globalThis.window?.electronAPI) {
  if (row.blobId) {
    if (api?.db?.blobs?.read) {
      const bytes = await api.db.blobs.read(row.blobId, row.blobExt);
      if (!bytes?.byteLength && !bytes?.length) throw new Error('This saved file is empty or unavailable.');
      const url = URL.createObjectURL(new Blob([bytes], { type: artifactMime(row) }));
      return { url, release: () => URL.revokeObjectURL(url) };
    }
    if (!api?.db?.blobs?.url) throw new Error('This saved file is unavailable. Reopen BonzAI after your running work finishes.');
    const url = await api.db.blobs.url(row.blobId, row.blobExt, artifactMime(row));
    if (!url?.startsWith('data:')) throw new Error('This saved file is empty or unavailable.');
    return { url, release() {} };
  }
  if (row.meta?.payloadEncoding === 'path' && row.meta?.localPath) {
    const base = api?.env?.API_BASE || 'http://127.0.0.1:65000';
    return { url: `${base}/media/stream?path=${encodeURIComponent(row.meta.localPath)}`, release() {} };
  }
  const payload = row.payload;
  if (typeof payload === 'string' && payload.startsWith('data:')) return { url: payload, release() {} };
  if (['text', 'code'].includes(artifactKind(row))) {
    const text = artifactText(row);
    if (!text) throw new Error('This saved file is empty or unavailable.');
    const url = URL.createObjectURL(new Blob([text], { type: artifactMime(row) }));
    return { url, release: () => URL.revokeObjectURL(url) };
  }
  // Legacy catalog rows may contain raw base64 media instead of blob references.
  if (typeof payload === 'string' && /^[A-Za-z0-9+/]+={0,2}$/.test(payload) && payload.length % 4 === 0) {
    return { url: `data:${artifactMime(row)};base64,${payload}`, release() {} };
  }
  throw new Error('This saved file is empty or unavailable.');
}

export async function downloadArtifact(row, api = globalThis.window?.electronAPI) {
  const source = await artifactSource(row, api);
  let temporary = '';
  try {
    let url = source.url;
    // Stream URLs live on the local inference server. Fetch to a local Blob so
    // the download attribute does not navigate the application across origins.
    if (/^https?:/.test(url)) {
      const response = await fetch(url);
      if (!response.ok) throw new Error('This saved file is empty or unavailable.');
      temporary = URL.createObjectURL(await response.blob());
      url = temporary;
    }
    const link = document.createElement('a');
    link.href = url;
    link.download = artifactFilename(row);
    document.body.appendChild(link);
    link.click(); link.remove();
  } finally {
    // Keep the Blob alive until the browser has begun the download.
    setTimeout(() => { source.release(); if (temporary) URL.revokeObjectURL(temporary); }, 1000);
  }
}

export async function artifactPlainText(row, api = globalThis.window?.electronAPI) {
  if (!['text', 'code'].includes(artifactKind(row))) throw new Error('This result is not text.');
  if (!row.blobId && row.meta?.payloadEncoding !== 'path') {
    const value = artifactText(row);
    if (!value) throw new Error('This saved file is empty or unavailable.');
    return value;
  }
  const source = await artifactSource(row, api);
  try {
    const response = await fetch(source.url);
    if (!response.ok) throw new Error('This saved file is empty or unavailable.');
    return artifactText({ ...row, payload: await response.text() });
  } finally { source.release(); }
}

export function artifactReviewState(row, issues = []) {
  const issue = issues.find(item => item.id === row.meta?.issueId);
  if (!issue) return { label: 'Saved', tone: 'neutral', issue: null };
  const steps = issue.execution?.steps || [];
  const reviewed = steps.some(step => (step.reviews || []).some(review => review.decision === 'completed' && review.contentIds?.includes(row.id))
    || (step.output?.verifiedBy === 'owner' && step.output?.contentIds?.includes(row.id)));
  if (reviewed) return { label: 'Approved', tone: 'success', issue };
  if (steps.some(step => step.output?.status === 'ready_for_review' && step.output?.contentIds?.includes(row.id))) return { label: 'Awaiting review', tone: 'warning', issue };
  return { label: 'Saved', tone: 'neutral', issue };
}

export function resultLibrarySections(charter = {}) {
  const sections = [{ key: 'assets', label: 'Creations & files', icon: 'perm_media' }, { key: 'work', label: 'Task history', icon: 'task_alt' }];
  const workspace = charter.workspace || {};
  if (!workspace.executionWorkflowId && (['hvac', 'grants', 'purchasing', 'finance'].includes(workspace.profile)
    || workspace.channels?.some(item => ['gmao', 'billing', 'grants', 'purchasing'].includes(item.view || item.value)))) {
    sections.push({ key: 'documents', label: 'Documents & records', icon: 'folder_open' });
  }
  return sections;
}
