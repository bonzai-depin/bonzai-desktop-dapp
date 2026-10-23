// Source-neutral activity records. Never infer success from a missing job.
export const terminal = status => ['completed', 'failed', 'cancelled', 'interrupted'].includes(status);
export function mergeOperation(previous, patch, now = Date.now()) {
  return { startedAt: now, ...previous, ...patch, updatedAt: now,
    progress: Number.isFinite(patch.progress) ? Math.max(0, Math.min(100, patch.progress)) : patch.progress === null ? null : previous?.progress ?? null,
    finishedAt: terminal(patch.status) ? patch.finishedAt || previous?.finishedAt || now : null };
}
export function generationKind(kind = '') {
  if (/video|wan|ltx|i2v|enhance/i.test(kind)) return 'video';
  if (/audio|music|voice|tts|kokoro|chatterbox/i.test(kind)) return 'music';
  if (/3d|scene|game/i.test(kind)) return 'game';
  if (/text|llm|chat/i.test(kind)) return 'chat';
  return 'image';
}
export const generationLabels = {video:'Generating video',music:'Generating audio',game:'Generating 3D',chat:'Generating text',image:'Generating image'};
export function generationPatch(event) {
  const mode = generationKind(event.kind);
  return { id: `generation:${event.generation_id}`, source: 'generation', title: /enhance/i.test(event.kind || '') ? 'Enhancing video' : generationLabels[mode], mode,
    status: event.stage === 'queued' ? 'queued' : 'running', stage: event.stage || 'starting',
    progress: event.pct ?? null, step: event.step, total: event.total,
    startedAt: event.ts ? event.ts * 1000 : Date.now(), location: 'On this device' };
}
export function orderOperations(rows) {
  const rank = {failed:0,interrupted:0,attention:0,running:1,queued:2,monitoring:3,completed:4,cancelled:5};
  return [...rows].sort((a,b)=>(rank[a.status]??3)-(rank[b.status]??3)||(a.status==='queued'&&b.status==='queued' ? a.startedAt-b.startedAt : b.updatedAt-a.updatedAt));
}
