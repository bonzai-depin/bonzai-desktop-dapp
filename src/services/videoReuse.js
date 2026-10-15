// Keep original generation inputs separate from enhanced output metadata.
export function videoReuseSettings(inference = {}) {
  const data = inference.answer?.data || {};
  const saved = inference.generationSettings || data.generationSettings || {};
  const request = saved.request || {};
  const engine = saved.engine || data.engine ||
    (/wan/i.test(inference.model || inference.pipeline || '') ? 'quality' :
      /minimax|sota/i.test(inference.model || inference.pipeline || '') ? 'sota' : 'fast');
  const image = request.image_base64 ?? data.image_base64 ?? inference.image_base64 ?? '';
  // Restore only inference options, never transport flags or license consent.
  const sampling = {};
  for (const key of ['seed', 'steps', 'num_inference_steps', 'guidance_scale']) {
    const value = request[key];
    if (typeof value === 'number' && Number.isFinite(value)) sampling[key] = value;
  }
  if (typeof request.negative_prompt === 'string') sampling.negative_prompt = request.negative_prompt;
  if (['euler_ancestral', 'euler'].includes(request.sampler)) sampling.sampler = request.sampler;
  return {
    sampling,
    prompt: request.prompt ?? inference.question ?? data.prompt ?? '',
    engine,
    mode: engine === 'quality' ? 'i2v' : saved.mode || inference.mode || data.mode || (image ? 'i2v' : 't2v'),
    image: String(image).replace(/^data:image\/[^;]+;base64,/, ''),
    imageName: saved.imageName || '',
    quality: saved.quality || inference.quality || data.quality ||
      (engine === 'quality' ? '640x480' : engine === 'sota' ? '960x544' : '480p'),
    duration: saved.duration ?? inference.duration ?? data.duration ?? 5,
    fps: request.fps ?? request.frame_rate ?? inference.fps ?? data.fps ?? (engine === 'quality' ? 16 : 12),
    autoEnhance: saved.autoEnhance ?? false,
  };
}
