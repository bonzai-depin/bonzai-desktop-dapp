// Immutable workloads. Change SUITE_VERSION whenever inputs or execution semantics change.
export const SUITE_VERSION = 'bonzai-standard-1';
const imagePrompt = 'A small red-roofed wooden house in a green meadow, one round sun, clear daylight, wide composition, clean detail.';
const motionPrompt = 'Locked camera. Grass moves gently in the breeze around the wooden house. Preserve the house, roof and background.';
const llm = { temperature: 0, maxTokens: 256, seed: 42, enableThinking: false };
export const scenarios = [
  { id: 'text-explain', group: 'Text', label: 'Text · explanation', pipeline: 'llm/chat', kind: 'text',
    params: { ...llm, messages: [{ role: 'user', content: 'Explain how a heat pump transfers heat in exactly six short paragraphs. Use simple English and no headings.' }] } },
  { id: 'text-extract', group: 'Text', label: 'Text · structured extraction', pipeline: 'llm/chat', kind: 'text',
    params: { ...llm, messages: [{ role: 'user', content: 'Return only JSON with customer, equipment, temperature_c, urgency. Note: The customer is Acme Foods. Cold room CR-04 reached 12 degrees Celsius at 02:15. Frozen stock is at risk. Dispatch is urgent.' }] } },
  { id: '3d-lantern', group: '3D', label: '3D · lantern code + GLB', pipeline: '3d/object', kind: '3d',
    detail: 'Fixed one-pass code generation and isolated GLB export; not the interactive repair loop.',
    params: { ...llm, maxTokens: 2048, messages: [{ role: 'user', content: 'Return only JavaScript, no markdown. Export default function({THREE,scene}) returning a THREE.Group added to scene. Construct a recognizable emergency lantern with a short metal base and cap, transparent glass cylindrical enclosure, thin outer metal bars, glowing bulb inside, carrying handle attached to the cap. Use only built-in THREE primitives and materials, no imports, textures, network, timers or external helpers. Every mesh must have geometry and material. Center it at the origin.' }] } },
  { id: 'image-qwen-21', group: 'Image', label: 'Image · Qwen Image 2.1 512²', pipeline: '/image/standard', plan: 'image_standard', kind: 'image',
    params: { prompt: imagePrompt, width: 512, height: 512, steps: 25, guidance_scale: 4, seed: 42, use_lora: true } },
  { id: 'image-qwen-21-turbo', group: 'Image', label: 'Image · Qwen Image 2.1 Turbo 512²', pipeline: '/image/turbo', plan: 'image_turbo', kind: 'image',
    params: { prompt: imagePrompt, width: 512, height: 512, steps: 8, guidance_scale: 1, seed: 42, use_lora: true } },
  { id: 'image-z', group: 'Image', label: 'Image · Z-Image 512²', pipeline: '/image/quality', plan: 'image_quality', kind: 'image',
    params: { prompt: imagePrompt, negative_prompt: 'blurry, watermark', width: 512, height: 512, steps: 9, seed: 42 } },
  { id: 'music', group: 'Audio', label: 'Music · 10 seconds', pipeline: '/audio/music', plan: 'music', kind: 'audio',
    params: { prompt: 'Calm instrumental piano, gentle sustained notes, no vocals.', instrumental: true, lyrics: '', duration: 10, steps: 8, seed: 42, bpm: 80, shift: 3, keyscale: 'C major', time_signature: '4/4' } },
  { id: 'vision', group: 'Analysis', label: 'Vision · describe fixed image', pipeline: '/vision/analyze', plan: 'vision', kind: 'analysis', fixture: true,
    params: { prompt: 'Describe the objects and their colors in this image in three short sentences.', max_tokens: 128 } },
  { id: 'ocr', group: 'Analysis', label: 'OCR · read fixed sign', pipeline: '/vision/ocr', plan: 'ocr', kind: 'analysis', fixture: true,
    params: { mode: 'text', max_tokens: 128 } },
  { id: 'forecast', group: 'Analysis', label: 'Forecast · 64 observations', pipeline: '/forecast', plan: 'forecast', kind: 'forecast',
    params: { series: Array.from({length:64},(_,i)=> 20 + i % 8 + Math.floor(i/8)), horizon: 16, freq: 1 } },
  { id: 'video-ltx', group: 'Video', label: 'Video · LTX 49 frames', pipeline: '/video', plan: 'video_fast', kind: 'video',
    params: { mode: 't2v', prompt: motionPrompt, negative_prompt: 'blur, distorted geometry', width: 512, height: 320, frames: 49, frame_rate: 24, steps: 8, guidance_scale: 1, seed: 42 } },
  { id: 'video-wan', group: 'Video', label: 'Video · Wan 49 frames', pipeline: '/video/quality', plan: 'video_quality', kind: 'video', fixture: true,
    params: { prompt: motionPrompt, negative_prompt: 'blur, distorted geometry', width: 512, height: 320, num_frames: 49, fps: 24, num_inference_steps: 4, guidance_scale: 1, seed: 42, use_general: false, use_animation: false, use_extra: false } },
  { id: 'video-h3', group: 'Video', label: 'Video · H3 124 frames', pipeline: '/video/sota', plan: 'video_sota', kind: 'video', fixture: true, license: true,
    params: { prompt: motionPrompt, width: 512, height: 320, num_frames: 124, num_inference_steps: 4, guidance_scale: 1, sampler: 'euler', schedule: 'simple', seed: 42 } },
];
export const suiteGroups = [...new Set(scenarios.map(s => s.group))];
export function selectScenarios(categories, ids) {
  if (!Array.isArray(categories) || !categories.length || categories.some(c => !suiteGroups.includes(c))) throw new Error('Choose at least one valid category.');
  if (ids !== undefined && (!Array.isArray(ids) || !ids.length || ids.some(id => !scenarios.some(s => s.id === id && categories.includes(s.group))))) throw new Error('Choose valid scenarios in the selected categories.');
  return scenarios.filter(s => categories.includes(s.group) && (!ids || ids.includes(s.id)));
}
