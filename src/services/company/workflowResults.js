import { keccak256, toUtf8Bytes } from 'ethers';

const MEDIA_KEYS = {
  image: 'image', imageSrc: 'image', imageUrl: 'image', image_base64: 'image', image_path: 'image',
  audio: 'audio', audioSrc: 'audio', audio_base64: 'audio', audio_path: 'audio', narration: 'audio',
  video: 'video', videoSrc: 'video', videoUrl: 'video', video_base64: 'video', video_path: 'video',
};
const absolutePath = value => /^(?:\/|[a-z]:[\\/]|\\\\)/i.test(value);

function localMediaPath(value) {
  if (absolutePath(value)) return value;
  try {
    const url = new URL(value);
    if (['http:', 'https:'].includes(url.protocol) && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
      && url.pathname === '/media/stream' && absolutePath(url.searchParams.get('path') || '')) return url.searchParams.get('path');
  } catch { /* Inline data and ordinary text are handled below. */ }
  return null;
}

function mediaArtifact(pipeline, value, title, key) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const localPath = localMediaPath(value);
  if (localPath) return { pipeline, prompt: title, payload: localPath, meta: { payloadEncoding: 'path', localPath } };
  const inline = value.match(/^data:((?:image|audio|video)\/[^;]+);base64,([\s\S]+)$/i);
  if (inline) {
    return { pipeline, prompt: title, payload: `data:${inline[1].toLowerCase()};base64,${inline[2].replace(/\s/g, '')}`, meta: { payloadEncoding: 'base64' } };
  }
  const compact = value.replace(/\s/g, '');
  const bareMedia = ['image', 'audio', 'video', 'narration'].includes(key) && compact.length >= 32
    && /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(compact);
  if ((key.endsWith('_base64') || bareMedia) && /^[a-z0-9+/=\s]+$/i.test(value)) {
    const mime = { image: 'image/png', audio: 'audio/wav', music: 'audio/wav', video: 'video/mp4' }[pipeline];
    return { pipeline, prompt: title, payload: `data:${mime};base64,${value.replace(/\s/g, '')}`, meta: { payloadEncoding: 'base64' } };
  }
  if (/^(?:https?|blob|file|data):/i.test(value) || /(?:_path|_base64|Src|Url)$/.test(key)) throw new Error('The workflow media is not available as a local file or embedded result.');
  return null;
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

function srtTime(seconds) {
  const total = Math.max(0, Math.round(Number(seconds || 0) * 1000));
  return `${String(Math.floor(total / 3600000)).padStart(2, '0')}:${String(Math.floor(total / 60000) % 60).padStart(2, '0')}:${String(Math.floor(total / 1000) % 60).padStart(2, '0')},${String(total % 1000).padStart(3, '0')}`;
}

/** Keep playable media separate from the readable workflow result. No network fetches. */
export function workflowResultArtifacts(workflowId, result, workflowName = 'Workflow result') {
  if (result == null || result.success === false || result.isError === true || result.error) throw new Error('This workflow did not produce a successful result.');
  if (typeof result === 'object' && !Array.isArray(result) && Object.keys(result).every(key => ['success', 'status', 'createdAt'].includes(key))) throw new Error('This workflow returned no deliverable to save.');
  const media = [];
  const title = String(result.title || result.filename || result.name || result.prompt || workflowName);
  const addMedia = (pipeline, value, key) => {
    const artifact = mediaArtifact(pipeline, value, title, key);
    if (!artifact) return value;
    const previous = media.findIndex(item => item.pipeline === artifact.pipeline && item.payload === artifact.payload);
    const index = previous < 0 ? media.push(artifact) - 1 : previous;
    return `[${pipeline} attachment ${index + 1}]`;
  };
  const clean = (value, key = '', depth = 0) => {
    if (depth > 24) throw new Error('The workflow result is too deeply nested to save.');
    if (typeof value === 'string' && MEDIA_KEYS[key]) return addMedia(MEDIA_KEYS[key], value, key);
    if (Array.isArray(value)) return value.map(item => clean(item, '', depth + 1));
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
      .filter(([, item]) => item !== undefined && typeof item !== 'function')
      .map(([name, item]) => [name, clean(item, name, depth + 1)]));
    return value;
  };
  // Stream generation returns its media under `data`, alongside the pipeline.
  const source = workflowId === 'live-streaming-v1.0.0' && ['image', 'audio', 'music', 'video'].includes(result.type)
    ? { ...result, data: addMedia(result.type, result.data, `${result.type}_base64`) } : result;
  const readable = clean(source);
  // Session timestamps change when the caption player saves again on reset.
  // Keep them as metadata so the same content has the same idempotency key.
  if (readable && typeof readable === 'object' && !Array.isArray(readable)) delete readable.createdAt;
  let text = typeof readable === 'string' ? readable : JSON.stringify(JSON.parse(stableJson(readable)), null, 2);
  const meta = { payloadEncoding: 'text', kind: 'workflow-result', title };
  if (typeof result.createdAt === 'string') meta.generatedAt = result.createdAt;
  const generationId = result.generation_id || result.generationId || result.sourceId || result.id;
  if (typeof generationId === 'string' || typeof generationId === 'number') meta.generationId = String(generationId);
  if (workflowId === 'meditation-forge-v1.0.0' && result.script?.trim()) {
    text = [`# ${title}`, result.scenarioName, Number(result.durationSeconds) > 0 ? `Duration: ${Math.round(result.durationSeconds)} seconds` : result.duration ? `Duration: ${result.duration} minutes` : '', result.script].filter(Boolean).join('\n\n');
    for (const key of ['durationSeconds', 'requestedDurationSeconds', 'narrationSeconds', 'durationPaced', 'captionSegments']) {
      if (result[key] !== undefined) meta[key] = result[key];
    }
  }
  const artifacts = [];
  if (workflowId === 'video-captioning-v1.0.0' && Array.isArray(result.transcript) && result.transcript.length) {
    meta.captionType = result.captionType || 'visual-descriptions';
    text = result.transcript.map(entry => `${srtTime(entry.timestamp)}  ${entry.text}`).join('\n\n');
    const subtitles = result.transcript.map((entry, index, entries) => {
      const end = entries[index + 1]?.timestamp ?? Math.min(Number(result.duration) || Infinity, Number(entry.timestamp) + (Number(result.captureInterval) || 5));
      return `${index + 1}\n${srtTime(entry.timestamp)} --> ${srtTime(end)}\n${entry.text}`;
    }).join('\n\n');
    artifacts.push({ pipeline: 'text', prompt: `${title} · Subtitles`, payload: subtitles, meta: { payloadEncoding: 'text', kind: 'workflow-result', format: 'srt', captionType: meta.captionType, title: `${title} · Subtitles` } });
  }
  if (text && text !== '{}' && text !== '[]') artifacts.unshift({ pipeline: 'text', prompt: title, payload: text, meta });
  artifacts.push(...media);
  if (!artifacts.length) throw new Error('This workflow returned no deliverable to save.');
  return artifacts;
}

export function workflowResultInput(workflowId, result, workflowName) {
  const artifacts = workflowResultArtifacts(workflowId, result, workflowName);
  const identity = artifacts.map(({ meta, ...artifact }) => {
    const { generatedAt, ...stableMeta } = meta;
    return { ...artifact, meta: stableMeta };
  });
  return { workflowId, sourceId: keccak256(toUtf8Bytes(stableJson({ workflowId, artifacts: identity }))), artifacts };
}

/** Snapshot task ownership once; retries never follow a later team selection. */
export function createWorkflowResultCapture({ taskContext, save, recovery = null, onState = () => {}, onSaved = () => {} }) {
  const context = taskContext?.companyId && taskContext?.issueId && taskContext?.skillId
    ? Object.freeze({ companyId: taskContext.companyId, issueId: taskContext.issueId, skillId: taskContext.skillId, agentId: taskContext.agentId, llm: taskContext.llm || null }) : null;
  const pending = [], saved = new Set();
  let saving = false, staging = 0, error = '', errorType = '';
  const notify = () => onState({ saving: saving || staging > 0, error, canRetry: !saving && !staging && (pending.length > 0 || errorType === 'persistence') });
  let restored = !recovery, restoring = null;
  const loadPending = async () => {
    if (restored) return;
    if (!restoring) restoring = (async () => {
      const stored = await recovery.load();
      const ids = new Set(pending.map(item => item.sourceId));
      pending.unshift(...stored.filter(item => !ids.has(item.sourceId)));
      restored = true;
    })().finally(() => { restoring = null; });
    await restoring;
  };
  const retry = async () => {
    if (!context || saving) return;
    saving = true; error = ''; errorType = ''; notify();
    try {
      await loadPending();
      while (pending.length) {
        const input = recovery ? await recovery.stage(pending[0]) : pending[0];
        const response = await save(context.companyId, context.issueId, input);
        if (!response?.contentIds?.length) throw new Error('The workflow result could not be saved to this task.');
        if (recovery) await recovery.remove(input.sourceId);
        saved.add(input.sourceId); pending.shift();
        onSaved(response);
      }
    } catch (cause) {
      error = cause?.message || 'The workflow result could not be saved to this task.';
      errorType = 'persistence';
    } finally { saving = false; notify(); }
  };
  const capture = async (workflowId, result, workflowName) => {
    if (!context || workflowId !== context.skillId) return;
    let input;
    try { input = workflowResultInput(workflowId, result, workflowName); }
    catch (cause) {
      // Do not hide a pending durable-save failure behind a later invalid event.
      if (errorType !== 'persistence') { error = cause.message; errorType = 'normalization'; }
      notify(); return;
    }
    if (errorType === 'normalization') { error = ''; errorType = ''; notify(); }
    if (saved.has(input.sourceId) || pending.some(item => item.sourceId === input.sourceId)) return;
    pending.push(input);
    if (recovery) {
      staging++; notify();
      try {
        // Back up every output, including later results while an earlier save
        // needs retry. A restart must not discard the second result in a queue.
        await recovery.stage(input);
      } catch (cause) { error = cause.message; errorType = 'persistence'; }
      finally { staging--; }
    }
    // A failed save stays visible until the owner explicitly retries it.
    if (!error) await retry();
    notify();
  };
  // Resuming the same task replays local saves only, never generation or approval.
  const restore = async () => { if (context && recovery) await retry(); };
  return { context, capture, retry, restore };
}
