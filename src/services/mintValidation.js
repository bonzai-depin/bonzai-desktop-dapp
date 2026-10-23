// Shared preflight for the dialog and service. Unknown rights never become permission.
export function mintLicenseStatus(generation = {}, catalog = {}) {
  const list=value=>Array.isArray(value)?value:value?[value]:[];
  const sources = [generation, generation.modelProvenance, ...list(generation.sources), ...list(generation.loras)].filter(Boolean);
  const identity = String(generation.model || '').toLowerCase();
  const aliases={'qwen-image-2.1':'image_standard','qwen-image-2.1-turbo':'image_turbo','z-image-turbo':'image_quality','kokoro':'audio_turbo','chatterbox-multilingual-v3':'audio_quality','ace-step-v1.5-xl-turbo-diffusers':'music_fast'};
  const alias=aliases[identity];
  const descriptors = Object.entries(catalog).filter(([key, model]) =>
    key === generation.pipeline || key === alias || [key, model.name, model.filename, model.repo].some(value => value && String(value).toLowerCase() === identity));
  for (const [, descriptor] of descriptors) sources.push(descriptor);
  if (identity === 'sdxl') sources.push({license:'CreativeML Open RAIL++-M'});
  // Legacy records used this alias before license snapshots were persisted.
  if (/flux[-. ]?(?:2[-. ]?)?klein|flux.2-klein-9b/i.test(identity)) sources.push({license:'flux-non-commercial-license'});
  const licenses = sources.map(s => s.license || s.licenseName || s.license_id).filter(Boolean).map(String);
  if (sources.some(s=>s.commercialAllowed === false || s.permissions?.commercialAllowed === false) || licenses.some(l=>/non.?commercial|cc.?by.?nc|research.?only/i.test(l))) {
    return {allowed:false, licenses, reason:'This generation uses a non-commercial license and cannot be minted.'};
  }
  if (list(generation.loras).some(l=>typeof l!=='object' || (!l.license && l.commercialAllowed!==true))) return {allowed:false,licenses,reason:'Commercial rights for the applied LoRA could not be verified.'};
  if (list(generation.sources).some(s=>!s || (!s.license && s.commercialAllowed!==true))) return {allowed:false,licenses,reason:'Commercial rights for source media could not be verified.'};
  if(generation.hasReferenceImage && !list(generation.sources).length)return {allowed:false,licenses,reason:'Commercial rights for the reference image could not be verified.'};
  const explicit = sources.some(s=>s.commercialAllowed === true);
  const known = licenses.length && licenses.every(l=>/^(apache[- ]?2(?:\.0)?|mit|bsd(?:-[23]-clause)?|cc0(?:-1.0)?|cc-by(?:-4.0)?|creativeml open rail\+\+-m)$/i.test(l));
  if (!explicit && !known) return {allowed:false, licenses, reason:'Commercial rights could not be verified for this generation. Check its model and source licenses before minting.'};
  return {allowed:true,licenses,reason:''};
}

export function mintMediaBytes(content, contentType) {
  if (content instanceof Uint8Array) {
    if (!content.length) throw new Error('The selected media is empty.');
    return content;
  }
  if (typeof content !== 'string' || !content.trim()) throw new Error('The selected media is unavailable.');
  if (/^(text\/|application\/(json|javascript))/.test(contentType)) return new TextEncoder().encode(content);
  let encoded=content;
  if (content.startsWith('data:')) {
    const match=content.match(/^data:([^;,]+);base64,([\s\S]+)$/);
    if(!match || match[1]!==contentType) throw new Error('The selected media format does not match its file.');
    encoded=match[2];
  }
  encoded=encoded.replace(/\s/g,'');
  if (!encoded || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded) || encoded.length%4===1) throw new Error('The selected media could not be decoded. Restore the original file.');
  const bytes=Uint8Array.from(atob(encoded), c=>c.charCodeAt(0));
  if(!bytes.length) throw new Error('The selected media is empty.');
  return bytes;
}

export function recordedMintGeneration(record = {}, extra = {}) {
  const data=record.answer?.data || {};
  const parameters={...(record.parameters || record.params || {})};
  for(const key of ['width','height','steps','seed','guidanceScale','duration','fps','sampleRate','quality','mode']) {
    const value=record[key] ?? data[key];
    if(value!==undefined && value!==null) parameters[key]=value;
  }
  return {...extra, model:record.model || extra.model || '', pipeline:record.pipeline || '',
    timestamp:record.timestamp, elapsedMs:record.elapsedMs, parameters,
    license:record.license || data.license, commercialAllowed:record.commercialAllowed ?? data.commercialAllowed,
    modelProvenance:record.modelProvenance || null, sources:record.sources || [], loras:record.loras || data.loras || (record.lora ? [record.lora] : []),
    metadata:record.metadata || data.metadata || {},
    outputText:record.outputText || data.text || record.answer?.text || '',
    negativePrompt:record.negativePrompt || record.negative_prompt || data.negative_prompt || '',
    hasReferenceImage:record.hasReferenceImage === true || record.mode === 'i2v',
    songName:record.songName || record.songTitle || data.song_title || null,
    musicParams:record.musicParams || null, voiceGender:record.voiceGender || null, language:record.language || null,
    ...Object.fromEntries(Object.entries(extra).filter(([k])=>!['model','modelProvenance','parameters'].includes(k)))};
}

export function validateMintFormat(inferenceType, contentType) {
 const formats={image:/^image\/(png|jpeg|webp|gif|avif)$/,audio:/^audio\/(mpeg|wav|ogg|flac|mp4|webm|x-wav)$/,video:/^video\/(mp4|webm|quicktime)$/,text:/^text\//,object:/^application\/javascript$/,training:/^application\/json$/};
 if(!formats[inferenceType]?.test(contentType)) throw new Error('The selected media type and file format do not match.');
}

// History may retain a local blob-protocol URL instead of inline base64.
// Resolve it before both preview and publication so they use identical bytes.
export async function resolveMintMediaBytes(content, contentType) {
  if (/^(image|audio|video)\//.test(contentType) && typeof content === 'string' && /^(?:bonzai-blob:|blob:|https?:|file:)/i.test(content)) {
    let bytes;
    if (content.startsWith('file:') && globalThis.window?.electronAPI?.readFileAsBase64) {
      const path = decodeURIComponent(new URL(content).pathname);
      bytes = mintMediaBytes(await window.electronAPI.readFileAsBase64(path), contentType);
    } else {
      const response = await fetch(content, {signal: AbortSignal.timeout(15000)});
      if (!response.ok) throw new Error('This saved file is unavailable. Reopen it from generation history and try again.');
      bytes = new Uint8Array(await response.arrayBuffer());
    }
    if (!bytes.length) throw new Error('The selected media is empty.');
    return bytes;
  }
  return mintMediaBytes(content, contentType);
}
