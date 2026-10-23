/** Dedicated media APIs: never infer output capabilities from accepted inputs. */
export function mediaCategory(pipeline) {
  if (/^image_/.test(pipeline)) return 'image';
  if (/^video_/.test(pipeline)) return 'video';
  if (/^audio_/.test(pipeline)) return 'speech';
  if (['vision', 'vision_caption', 'ocr'].includes(pipeline)) return 'vision';
  return null;
}

export function createOpenRouterMedia({ request, status, models, store, saveMedia, inspectImage, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)) }) {
  const cache = new Map();
  async function catalogue(category) {
    if (category === 'vision') return (await models()).filter(m => m.input.includes('image'));
    if (!['image', 'video', 'speech'].includes(category)) throw new Error('Unsupported media category.');
    const cached = cache.get(category);
    if (cached && Date.now() - cached.at < 300000) return cached.data;
    const path = category === 'image' ? '/images/models' : category === 'video' ? '/videos/models' : '/models?output_modalities=speech';
    const response = await (await request(path)).json();
    const data = (response.data || []).map(m => ({ ...m, input: m.architecture?.input_modalities || ['text'] }));
    cache.set(category, { at: Date.now(), data });
    return data;
  }
  async function validateSelections(selections = {}) {
    const clean = {};
    for (const category of ['image', 'speech', 'video', 'vision']) {
      const id = selections[category];
      if (!id) continue;
      if (!(await catalogue(category)).some(m => m.id === id)) throw new Error(`Choose an available ${category} model.`);
      clean[category] = id;
    }
    return clean;
  }
  function enabled() {
    const s = status();
    if (!s.active || !s.consent) throw new Error('OpenRouter is not enabled for Consumer Mode.');
    return s;
  }
  function imagePart(value) {
    if (typeof value !== 'string' || value.length > 40 * 1024 * 1024) throw new Error('Choose an image smaller than 30 MB.');
    // No arbitrary URLs or local paths are read on behalf of renderer requests.
    const mime = value.startsWith('/9j/') ? 'image/jpeg' : value.startsWith('UklGR') ? 'image/webp' : 'image/png';
    const url = value.startsWith('data:') ? value : `data:${mime};base64,${value}`;
    if (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=\s]+$/.test(url)) throw new Error('Choose a PNG, JPEG or WebP image.');
    return { type: 'image_url', image_url: { url } };
  }
  async function boundedBytes(response, maximum = 256 * 1024 * 1024) {
    if (Number(response.headers.get('content-length')) > maximum) throw new Error('The generated media exceeds the download limit.');
    const reader = response.body.getReader(); const parts = []; let size = 0;
    try {
      while (true) {
        const { value, done } = await reader.read(); if (done) break;
        size += value.byteLength;
        if (size > maximum) throw new Error('The generated media exceeds the download limit.');
        parts.push(Buffer.from(value));
      }
    } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
    if (!size) throw new Error('OpenRouter returned empty media.');
    return Buffer.concat(parts);
  }
  function record(metadata) {
    try { store.set('openrouter.usage', [...store.get('openrouter.usage', []), { at: Date.now(), ...metadata }].slice(-1000)); } catch { /* Retain the result even if accounting storage fails. */ }
  }
  const jobs = () => store.get('openrouter.videoJobs', []);
  function putJob(job) { store.set('openrouter.videoJobs', [...jobs().filter(j => j.id !== job.id), job].slice(-100)); }
  const runningJobs = new Map();
  async function pollVideo(job) {
    const started = Date.now();
    let result;
    while (Date.now() - started < 30 * 60 * 1000) {
      enabled();
      result = await (await request(`/videos/${encodeURIComponent(job.id)}`)).json();
      if (result.status === 'completed') break;
      if (['failed', 'cancelled'].includes(result.status)) { putJob({ ...job, status: result.status }); throw new Error('OpenRouter could not generate this video.'); }
      await sleep(5000);
    }
    if (result?.status !== 'completed') throw new Error('Video is still processing. Resume it in OpenRouter settings; do not submit it again.');
    const response = await request(`/videos/${encodeURIComponent(job.id)}/content`, { signal: AbortSignal.timeout(300000) });
    if (!response.headers.get('content-type')?.startsWith('video/')) throw new Error('OpenRouter returned an invalid video download. Resume the job to retry downloading.');
    const saved = await saveMedia(await boundedBytes(response), 'mp4', 'video/mp4');
    const metadata = { source: 'openrouter', model: job.model, category: 'video', jobId: job.id, elapsedMs: Date.now() - job.started, cost: result.usage?.cost ?? null, usage: result.usage || null };
    const output = { video_path: saved.path, video_url: saved.url, duration: saved.duration || job.duration, model: job.model, metadata, elapsed_ms: metadata.elapsedMs };
    putJob({ ...job, status: 'completed', result: output }); record(metadata);
    return output;
  }
  function finishVideo(job) {
    if (runningJobs.has(job.id)) return runningJobs.get(job.id);
    const pending = pollVideo(job).finally(() => runningJobs.delete(job.id));
    runningJobs.set(job.id, pending); return pending;
  }
  async function generate(pipeline, params = {}) {
    const settings = enabled(); const category = mediaCategory(pipeline);
    const modelId = settings.mediaModels?.[category];
    if (!category || !modelId) throw new Error(`Select an OpenRouter ${category || pipeline} model in Network settings, or select a local inference source.`);
    const model = (await catalogue(category)).find(m => m.id === modelId);
    if (!model) throw new Error('The selected media model is unavailable. Choose another model in Network settings.');
    enabled();
    const prompt = String(params.text || params.prompt || '').trim();
    if (!prompt && category !== 'vision') throw new Error('Enter a prompt before generating.');
    const started = Date.now();
    const post = async (path, body) => request(path, { method: 'POST', body: JSON.stringify(body), signal: AbortSignal.timeout(600000) });
    let output, usage;
    if (category === 'image') {
      const body = { model: modelId, prompt, n: 1 };
      if (params.width && params.height) body.size = `${params.width}x${params.height}`;
      if (params.image_base64) {
        if (!model.input.includes('image')) throw new Error('This image model does not support reference images.');
        body.input_references = [imagePart(params.image_base64)];
      }
      const result = await (await post('/images', body)).json();
      const image = result.data?.[0];
      if (!image?.b64_json || !/^image\/(png|jpeg|webp)$/.test(image.media_type || '')) throw new Error('The selected model did not return a supported raster image.');
      if (image.b64_json.length > 64 * 1024 * 1024) throw new Error('The generated image exceeds the download limit.');
      const dimensions = inspectImage?.(Buffer.from(image.b64_json, 'base64')) || {};
      if (inspectImage && (!dimensions.width || !dimensions.height)) throw new Error('OpenRouter returned an unreadable image.');
      output = { image: image.b64_json, image_base64: image.b64_json, mime_type: image.media_type, ...dimensions }; usage = result.usage;
    } else if (category === 'speech') {
      const voice = settings.speechVoice;
      if (!voice && !params.ref_audio_base64) throw new Error('Choose a voice in OpenRouter settings.');
      const body = { model: modelId, input: prompt, ...(voice ? { voice } : {}), response_format: 'mp3', ...(params.instruct ? { instructions: params.instruct } : {}) };
      if (params.ref_audio_base64) {
        if (typeof params.ref_audio_base64 !== 'string' || params.ref_audio_base64.length > 20 * 1024 * 1024) throw new Error('Choose a voice reference smaller than 15 MB.');
        delete body.voice;
        body.input_references = [{ type: 'input_audio', input_audio: { data: params.ref_audio_base64 } }];
        if (params.ref_text || params.reference_text) body.input_references.push({ type: 'text', text: String(params.ref_text || params.reference_text).slice(0, 10000) });
      }
      const response = await post('/audio/speech', body);
      if (!response.headers.get('content-type')?.startsWith('audio/')) throw new Error('OpenRouter did not return playable speech.');
      const saved = await saveMedia(await boundedBytes(response, 64 * 1024 * 1024), 'mp3', 'audio/mpeg');
      output = { audio_path: saved.path, audio_url: saved.url, audio_path_mp3: saved.path, duration_seconds: saved.duration };
    } else if (category === 'vision') {
      const image = params.image_base64 || params.image;
      if (!image) throw new Error('Choose an image to analyze.');
      const result = await (await post('/chat/completions', { model: modelId, messages: [{ role: 'user', content: [{ type: 'text', text: prompt || (pipeline === 'ocr' ? 'Extract the text from this image.' : 'Describe this image.') }, imagePart(image)] }], max_tokens: settings.maxTokens })).json();
      const text = result.choices?.[0]?.message?.content;
      if (!text) throw new Error('OpenRouter returned no image analysis.');
      output = { text, caption: text, response: text }; usage = result.usage;
    } else {
      const duration = Number(params.duration || params.duration_seconds || Math.round(((params.num_frames || params.frames || 121) - 1) / (params.fps || params.frame_rate || 24)));
      if (!model.supported_durations?.includes(duration)) throw new Error(`This video model supports ${model.supported_durations?.join(', ') || 'provider-defined'} second clips. Choose a supported duration.`);
      const gcd = (a, b) => b ? gcd(b, a % b) : a;
      const w = Number(params.width || 1280), h = Number(params.height || 720), divisor = gcd(w, h);
      const ratio = params.aspect_ratio || `${w / divisor}:${h / divisor}`;
      if (!model.supported_aspect_ratios?.includes(ratio)) throw new Error(`This video model supports these aspect ratios: ${(model.supported_aspect_ratios || []).join(', ')}.`);
      const body = { model: modelId, prompt, duration, aspect_ratio: ratio, generate_audio: Boolean(model.generate_audio) };
      if (params.resolution) {
        if (!model.supported_resolutions?.includes(params.resolution)) throw new Error('Choose a supported video resolution.');
        body.resolution = params.resolution;
      }
      if (params.image_base64) {
        if (!model.supported_frame_images?.includes('first_frame')) throw new Error('This video model does not support image-to-video.');
        body.frame_images = [{ ...imagePart(params.image_base64), frame_type: 'first_frame' }];
      }
      const job = await (await post('/videos', body)).json();
      if (!job.id) throw new Error('OpenRouter did not return a video job ID. Check account activity before retrying.');
      const saved = { id: job.id, model: modelId, started, duration, status: 'pending' };
      putJob(saved);
      return finishVideo(saved);
    }
    const metadata = { source: 'openrouter', model: modelId, category, elapsedMs: Date.now() - started, cost: usage?.cost ?? null, usage: usage || null };
    record(metadata);
    return { ...output, model: modelId, metadata, elapsed_ms: metadata.elapsedMs };
  }
  async function resume(id) {
    enabled(); const job = jobs().find(j => j.id === id);
    if (!job) throw new Error('Video job not found on this device.');
    if (job.result) return job.result;
    return finishVideo(job);
  }
  return { catalogue, validateSelections, generate, jobs, resume };
}
