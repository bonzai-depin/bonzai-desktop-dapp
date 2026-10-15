import { executeCreation } from '../company/createCapabilities.js';
import { getAvailableAgentWorkflows, getAgentWorkflowIds } from '../agentWorkflows.js';

export const CHAT_MEDIA = Object.freeze(['image', 'audio', 'music', 'video', '3d', 'vision']);
export const MEDITATION_ID = 'meditation-forge-v1.0.0';

// A chat request never becomes arbitrary tool code, a filesystem path, or a connector call.
// Commands also make every capability accessible without depending on intent classification.
export function chatRequest(text, workflows = []) {
  const clean = String(text || '').replace(/@\w+/g, '').trim();
  const command = clean.match(/^\/(image|audio|music|video|3d|vision)\s+([\s\S]+)$/i);
  if (command) return { kind: 'create', pipeline: command[1].toLowerCase(), prompt: command[2] };
  const workflow = clean.match(/^\/workflow\s+(\S+)\s*([\s\S]*)$/i);
  if (workflow) {
    let inputs = {};
    if (workflow[2]) { try { inputs = JSON.parse(workflow[2]); } catch { throw new Error('Workflow inputs must be a JSON object.'); } }
    if (!inputs || Array.isArray(inputs) || typeof inputs !== 'object') throw new Error('Workflow inputs must be an object.');
    return { kind: 'workflow', workflowId: workflow[1], inputs };
  }
  const asking = /\b(create|make|generate|draw|paint|give|send|record|compose|render|guide|want|need|like|can you|could you|can i get|may i have|please)\b/i.test(clean);
  if (asking && /\b(meditation|meditate)\b/i.test(clean)) {
    const minutes = clean.match(/\b(\d+)\s*[- ]?\s*(?:minute|min)\b/i);
    return { kind: 'workflow', workflowId: MEDITATION_ID, inputs: { intention: clean, duration: minutes ? Number(minutes[1]) : 3, environment: 'a peaceful natural setting' } };
  }
  if (asking) {
    const media = [ ['image', /\b(image|picture|illustration|photo|drawing)\b/i], ['music', /\b(music|song|soundtrack)\b/i], ['video', /\b(video|animation|clip)\b/i], ['audio', /\b(audio|voice note|narration|speech)\b/i], ['3d', /\b(3d|three.js)\b/i] ];
    for (const [pipeline, pattern] of media) if (pattern.test(clean)) return { kind: 'create', pipeline, prompt: clean };
    const named = workflows.find(item => clean.toLowerCase().includes(item.name.toLowerCase()));
    if (named) return { kind: 'workflow', workflowId: named.id, inputs: {} };
  }
  return null;
}

export function workflowChatMode(skill) {
  if (skill.id === MEDITATION_ID) return 'meditation';
  // Other interactive workspaces need explicit input/result adapters; do not report a launch as completion.
  if (!skill.execution && !skill.chatBased && !skill.tools?.bonzai?.length && !skill.tools?.mcp?.length) return 'prompt';
  return 'interactive';
}

export async function runChatCapability(request, { agent, channel = 'local', image, referenceImage, mediaModes = {}, enabledMedia = CHAT_MEDIA, workflowIds, updateStatus } = {}, dependencies = {}) {
  const deps = { create: executeCreation, catalog: getAvailableAgentWorkflows, service: async () => (await import('../skill.service.js')).skillService, persist: persistChatArtifact, ...dependencies };
  const context = { source: 'chat', channel, agentId: agent?.id, updateStatus };
  const artifacts = [];
  let title, text = '', warnings = [];
  if (request.kind === 'create') {
    if (!CHAT_MEDIA.includes(request.pipeline) || !enabledMedia.includes(request.pipeline)) throw new Error('This media capability is not enabled for this session.');
    if (request.pipeline === 'vision' && !image) throw new Error('Attach an image to analyze it.');
    if (channel === 'x' && ['3d', 'vision'].includes(request.pipeline)) throw new Error('This output needs the local chat workspace. X cannot attach a 3D project or accept a private local image.');
    updateStatus?.(`Creating ${request.pipeline}…`);
    const identityImage = request.pipeline === 'image' && referenceImage;
    const output = await deps.create({
      type: 'produce', pipeline: request.pipeline,
      prompt: identityImage ? 'If depicting the companion, preserve the reference face and identity; clothing and setting may change. ' + request.prompt : request.prompt,
      ...(mediaModes[request.pipeline] && { mode: mediaModes[request.pipeline] }),
      ...(request.pipeline === 'audio' && { mode: 'turbo' }),
      ...(identityImage && { mode: 'turbo_edit' }),
      params: identityImage ? { image_base64: referenceImage }
        : image && ['vision', 'video'].includes(request.pipeline) ? { image_base64: image } : {},
    }, context);
    title = `${request.pipeline === '3d' ? '3D' : request.pipeline} creation`;
    artifacts.push(await deps.persist(output));
  } else {
    const catalog = await deps.catalog();
    const skill = catalog.find(item => item.id === request.workflowId);
    const assigned = getAgentWorkflowIds(agent, catalog);
    if (!skill || !assigned.includes(skill.id) || (workflowIds && !workflowIds.includes(skill.id))) throw new Error('This workflow is unavailable or not enabled for this session.');
    const mode = workflowChatMode(skill);
    if (mode === 'interactive') throw new Error(`${skill.name} needs its interactive workspace. It has not been run.`);
    if (mode === 'meditation' && !enabledMedia.includes('audio')) throw new Error('Enable audio for this session to receive a meditation.');
    title = skill.name;
    const service = await deps.service();
    const validation = service.validateSkillInputs(skill, request.inputs || {});
    if (!validation.valid) throw new Error(validation.errors.join('; '));
    const result = await service.executeSkill(skill.id, validation.normalizedInputs, { ...context, includeImage: enabledMedia.includes('image') });
    if (!result.success || result.result?.success === false) throw new Error(result.error || result.result?.error || 'Workflow did not produce its required result.');
    if (mode === 'meditation') {
      const meditation = result.result?.meditation;
      if (!meditation?.narration) throw new Error('Narration failed; a playable meditation was not produced.');
      title = meditation.title || title;
      text = meditation.script;
      warnings = result.result.warnings || [];
      for (const output of result.result.artifacts || []) artifacts.push(await deps.persist(output));
      if (!artifacts.some(item => item.kind === 'audio')) throw new Error('The meditation audio could not be saved.');
    } else {
      // Prompt-only skills return prepared prompts, not completed results.
      const prepared = service.prepareSkillExecution(skill.id, validation.normalizedInputs);
      artifacts.push(await deps.persist(await deps.create({ type: 'produce', pipeline: 'text', prompt: prepared.taskPrompt }, { ...context, instructions: prepared.systemPrompt })));
    }
  }
  return { version: 1, title, text, artifacts, warnings, workflowId: request.workflowId || null, createdAt: Date.now() };
}

export async function persistChatArtifact(output) {
  const kind = output.pipeline === 'music' ? 'audio' : output.pipeline;
  if (output.meta?.payloadEncoding === 'text') return { kind, text: String(output.payload), mime: kind === '3d' ? 'text/javascript' : 'text/plain', name: kind === '3d' ? 'scene.js' : 'result.txt' };
  const api = window.electronAPI?.db?.blobs;
  if (!api) throw new Error('Saving chat media requires the desktop app.');
  const mime = String(output.payload).match(/^data:([^;]+);base64,/)?.[1] || ({ image: 'image/png', audio: 'audio/wav', video: 'video/mp4' })[kind];
  if (!mime) throw new Error('Unsupported media result.');
  const ext = ({ 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/png': 'png', 'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'video/mp4': 'mp4' })[mime];
  if (!ext) throw new Error('Unsupported media format.');
  const blob = output.meta?.payloadEncoding === 'path'
    ? await api.writeFromPath(output.payload, ext, { source: 'chat-result', mimeType: mime })
    : await api.write(output.payload, ext, { source: 'chat-result', mimeType: mime });
  if (!blob?.id) throw new Error('The generated media could not be saved.');
  return { kind, blobId: blob.id, ext, mime, name: `${kind}.${ext}` };
}

export async function chatArtifactUrl(artifact) {
  if (artifact.blobId) return window.electronAPI.db.blobs.url(artifact.blobId, artifact.ext, artifact.mime);
  return `data:${artifact.mime || 'text/plain'};charset=utf-8,${encodeURIComponent(artifact.text || '')}`;
}
