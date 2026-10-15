import { DEFAULT_3D_LLM_ID, DEFAULT_3D_LLM_TIER } from '../../config/modelDefaults.js';
import { visibleText } from '../../shared/visibleText.js';
/** The same local creation engines used by Create, exposed as typed agent actions. */
export const CREATE_PIPELINES = Object.freeze(['text', 'image', 'audio', 'video', '3d', 'music', 'vision', 'fineTune', 'skill']);
const MODES = Object.freeze({
  image: { turbo: '/image/turbo', quality: '/image/quality', advanced: '/image/advanced', standard: '/image/standard', turbo_edit: '/image/image/turbo' },
  audio: { design: '/audio/quality/design', clone: '/audio/quality/clone', turbo: '/audio/turbo', music: '/audio/music' },
  video: { fast: '/video', sota: '/video/sota', quality: '/video/quality' },
  vision: { analyze: '/vision/analyze', caption: '/vision/caption', ocr: '/vision/ocr' },
  fineTune: { llm: '/training/llm/start', abliterate: '/training/abliterate/start' },
});
const DEFAULT_MODES = { image: 'turbo', audio: 'design', video: 'fast', vision: 'analyze', fineTune: 'llm' };

export function creationRequest(action) {
  const pipeline = action.type === 'runFineTune' ? 'fineTune' : action.pipeline || 'text';
  if (!CREATE_PIPELINES.includes(pipeline)) throw new Error(`Unknown Create capability: ${pipeline}`);
  const params = { ...(action.params || {}) };
  const rawPrompt = action.prompt || params.prompt || params.text || '';
  const prompt = typeof rawPrompt === 'string' ? rawPrompt.trim() : JSON.stringify(rawPrompt);
  const mode = action.mode || params.mode || DEFAULT_MODES[pipeline];
  delete params.mode;
  // Downloading and external publication are separate, explicit user actions.
  params.auto_download = false;
  if (pipeline === 'fineTune') {
    if (mode === 'llm' && !params.dataset_id) throw new Error('Choose an existing local training dataset before starting a fine-tune.');
    if (!params.base_model) throw new Error('Choose a supported training model before starting training.');
  } else if (!prompt && !['vision'].includes(pipeline)) throw new Error('A creation prompt is required.');
  if (['text', '3d', 'skill'].includes(pipeline)) return { pipeline, prompt, params, mode: null, endpoint: null };
  const endpoint = pipeline === 'music' ? '/audio/music' : MODES[pipeline]?.[mode];
  if (!endpoint) throw new Error(`Unsupported ${pipeline} mode: ${mode}`);
  if (pipeline === 'audio' && mode !== 'music') {
    params.text ||= prompt;
    if (mode === 'turbo') params.prompt ||= prompt;
    if (mode === 'design' && !params.instruct) params.instruct = 'Clear, natural professional speaking voice';
  } else if (pipeline !== 'fineTune') params.prompt ||= prompt;
  return { pipeline, prompt, params, mode, endpoint };
}

export const CREATE_ACTION_GUIDE = `Create capabilities: text; image (mode turbo, quality, standard, turbo_edit); audio (design, clone, music); video (fast, sota, quality); 3d (Three.js scene or game); vision (analyze, caption, ocr); fineTune (llm, abliterate).
Use {"type":"produce","pipeline":"image","mode":"turbo","prompt":"...","params":{}}. Image editing and vision require image_base64; cloning requires reference audio. Use only input assets the user provided or explicitly approved. Never invent paths, dataset IDs, or completed outputs. Training requires an existing dataset_id and base_model and owner approval. Outputs are local drafts; publishing and paid jobs require separate approval.`;

/** Dependencies are injectable so fallbacks, errors and resource release can be tested without a model. */
export async function executeCreation(action, context = {}, dependencies = {}) {
  const request = creationRequest(action);
  if (request.pipeline === 'fineTune' && !context.approved) throw new Error('Training requires owner approval.');
  if (Object.keys(request.params).some(key => /(?:_path|_url)$/.test(key)) && !context.approved) throw new Error('Using file paths or network assets requires owner approval.');
  const deps = Object.keys(dependencies).length ? dependencies : await defaultDependencies();
  if (!deps.acquire(request.pipeline)) throw new Error('Another creation is running. Retry when the device is available.');
  try {
    let result;
    if (!request.endpoint) {
      const system = request.pipeline === '3d'
        ? 'Return only JavaScript: export default async function generate(params) { const THREE = params.THREE; const root = new THREE.Group(); /* build the complete scene here */ params.scene.add(root); return root; }. No imports, fetch, network, filesystem, eval, or external assets. Use built-in Three.js geometry and materials. Only THREE and scene are supplied. Do not assume a gameplay runtime or other injected helpers.'
        : request.pipeline === 'skill' ? 'Draft a complete, readable skill specification in Markdown with inputs, steps, permissions and outputs. Do not execute it or claim it is installed.' : '';
      const response = await deps.chat([system, context.instructions, request.prompt].filter(Boolean).join('\n\n'), { maxTokens: request.pipeline === '3d' ? 8192 : 4096, llmModel: request.pipeline === '3d' ? `llm_${DEFAULT_3D_LLM_ID}_${DEFAULT_3D_LLM_TIER}` : context.llm || undefined });
      const text = visibleText(typeof response === 'string' ? response : response?.text);
      if (!String(text || '').trim()) throw new Error('The creation engine returned no output.');
      result = { text };
      if (request.pipeline === '3d') result.text = text.replace(/^```(?:javascript|js)?\s*/i, '').replace(/\s*```$/, '');
    } else {
      result = await deps.request(request.endpoint, request.params);
      if (result?.error || result?.success === false) throw new Error(result.error || 'Creation failed.');
      if (request.pipeline === 'fineTune') {
        if (!result?.training_id) throw new Error('Training was not accepted by the local server.');
        if (!result?.model_id) throw new Error('Training has not produced a completed model yet.');
        return { pipeline: request.pipeline, prompt: request.prompt, payload: JSON.stringify(result), meta: { payloadEncoding: 'text', mode: request.mode, trainingId: result.training_id, modelId: result.model_id, status: 'completed' } };
      }
    }
    const payload = result.image_base64 || result.image || result.audio_base64 || result.video_base64 || result.text || result.caption || result.response || result.audio_path || result.video_path || result.image_path;
    if (!payload) throw new Error('The creation engine returned no artifact.');
    const localPath = result.audio_path || result.video_path || result.image_path || null;
    const meta = { mode: request.mode, endpoint: request.endpoint, raw: result.metadata || null, format: request.pipeline === '3d' ? 'javascript' : null, localPath, payloadEncoding: localPath && payload === localPath ? 'path' : ['3d', 'text', 'skill', 'vision'].includes(request.pipeline) ? 'text' : 'base64' };
    if (request.pipeline === 'audio' && Number.isFinite(result.duration_seconds)) {
      meta.durationSeconds = result.duration_seconds;
      meta.requestedDurationSeconds = result.requested_duration_seconds ?? null;
      meta.narrationSeconds = result.narration_seconds ?? result.duration_seconds;
      meta.captionSegments = result.caption_segments || [];
    }
    await deps.save?.(request.pipeline, request.prompt, payload, { ...meta, source: 'smart-agent', ...context });
    return { pipeline: request.pipeline, prompt: request.prompt, payload, meta };
  } finally { deps.release(request.pipeline); }
}

async function defaultDependencies() {
  const generation = await import('../../stores/generationStore.js');
  const history = await import('../../stores/inferenceStore.js');
  const modality = pipeline => ['music'].includes(pipeline) ? 'audio' : ['vision', 'skill', 'fineTune'].includes(pipeline) ? 'text' : pipeline;
  return {
    acquire: pipeline => generation.canStartGeneration() && generation.startGeneration(modality(pipeline)),
    release: pipeline => generation.stopGeneration(modality(pipeline)),
    async chat(prompt, options) {
      if (options.llmModel && window.electronAPI?.ensureModel) {
        const loaded = await window.electronAPI.ensureModel(options.llmModel);
        if (loaded?.ok === false || loaded?.success === false || loaded?.error) throw new Error(loaded.error || `Download and load ${options.llmModel.toLowerCase()} before running this smart agent.`);
      }
      return window.electronAPI.chat(prompt, { ...options, isolated: true });
    },
    async request(endpoint, payload) {
      const base = window.electronAPI?.env?.API_BASE || import.meta.env?.VITE_API_BASE || 'http://127.0.0.1:65000';
      // Company data stays local by default. Remote providers are not selected implicitly.
      const post = async () => {
        const response = await fetch(`${base}${endpoint}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || result.message || `Creation failed (${response.status}). Check the required downloads in Create.`);
        return result;
      };
      return endpoint.startsWith('/training/') ? await completeTraining(base, post) : await post();
    },
    async save(pipeline, prompt, payload, metadata) {
      // Company artifacts belong to their company catalog, not the user's shared memory.
      if (metadata.companyId) return;
      if (pipeline === 'image') await history.addImageInference(prompt, payload, metadata);
      else if (pipeline === 'audio' || pipeline === 'music') await history.addAudioInference(prompt, payload, metadata);
      else if (pipeline === 'video') await history.addVideoInference(prompt, payload, metadata);
      else if (pipeline === '3d') await history.addObjectInference(prompt, payload, metadata);
      else await history.addTextInference(prompt, payload, metadata);
    },
  };
}

async function completeTraining(base, start) {
  const { io } = await import('socket.io-client');
  const socket = io(`${base}/training`, { transports: ['polling', 'websocket'], forceNew: true, timeout: 10000 });
  let timer;
  try {
    await new Promise((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); });
    return await new Promise((resolve, reject) => {
      let trainingId;
      const earlyEvents = [];
      const settle = (event, failed) => {
        if (!trainingId) { earlyEvents.push([event, failed]); return; }
        if (event.training_id !== trainingId) return;
        if (failed) reject(Object.assign(new Error(event.error || 'Training failed.'), { retryable: false }));
        else resolve(event);
      };
      socket.on('training_complete', event => settle(event, false));
      socket.on('training_error', event => settle(event, true));
      timer = setTimeout(() => reject(Object.assign(new Error('Training completion could not be confirmed. Inspect Training before starting another run.'), { retryable: false })), 2 * 60 * 60 * 1000);
      start().then(result => {
        trainingId = result.training_id;
        if (!trainingId) { reject(new Error('The training server did not return a job ID.')); return; }
        earlyEvents.forEach(([event, failed]) => settle(event, failed));
      }).catch(reject);
    });
  } finally { clearTimeout(timer); socket.disconnect(); }
}
