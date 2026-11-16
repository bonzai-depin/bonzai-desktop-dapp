/** Normalize activity requests into the same inspector contract as saved generations. */
export function activityGeneration(op) {
  const m = op.metadata || {};
  return { ...m, id: op.id, kind: ({chat:'text',game:'3d'})[op.mode] || op.mode,
    prompt: m.prompt || m.text || m.caption || m.lyrics || op.prompt,
    model: m.model || m.modelId, status: op.status, errorMessage: op.error,
    negativePrompt: m.negativePrompt ?? m.negative_prompt,
    guidanceScale: m.guidanceScale ?? m.guidance_scale,
    maxTokens: m.maxTokens ?? m.max_tokens,
    ts: op.startedAt || op.createdAt, networkMode: op.location,
    extra: Object.fromEntries(Object.entries(m).filter(([key,value]) =>
      ['duration','bpm','fps','sampler','scheduler','pipeline','lyrics'].includes(key) && value != null)) };
}
