import { remoteRequirementSatisfied } from '../../stores/remoteInference.js';
import { agentModelOverride } from './teamCapabilities.js';
import { getAvailableAgentWorkflows } from '../agentWorkflows.js';
import { loadSmartAgents, smartAgentCatalog } from '../smartAgentCatalog.js';
import { executeCreation } from './createCapabilities.js';
import * as distribution from './distribution.solo.js';
import { workflowResultArtifacts } from './workflowResults.js';

const RESULT_METADATA = new Set(['success', 'status', 'createdAt', 'completedAt', 'id', 'generation_id', 'generationId', 'sourceId', 'prompt', 'filename', 'model', 'meta', 'durationMs', 'tokensPerSecond']);
function hasResult(value) {
  if (typeof value === 'string') return Boolean(value.trim());
  if (Array.isArray(value)) return value.some(hasResult);
  if (value && typeof value === 'object') return Object.entries(value).some(([key, item]) => !RESULT_METADATA.has(key) && hasResult(item));
  return typeof value === 'number' && Number.isFinite(value);
}
const failedResult = value => value?.ok === false || value?.success === false || value?.isError === true || Boolean(value?.error) || ['failed', 'error', 'cancelled', 'canceled', 'pending', 'queued', 'running', 'processing', 'rejected', 'unknown', 'requires_input', 'unsupported'].includes(value?.status);
const MEDIA_RESULT_KEYS = new Set(['image', 'imageSrc', 'imageUrl', 'image_base64', 'image_path', 'audio', 'audioSrc', 'audio_base64', 'audio_path', 'narration', 'video', 'videoSrc', 'videoUrl', 'video_base64', 'video_path']);
function incompleteResults(value, location = 'result', depth = 0) {
  if (!value || typeof value !== 'object') return [];
  if (depth > 24) return [{ error: 'The workflow result is too deeply nested to verify.' }];
  const failures = failedResult(value) ? [{ location, error: value.error || 'A workflow output failed.' }] : [];
  for (const [key, item] of Object.entries(value)) {
    if (MEDIA_RESULT_KEYS.has(key) && (item == null || (typeof item === 'string' && !item.trim()))) failures.push({ location: `${location}.${key}`, error: 'A requested media output is missing.' });
    else failures.push(...incompleteResults(item, `${location}.${key}`, depth + 1));
  }
  return failures;
}

function usableMedia(value, failures, location = 'result', depth = 0) {
  if (!value || typeof value !== 'object') return value;
  if (depth > 24) throw new Error('The workflow result is too deeply nested to save.');
  if (Array.isArray(value)) return value.map((item, index) => usableMedia(item, failures, `${location}[${index}]`, depth + 1));
  return Object.fromEntries(Object.entries(value).map(([key, item]) => {
    if (MEDIA_RESULT_KEYS.has(key) && typeof item === 'string' && item.trim()) {
      try { workflowResultArtifacts('workflow-media', { [key]: item }); }
      catch (cause) { failures.push({ location: `${location}.${key}`, error: cause.message }); return [key, null]; }
    }
    return [key, usableMedia(item, failures, `${location}.${key}`, depth + 1)];
  }));
}

function collectResults(workflow, response) {
  const payload = response?.result;
  const batch = Array.isArray(payload?.results);
  const candidates = batch ? payload.results : [payload];
  const artifacts = [], failures = [];
  if (response?.success !== true || failedResult(payload)) failures.push({ error: response?.error || payload?.error || 'Workflow failed.' });
  if (!batch && failures.length) return { artifacts, failures };
  for (const [index, candidate] of candidates.entries()) {
    if (failedResult(candidate) || !hasResult(candidate)) {
      failures.push({ index, filename: candidate?.filename, error: candidate?.error || 'This workflow output did not produce a deliverable.' });
      continue;
    }
    try {
      failures.push(...incompleteResults(candidate, batch ? `results[${index}]` : 'result'));
      const usable = usableMedia(candidate, failures);
      if (!hasResult(usable)) throw new Error('This workflow output did not produce a deliverable.');
      artifacts.push(...workflowResultArtifacts(workflow.id, usable, workflow.name).map(artifact => ({
        ...artifact, meta: { ...artifact.meta, ...(batch ? { resultIndex: index } : {}) },
      })));
    } catch (cause) { failures.push({ index, filename: candidate?.filename, error: cause.message }); }
  }
  if (!artifacts.length && !failures.length) failures.push({ error: 'The workflow returned no deliverable.' });
  return { artifacts, failures };
}

const MEDIA_EXTENSIONS = { image: 'png', audio: 'wav', music: 'wav', video: 'mp4', '3d': 'gltf' };
const MEDIA_TYPES = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif',
  wav: 'audio/wav', mp3: 'audio/mpeg', ogg: 'audio/ogg', flac: 'audio/flac', m4a: 'audio/mp4',
  mp4: 'video/mp4', webm: 'video/webm', gltf: 'model/gltf+json', glb: 'model/gltf-binary',
};

// Distribution accepts blob references. Import generated temp files first so
// catalog entries never depend on the inference server retaining those files.
async function durableArtifact(artifact, runtime, context) {
  if (!artifact) throw new Error('The workflow returned no deliverable.');
  const isPath = artifact.meta?.payloadEncoding === 'path';
  const inline = typeof artifact.payload === 'string' && artifact.payload.match(/^data:([^;,]+);base64,([A-Za-z0-9+/]+={0,2})$/);
  if (!isPath && !inline) {
    if (!['text', 'code'].includes(artifact.pipeline) || !String(artifact.payload || '').trim()) throw new Error('The workflow output has no valid local artifact.');
    return artifact;
  }
  const api = runtime.blobs || globalThis.window?.electronAPI?.db?.blobs;
  const localPath = artifact.meta?.localPath || artifact.payload;
  if (inline && !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(inline[2])) throw new Error('The generated media contains invalid base64 data.');
  const ext = isPath ? localPath.match(/\.([a-z0-9]{1,12})$/i)?.[1].toLowerCase() || MEDIA_EXTENSIONS[artifact.pipeline]
    : Object.keys(MEDIA_TYPES).find(key => MEDIA_TYPES[key] === inline[1]) || ({ 'audio/x-wav': 'wav', 'audio/mp3': 'mp3', 'audio/webm': 'webm' })[inline[1]];
  if (!ext) throw new Error('The workflow media format is unsupported.');
  const mimeType = inline?.[1] || artifact.meta?.mimeType || MEDIA_TYPES[ext] || 'application/octet-stream';
  const meta = { ...artifact.meta, payloadEncoding: 'blob', mimeType };
  delete meta.localPath;
  const provenance = { source: 'workflow', sourceId: context.issueId, mimeType };
  if (isPath ? !api?.writeFromPath : !api?.write) throw new Error('Local media storage is unavailable.');
  const blob = isPath ? await api.writeFromPath(localPath, ext, provenance) : await api.write(artifact.payload, ext, provenance);
  if (!blob?.id) throw new Error('The generated media could not be saved.');
  return { ...artifact, payload: null, blobId: blob.id, blobExt: ext, meta };
}

async function saveResults(charter, roleKey, companion, workflow, inputs, context, artifacts, failures, runtime) {
  const records = [], errors = [...failures];
  for (const artifact of artifacts) {
    try {
      const durable = await durableArtifact(artifact, runtime, context);
      const record = await runtime.save(charter.id, { ...durable, role: roleKey, companion, issueId: context.issueId,
        meta: { ...durable.meta, ...context, workflowId: workflow.id, inputs, ...(failures.length ? { incomplete: true } : {}) } });
      if (!record?.id) throw new Error('The workflow deliverable could not be saved.');
      records.push(record);
    } catch (cause) { errors.push({ pipeline: artifact?.pipeline, error: cause.message || 'The workflow deliverable could not be saved.' }); }
  }
  const contentIds = records.map(record => record.id);
  const result = { ...(records[0] || {}), records, contentIds, scope: 'local_draft', workflowId: workflow.id };
  if (errors.length || !records.length) return { ...result, ok: false, status: 'requires_input', partialResult: { contentIds, failures: errors },
    error: `${records.length ? 'Some workflow results were saved, but the task is incomplete.' : 'No workflow deliverable was saved.'} ${errors.map(item => item.error).join(' ')}` };
  return { ...result, ok: true, status: 'completed' };
}

export function companyWorkflowMode(skill) {
  if (skill?.id === 'chart-forecaster-v1.0.0') return 'network';
  if (skill?.execution?.type === 'javascript' && typeof skill.execution.execute === 'function') return 'local';
  if (skill?.id === 'mass-chat-v1.0.0') return 'local';
  if (!skill?.execution && !skill?.chatBased && !skill?.tools?.bonzai?.length && !skill?.tools?.mcp?.length) return 'prompt';
  return 'interactive';
}

export async function executeCompanyWorkflow(charter, roleKey, companion, action, ctx, deps = null) {
  const runtime = deps || {
    catalog: getAvailableAgentWorkflows,
    agents: async () => { await loadSmartAgents(); return smartAgentCatalog.agents; },
    service: async () => (await import('../skill.service.js')).skillService,
    save: distribution.publishContent,
    create: executeCreation,
    checkModels: checkWorkflowModels,
    lock: async () => {
      const generation = await import('../../stores/generationStore.js');
      if (!generation.startGeneration('text')) throw new Error('Another creation is running. Try again when the device is available.');
      return () => generation.stopGeneration('text');
    },
  };
  const catalog = await runtime.catalog();
  const agent = (await runtime.agents()).find(item => item.id === companion);
  if (!agent) return { ok: false, error: 'This agent is no longer available.' };
  const workflow = catalog.find(item => item.id === action.workflowId);
  if (!workflow || workflow.disabled) return { ok: false, error: 'This workflow is unavailable.' };
  const mode = companyWorkflowMode(workflow);
  if (mode === 'interactive') return { ok: false, status: 'requires_input', workflowId: workflow.id, error: 'This workflow requires its interactive workspace. No output has been produced.' };
  const service = await runtime.service();
  const validation = service.validateSkillInputs(workflow, action.inputs || {});
  if (!validation.valid) return { ok: false, beforeDispatch: true, error: validation.errors.join('; ') };
  await runtime.checkModels(workflow, validation.normalizedInputs);
  const context = { companyId: charter.id, issueId: ctx.issueId, role: roleKey, agentId: companion, approved: Boolean(ctx.pendingId) };
  let artifacts, failures = [];
  if (mode === 'prompt') {
    const prepared = service.prepareSkillExecution(workflow.id, validation.normalizedInputs);
    const creation = await runtime.create({ type: 'produce', pipeline: 'text', prompt: prepared.taskPrompt }, { ...context, instructions: prepared.systemPrompt, llm: agentModelOverride(charter, roleKey, await runtime.agents()) });
    if (failedResult(creation) || !['text', 'code'].includes(creation?.pipeline) || typeof creation?.payload !== 'string' || !creation.payload.trim()) {
      return { ok: false, status: 'requires_input', workflowId: workflow.id, error: creation?.error || 'The workflow did not produce a usable text result.' };
    }
    if (ctx.workerExecution) return { ...creation, ok: true, status: 'completed', scope: 'local_draft', workflowId: workflow.id };
    artifacts = [creation];
  } else {
    const release = workflow.execution?.managesGeneration ? () => {} : await runtime.lock();
    try {
      const result = await service.executeSkill(workflow.id, validation.normalizedInputs, context);
      ({ artifacts, failures } = collectResults(workflow, result));
      if (ctx.workerExecution) return {
        text: artifacts.filter(artifact => ['text', 'code'].includes(artifact.pipeline)).map(artifact => artifact.payload).join('\n\n'),
        artifacts: artifacts.filter(artifact => !['text', 'code'].includes(artifact.pipeline)),
        ok: failures.length === 0, status: failures.length ? 'requires_input' : 'completed', scope: 'local_draft', workflowId: workflow.id,
        ...(failures.length ? { partialResult: { failures }, error: 'The workflow is incomplete. Available outputs are included for review.' } : {}),
      };
    } finally { release(); }
  }
  return saveResults(charter, roleKey, companion, workflow, validation.normalizedInputs, context, artifacts, failures, runtime);
}

async function checkWorkflowModels(workflow, inputs = {}) {
  if (workflow.id === 'mass-chat-v1.0.0') {
    for (const filename of inputs.models || []) if (!await window.electronAPI?.checkModel?.(filename)) throw Object.assign(new Error('A selected language model is not installed. Open the workflow to download it first.'), { beforeDispatch: true });
    return;
  }
  const { getSkillModelRequirements } = await import('../../skills/flagship.js');
  const requirements = getSkillModelRequirements(workflow.id).filter(model => !(inputs.soundtrack && (model.key === 'music_fast' || model.parentKey === 'music_fast'))).filter(model => workflow.id !== 'chart-forecaster-v1.0.0' || model.key === 'forecast_quality');
  const pipelines = { audio_quality: 'audio_quality_persona', vision: 'vision', forecast_quality: 'forecast', music_fast: 'music', image_advanced: 'image_quality' };
  const remote = await window.electronAPI?.openRouter?.status?.();
  for (const model of requirements) {
    if (remote && remoteRequirementSatisfied(model, remote)) continue;
    if (model.type === 'llm') {
      if (!model.parentKey && (await window.electronAPI?.openRouter?.status?.())?.active) continue;
      if (!await window.electronAPI?.checkModel?.(model.filename)) throw Object.assign(new Error('A language download is required. Open the workflow to download it first.'), { beforeDispatch: true });
    } else {
      const response = await fetch(`${window.electronAPI?.env?.API_BASE || 'http://127.0.0.1:65000'}/pipelines/plan`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pipeline: pipelines[model.key] || model.key }), signal: AbortSignal.timeout(10000),
      });
      if (!response.ok || (await response.json()).ok !== true) throw Object.assign(new Error('Required workflow media is not installed. Open the workflow to finish downloads.'), { beforeDispatch: true });
    }
  }
}
