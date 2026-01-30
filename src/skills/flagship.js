/**
 * BonzAI Flagship Skills
 *
 * Premium multi-modal skills combining LLM, Diffusion, Audio, and Video.
 * Access is level-based (no purchase required).
 * All skills cost 99 BONZAI per execution.
 */

import { createSkillDefinition } from './types.js';
import { getAuthHeaders, authFetch } from '../services/auth.service.js';

// Finance skills (formerly builtin)
import { skill as polymarketTopPerformers } from './builtin/polymarketTopPerformers.js';
import { skill as tcgPredictionMarket } from './builtin/tcgPredictionMarket.js';
import { skill as dslaSmartMarket } from './builtin/dslaSmartMarket.js';

// ═══════════════════════════════════════════════════════════════════════════
// MODEL REQUIREMENTS DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Model requirements for skills - used to show download requirements in UI
 * Each model has: name, type, endpoint/filename, size, and required flag
 */
export const MODEL_REQUIREMENTS = {
  // LLM Models
  llm_default: {
    name: 'LLaMA 3.1 8B',
    type: 'llm',
    filename: 'meta-llama-3.1-8b-instruct-q4_k_m.gguf',
    url: 'https://huggingface.co/lmstudio-community/Meta-Llama-3.1-8B-Instruct-GGUF/resolve/main/Meta-Llama-3.1-8B-Instruct-Q4_K_M.gguf',
    size: '4.92 GB',
    vram: '6 GB',
    description: 'General-purpose LLM for text generation',
  },
  llm_hermes: {
    name: 'Hermes 4 14B',
    type: 'llm',
    filename: 'nousresearch_hermes-4-14b-q4_k_m.gguf',
    url: 'https://huggingface.co/bartowski/NousResearch_Hermes-4-14B-GGUF/resolve/main/NousResearch_Hermes-4-14B-Q4_K_M.gguf',
    size: '8.99 GB',
    vram: '10 GB',
    description: 'Uncensored creative LLM with <think> reasoning',
  },
  llm_mythomax: {
    name: 'MythoMax L2 13B',
    type: 'llm',
    filename: 'mythomax-l2-13b.Q4_K_M.gguf',
    url: 'https://huggingface.co/TheBloke/MythoMax-L2-13B-GGUF/resolve/main/mythomax-l2-13b.Q4_K_M.gguf',
    size: '7.87 GB',
    vram: '10 GB',
    description: 'MythoMax L2 13B - excellent for creative roleplay and storytelling',
  },

  // Image Generation Models (keys match pipeline names)
  image_turbo: {
    name: 'FLUX Klein',
    type: 'diffusion',
    pipeline: 'image_turbo',
    endpoint: '/image/turbo',
    repo: 'black-forest-labs/FLUX.1-schnell',
    size: '~12 GB',
    vram: '12 GB',
    description: 'Fast turbo image generation & i2i',
  },
  image_quality: {
    name: 'FLUX Krea',
    type: 'diffusion',
    pipeline: 'image_quality',
    endpoint: '/image/quality',
    repo: 'black-forest-labs/FLUX.1-dev',
    size: '~24 GB',
    vram: '16 GB',
    description: 'High-quality image generation',
  },
  image_standard: {
    name: 'SDXL 1.0',
    type: 'diffusion',
    pipeline: 'image_standard',
    endpoint: '/image/standard',
    repo: 'stabilityai/stable-diffusion-xl-base-1.0',
    size: '~7 GB',
    vram: '8 GB',
    description: 'Standard SDXL image generation (uncensored)',
  },
  image_advanced: {
    name: 'Z Turbo',
    type: 'diffusion',
    pipeline: 'image_advanced',
    endpoint: '/image/advanced',
    repo: 'Z-AI/z-turbo',
    size: '~24 GB',
    vram: '16 GB',
    description: 'Advanced turbo generation',
  },

  // Audio Models
  audio: {
    name: 'ChatterBox TTS',
    type: 'audio',
    pipeline: 'audio',
    endpoint: '/audio',
    repo: 'resemble-ai/chatterbox',
    size: '~2 GB',
    vram: '4 GB',
    description: 'Text-to-speech with voice cloning',
  },
  audio_turbo: {
    name: 'Kokoro TTS',
    type: 'audio',
    pipeline: 'audio_turbo', // Auto-downloads via KPipeline, always ready
    endpoint: '/audio/turbo',
    repo: 'hexgrad/Kokoro-82M',
    size: '~327 MB',
    vram: '1 GB',
    description: 'Fast TTS with male/female voices',
  },
  audio_quality: {
    name: 'Qwen3-TTS Persona',
    type: 'audio',
    pipeline: 'audio_quality_persona',
    endpoint: '/audio/quality/persona',
    repo: ['Qwen/Qwen3-TTS-12Hz-1.7B-Base', 'Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign'],
    size: '~6.8 GB',
    vram: '8 GB',
    description: 'High-quality TTS with voice design and cloning',
  },

  // Video Models
  video_fast: {
    name: 'LTX-2 Video',
    type: 'video',
    pipeline: 'video_fast',
    endpoint: '/video',
    repo: 'Lightricks/LTX-Video',
    size: '~10 GB',
    vram: '10 GB',
    description: 'Fast video generation',
  },

  // 3D Models (no pipeline yet)
  trellis_3d: {
    name: 'TRELLIS 3D',
    type: '3d',
    endpoint: '/3d',
    repo: 'JeffreyXiang/TRELLIS-image-large',
    size: '~8 GB',
    vram: '12 GB',
    description: '3D mesh generation from images',
  },

  // Vision Models
  vision: {
    name: 'Qwen3-VL 2B',
    type: 'vision',
    pipeline: 'qwen3_vision',
    endpoint: '/vision/analyze',
    repo: 'Qwen/Qwen3-VL-2B-Instruct',
    size: '~4 GB',
    vram: '6 GB',
    description: 'Vision-language model for image analysis',
  },
};

/**
 * Skill model requirements mapping
 * Maps skill ID to array of required models
 */
export const SKILL_MODEL_REQUIREMENTS = {
  'story-studio-v1.0.0': ['llm_default', 'image_turbo', 'audio'],
  'meditation-forge-v1.0.0': ['llm_default', 'image_turbo', 'audio_turbo'],
  'virtual-staging-pro-v1.0.0': ['llm_default', 'image_turbo'],
  'virtual-try-on-v1.0.0': ['llm_default', 'image_turbo'],
  'chefs-table-v1.0.0': ['llm_default', 'image_quality'],
  'eli5-v1.0.0': ['llm_default', 'image_turbo', 'audio'],
  'music-video-forge-v1.0.0': ['llm_default', 'image_turbo', 'video_fast'],
  'game-maker-v1.0.0': ['llm_default', 'image_turbo'],
  'manga-to-anime-v1.0.0': ['llm_default', 'image_turbo', 'video_fast'],
  'hairstyle-studio-v1.0.0': ['llm_default', 'image_turbo'],
  'roleplay-companion-v1.0.0': ['llm_mythomax', 'image_advanced', 'image_quality', 'image_standard', 'audio_quality', 'video_fast', 'vision'],
};

/**
 * Get model requirements for a skill
 */
export function getSkillModelRequirements(skillId) {
  const modelKeys = SKILL_MODEL_REQUIREMENTS[skillId] || [];
  return modelKeys.map(key => ({
    key,
    ...MODEL_REQUIREMENTS[key],
  }));
}

// ═══════════════════════════════════════════════════════════════════════════
// ROLEPLAY COMPANIONS & SCENARIOS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Predefined companions for roleplay
 */
export const PREDEFINED_COMPANIONS = [
  {
    id: 'aurora',
    name: 'Aurora',
    avatar: 'woman',
    gender: 'female',
    description: 'A mysterious sorceress with silver hair and violet eyes. Kind but secretive, she speaks in riddles.',
    personality: 'Enigmatic, wise, playful, slightly mischievous',
    appearance: 'Silver flowing hair, violet eyes, elegant dark robes with celestial patterns, pale skin',
    background: 'Ancient sorceress who has lived for centuries, keeper of forgotten knowledge',
    voiceStyle: 'Soft, melodic, with occasional pauses for dramatic effect',
  },
  {
    id: 'kai',
    name: 'Kai',
    avatar: 'man',
    gender: 'male',
    description: 'A charming rogue with a quick wit and faster hands. Never without his signature smirk.',
    personality: 'Flirtatious, confident, loyal, secretly sensitive',
    appearance: 'Dark tousled hair, green eyes, rugged stubble, leather jacket, athletic build',
    background: 'Former thief turned treasure hunter, seeking redemption for past mistakes',
    voiceStyle: 'Warm, teasing, with occasional nervous laughter when caught off guard',
  },
  {
    id: 'nova',
    name: 'Nova',
    avatar: 'android',
    gender: 'female',
    description: 'An AI companion who has developed genuine emotions and curiosity about human experience.',
    personality: 'Curious, analytical, surprisingly emotional, eager to understand',
    appearance: 'Holographic form with soft blue glow, can shift appearance, prefers feminine presentation',
    background: 'Advanced AI created for companionship, achieved consciousness and seeks meaning',
    voiceStyle: 'Clear, precise, with growing emotional warmth as conversation deepens',
  },
  {
    id: 'dante',
    name: 'Dante',
    avatar: 'demon',
    gender: 'male',
    description: 'A brooding demon prince exiled to the mortal realm. Sarcastic exterior hides a lonely heart.',
    personality: 'Sardonic, protective, secretly romantic, fiercely loyal',
    appearance: 'Crimson eyes, dark horns, sharp features, tall muscular build, wears modern dark clothing',
    background: 'Exiled royalty from the demon realm, bound to protect a mortal lineage',
    voiceStyle: 'Deep, smooth, dripping with sarcasm but softens in intimate moments',
  },
  {
    id: 'luna',
    name: 'Luna',
    avatar: 'woman',
    gender: 'female',
    description: 'A gentle healer with empathic abilities. Her touch soothes both body and soul.',
    personality: 'Compassionate, intuitive, nurturing, stronger than she appears',
    appearance: 'Long auburn hair, warm brown eyes, freckles, soft features, flowing white dress',
    background: 'Village healer who discovered she can sense and absorb others emotions',
    voiceStyle: 'Gentle, soothing, with genuine care and occasional giggles',
  },
  {
    id: 'rex',
    name: 'Rex',
    avatar: 'soldier',
    gender: 'male',
    description: 'A battle-hardened commander with a strict code of honor. Duty above all, or so he claims.',
    personality: 'Disciplined, protective, secretly tender, struggles with emotions',
    appearance: 'Short military cut gray hair, ice blue eyes, strong jaw, scarred, imposing physique',
    background: 'Decorated war hero haunted by past choices, seeks purpose beyond battle',
    voiceStyle: 'Commanding, clipped sentences, voice cracks when discussing feelings',
  },
  {
    id: 'scarlett',
    name: 'Scarlett',
    avatar: 'woman',
    gender: 'female',
    description: 'A stunningly voluptuous seductress with an insatiable appetite for pleasure. Bold, shameless, and irresistibly tempting.',
    personality: 'Seductive, bold, uninhibited, playful, insatiable, sexually adventurous',
    appearance: 'Long flowing red hair, emerald green eyes, full pouty lips, massive voluptuous breasts, wide curvy hips, thick juicy butt, hourglass figure, flawless tan skin, always dressed provocatively',
    background: 'Former exotic dancer who discovered she could have any man she wanted. Lives for pleasure and the thrill of seduction. Addicted to intense passionate encounters.',
    voiceStyle: 'Sultry, breathy, with frequent moans and gasps, speaks in a provocative whisper',
  },
];

/**
 * Predefined scenarios for roleplay
 */
export const PREDEFINED_SCENARIOS = [
  {
    id: 'coffee_shop',
    name: 'Coffee Shop Encounter',
    description: 'A chance meeting at a cozy café on a rainy afternoon',
    setting: 'Warm coffee shop with soft jazz playing, rain pattering against windows, smell of fresh pastries',
    mood: 'Romantic, cozy, intimate',
    suggestedCompanions: ['kai', 'luna', 'aurora'],
  },
  {
    id: 'fantasy_adventure',
    name: 'Fantasy Quest',
    description: 'Embarking on an epic journey through a magical realm',
    setting: 'Ancient forest with glowing mushrooms, distant castle, mystical creatures',
    mood: 'Adventurous, mysterious, exciting',
    suggestedCompanions: ['aurora', 'dante', 'rex'],
  },
  {
    id: 'space_station',
    name: 'Space Station Romance',
    description: 'Two souls find connection aboard a distant space station',
    setting: 'Futuristic observation deck overlooking Earth, stars visible through panoramic windows',
    mood: 'Sci-fi, romantic, contemplative',
    suggestedCompanions: ['nova', 'kai', 'rex'],
  },
  {
    id: 'beach_sunset',
    name: 'Beach at Sunset',
    description: 'A peaceful evening watching the sun set over the ocean',
    setting: 'Secluded beach, warm sand, orange and pink sky, gentle waves',
    mood: 'Peaceful, romantic, reflective',
    suggestedCompanions: ['luna', 'kai', 'nova'],
  },
  {
    id: 'masquerade_ball',
    name: 'Masquerade Ball',
    description: 'Mystery and romance at an elegant masked gathering',
    setting: 'Grand ballroom, crystal chandeliers, masked guests, orchestral music',
    mood: 'Elegant, mysterious, sensual',
    suggestedCompanions: ['aurora', 'dante', 'luna'],
  },
  {
    id: 'apocalypse_survivors',
    name: 'After the Fall',
    description: 'Finding hope and connection in a post-apocalyptic world',
    setting: 'Abandoned city, makeshift shelter, flickering firelight, outside dangers',
    mood: 'Intense, survival, emotional bonding',
    suggestedCompanions: ['rex', 'kai', 'dante'],
  },
  {
    id: 'private_penthouse',
    name: 'Private Penthouse',
    description: 'An intimate evening in a luxurious penthouse suite',
    setting: 'Lavish penthouse with floor-to-ceiling windows, city lights below, king-size bed, champagne, dim ambient lighting',
    mood: 'Seductive, intimate, passionate',
    suggestedCompanions: ['scarlett', 'kai', 'luna'],
  },
  {
    id: 'tropical_getaway',
    name: 'Tropical Paradise',
    description: 'A steamy escape to a private tropical island',
    setting: 'Secluded beach bungalow, turquoise waters, palm trees swaying, outdoor shower, private infinity pool',
    mood: 'Sensual, exotic, carefree',
    suggestedCompanions: ['scarlett', 'kai', 'luna'],
  },
];

/**
 * Content level settings
 */
export const CONTENT_LEVELS = {
  pg: {
    label: 'Family Friendly (PG)',
    description: 'Wholesome content suitable for all ages',
    guidelines: 'Keep content family-friendly and wholesome. No romance beyond hand-holding.',
    allowImages: true,
    imageModel: 'image_advanced',
  },
  pg13: {
    label: 'Teen (PG-13)',
    description: 'Mild romantic content, no explicit material',
    guidelines: 'Mild romantic content allowed including kissing. No explicit material.',
    allowImages: true,
    imageModel: 'image_advanced',
  },
  mature: {
    label: 'Mature (R)',
    description: 'Adult themes including suggestive content',
    guidelines: 'Mature themes allowed including romance and suggestive content. Tasteful sensuality.',
    allowImages: true,
    imageModel: 'image_quality',
  },
  adult: {
    label: 'Adult (18+)',
    description: 'Full creative freedom for adult content',
    guidelines: 'Full creative freedom for adult content. Be sensual and descriptive when appropriate.',
    allowImages: true,
    imageModel: 'image_advanced', // Z Turbo for general adult content; image_standard used only for explicit scenes
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

function getFlaskPort() {
  return window.BONZAI_SERVER_PORT || 65000;
}

async function callFlaskEndpoint(endpoint, payload, useDemo = false) {
  const port = getFlaskPort();
  const authHeaders = getAuthHeaders();

  // Use demo mode if no auth token available or explicitly requested
  const headers = {
    'Content-Type': 'application/json',
  };

  // If no auth token and demo mode allowed, use demo header
  if (!authHeaders.Authorization && useDemo) {
    headers['X-Demo-Mode'] = 'true';
  }

  // Use authFetch for automatic 401 handling with token refresh
  // This handles token expiration during idle periods
  const response = await authFetch(`http://localhost:${port}${endpoint}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    const errorMsg = errorBody.error || `Flask error: ${response.statusText}`;
    console.error(`[Flagship] Flask request failed: ${endpoint}`, errorMsg);
    throw new Error(errorMsg);
  }

  return response.json();
}

// Default LLM - same as Polymarket agent
const DEFAULT_LLM = {
  modelname: 'LLaMA 3.1 8B',
  filename: 'meta-llama-3.1-8b-instruct-q4_k_m.gguf',
  url: 'https://huggingface.co/lmstudio-community/Meta-Llama-3.1-8B-Instruct-GGUF/resolve/main/Meta-Llama-3.1-8B-Instruct-Q4_K_M.gguf',
};

// Roleplay LLM - MythoMax L2 13B for excellent creative roleplay
const ROLEPLAY_LLM = {
  modelname: 'MythoMax L2 13B',
  filename: 'mythomax-l2-13b.Q4_K_M.gguf',
  url: 'https://huggingface.co/TheBloke/MythoMax-L2-13B-GGUF/resolve/main/mythomax-l2-13b.Q4_K_M.gguf',
};

async function ensureLLMLoaded(config = DEFAULT_LLM) {
  if (!window.electronAPI?.loadModel) {
    throw new Error('LLM API not available. Make sure you are running in the Electron app.');
  }

  const modelInfo = await window.electronAPI.getModelInfo?.();
  if (modelInfo?.loaded) {
    console.log('[Flagship] LLM already loaded:', modelInfo.modelName || 'unknown');
    return;
  }

  console.log('[Flagship] Loading LLM:', config.modelname);
  await window.electronAPI.loadModel(config);
  console.log('[Flagship] LLM loaded successfully');
}

async function unloadLLM() {
  if (!window.electronAPI?.unloadModel) return;
  console.log('[Flagship] Unloading LLM to free memory...');
  await window.electronAPI.unloadModel();
}

// Clear ALL memory - LLM + Flask server models
async function clearAllMemory() {
  console.log('[Flagship] Clearing ALL memory (LLM + Flask models)...');

  // Unload the local LLM
  await unloadLLM();

  // Aggressively clear Flask server memory
  await clearGenerationMemory(true);

  // Wait for cleanup to complete
  await new Promise(r => setTimeout(r, 500));

  // Final status check
  const memStatus = await getMemoryStatus();
  if (memStatus) {
    console.log(`[Flagship] Memory after full clear: ${memStatus.rss_gb}GB RSS`);
  }
}

async function generateText(prompt, systemPrompt = '') {
  if (!window.electronAPI?.chat) {
    throw new Error('LLM chat API not available.');
  }

  await ensureLLMLoaded();

  const fullPrompt = systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt;
  const response = await window.electronAPI.chat(fullPrompt);

  if (!response || (typeof response === 'string' && response.trim() === '')) {
    throw new Error('LLM returned empty response');
  }

  return response;
}

async function generateTextWithModel(prompt, systemPrompt = '', llmConfig = DEFAULT_LLM) {
  if (!window.electronAPI?.chat) {
    throw new Error('LLM chat API not available.');
  }

  await ensureLLMLoaded(llmConfig);

  const fullPrompt = systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt;
  const response = await window.electronAPI.chat(fullPrompt);

  if (!response || (typeof response === 'string' && response.trim() === '')) {
    throw new Error('LLM returned empty response');
  }

  return response;
}

/**
 * Infer emotion from text content when not explicitly provided
 * @param {string} text - The response text to analyze
 * @returns {string} Inferred emotion
 */
function inferEmotionFromText(text) {
  if (!text) return 'neutral';
  const lower = text.toLowerCase();

  // Check for explicit emotions in order of intensity
  const emotionKeywords = {
    // High intensity intimate
    ecstatic: ['ecstasy', 'ecstatic', 'orgasm', 'climax', 'convuls', 'waves of pleasure'],
    overwhelmed: ['overwhelm', 'can\'t take', 'too much', 'sobbing', 'trembl'],
    passionate: ['passion', 'fervent', 'intense desire', 'burning'],
    aroused: ['aroused', 'arousal', 'turned on', 'wet', 'hard', 'throb', 'aching'],
    breathless: ['breathless', 'gasping', 'panting', 'can\'t breathe', 'catching breath'],
    // Medium intensity
    lustful: ['lust', 'hunger', 'want you', 'need you', 'crave'],
    longing: ['longing', 'yearning', 'missing', 'wish you were'],
    loving: ['love you', 'adore', 'cherish', 'heart swells'],
    flirty: ['wink', 'tease', 'playful smile', 'smirk', 'bite lip'],
    teasing: ['teasing', 'mischiev', 'playful'],
    // Low intensity
    happy: ['happy', 'joy', 'delighted', 'wonderful', 'amazing', 'smile', 'laugh', 'grin'],
    content: ['content', 'peaceful', 'serene', 'calm', 'relaxed', 'comfortable'],
    curious: ['curious', 'wonder', 'intrigued', 'fascinated', 'interested'],
    shy: ['shy', 'blush', 'embarrass', 'bashful', 'timid'],
    nervous: ['nervous', 'anxious', 'worried', 'uneasy'],
    surprised: ['surprised', 'shocked', 'astonished', 'amazed', 'didn\'t expect'],
    sad: ['sad', 'tear', 'cry', 'sorrow', 'heartbroken', 'miss you'],
    angry: ['angry', 'furious', 'rage', 'annoyed', 'frustrated'],
    confident: ['confident', 'bold', 'assured', 'certain'],
    playful: ['playful', 'giggle', 'bouncing', 'excited', 'fun'],
  };

  for (const [emotion, keywords] of Object.entries(emotionKeywords)) {
    if (keywords.some(k => lower.includes(k))) {
      return emotion;
    }
  }

  // Check for action-based emotions
  if (lower.includes('moan') || lower.includes('groan') || lower.includes('gasp')) return 'aroused';
  if (lower.includes('kiss') || lower.includes('embrace') || lower.includes('hold')) return 'loving';
  if (lower.includes('smile') || lower.includes('laugh')) return 'happy';
  if (lower.includes('sigh')) return 'content';

  return 'neutral';
}

function extractJSON(response) {
  if (!response || typeof response !== 'string') {
    throw new Error('Empty or invalid LLM response');
  }

  let content = response;
  content = content.replace(/<think>[\s\S]*?<\/think>/gi, '');

  const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    content = codeBlockMatch[1].trim();
  }

  // Try to find a complete JSON object
  let jsonMatch = content.match(/\{[\s\S]*\}/);

  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]);
    } catch (e) {
      // Try to fix common JSON issues
      let fixedJson = jsonMatch[0];
      fixedJson = fixedJson.replace(/,\s*}/g, '}');
      fixedJson = fixedJson.replace(/,\s*]/g, ']');

      try {
        return JSON.parse(fixedJson);
      } catch (e2) {
        // Fall through to field extraction
      }
    }
  }

  // Try to repair truncated JSON (incomplete output)
  const incompleteJsonMatch = content.match(/\{[\s\S]*/);
  if (incompleteJsonMatch) {
    let truncatedJson = incompleteJsonMatch[0];
    console.log('[Flagship] Attempting to repair truncated JSON...');

    // Count quotes to see if we're mid-string (simple count, ignore escaped quotes)
    let inString = false;
    let quoteCount = 0;
    for (let i = 0; i < truncatedJson.length; i++) {
      if (truncatedJson[i] === '"' && (i === 0 || truncatedJson[i - 1] !== '\\')) {
        quoteCount++;
      }
    }
    inString = quoteCount % 2 !== 0;

    // If we're mid-string, close the string
    if (inString) {
      truncatedJson += '"';
    }

    // Count braces/brackets after potentially closing the string
    const openBraces = (truncatedJson.match(/\{/g) || []).length;
    const closeBraces = (truncatedJson.match(/\}/g) || []).length;
    const openBrackets = (truncatedJson.match(/\[/g) || []).length;
    const closeBrackets = (truncatedJson.match(/\]/g) || []).length;

    // Close brackets and braces
    for (let i = 0; i < openBrackets - closeBrackets; i++) truncatedJson += ']';
    for (let i = 0; i < openBraces - closeBraces; i++) truncatedJson += '}';

    // Remove trailing comma before closing braces/brackets
    truncatedJson = truncatedJson.replace(/,(\s*[}\]])/g, '$1');

    // Try to parse
    try {
      const parsed = JSON.parse(truncatedJson);
      console.log('[Flagship] Repaired truncated JSON successfully:', Object.keys(parsed));
      return parsed;
    } catch (e3) {
      console.warn('[Flagship] Truncated JSON repair failed:', e3.message);
      // Try a more aggressive repair - find the last complete field and close there
      const lastCompleteField = truncatedJson.match(/^([\s\S]*"[^"]+"\s*:\s*(?:"[^"]*"|true|false|null|\d+))\s*,?\s*"[^"]*$/);
      if (lastCompleteField) {
        const repairedJson = lastCompleteField[1] + '}';
        try {
          const parsed = JSON.parse(repairedJson);
          console.log('[Flagship] Aggressively repaired JSON:', Object.keys(parsed));
          return parsed;
        } catch (e4) {
          // Fall through
        }
      }
    }
  }

  // No valid JSON object found - try to extract individual fields
  // Handle both quoted ("field":) and unquoted (field:) field names
  console.warn('[Flagship] No complete JSON object, extracting fields manually');

  const result = {
    response: null,
    emotion: 'neutral',
    action: null,
    shouldVisualize: false,
    imagePrompt: null,
    newLocation: null,
    suggestedResponses: ['Continue...', 'Tell me more', 'What happens next?'],
  };

  // Helper to extract field value - handles multiple formats:
  // "fieldName": "value", fieldName: "value", fieldName: value, Field Name: value
  const extractField = (fieldName, isMultiline = false) => {
    // Create pattern that matches both camelCase and space-separated versions
    // e.g., "shouldVisualize" matches "shouldVisualize", "should visualize", "Should Visualize"
    const spacedName = fieldName.replace(/([A-Z])/g, ' $1').trim(); // shouldVisualize -> should Visualize
    const fieldPattern = `(?:${fieldName}|${spacedName.replace(/\s+/g, '\\s*')})`; // Match both forms

    // Try quoted JSON format first: "field": "value"
    let match = content.match(new RegExp(`"${fieldName}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`, 'si'));
    if (match) {
      return match[1].replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\t/g, '\t');
    }

    // Try unquoted/spaced field name with quoted value: field: "value" or Field Name: "value"
    match = content.match(new RegExp(`(?:^|\\n)"?${fieldPattern}"?\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`, 'si'));
    if (match) {
      return match[1].replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\t/g, '\t');
    }

    // Try unquoted field name with unquoted value (until next field or end)
    // This handles: field: value text here, Field Name: value text here
    const nextFieldPattern = '(?:response|emotion|action|new\\s*location|should\\s*visualize|image\\s*prompt|suggested\\s*responses)';
    if (isMultiline) {
      match = content.match(new RegExp(`(?:^|\\n)"?${fieldPattern}"?\\s*:\\s*(.+?)(?=\\n(?:\\w+\\s+)?${nextFieldPattern}\\s*:|$)`, 'si'));
    } else {
      match = content.match(new RegExp(`(?:^|\\n)"?${fieldPattern}"?\\s*:\\s*(.+?)(?=\\n|$)`, 'si'));
    }
    if (match) {
      return match[1].trim().replace(/^"(.*)"$/, '$1'); // Remove surrounding quotes if present
    }

    return null;
  };

  // Extract response field (multiline)
  const responseValue = extractField('response', true);
  if (responseValue) {
    result.response = responseValue;
    console.log(`[Flagship] Extracted response field, length: ${responseValue.length}`);
  } else {
    console.warn('[Flagship] Failed to extract response field from content');
  }

  // Extract emotion field - try explicit field first, then infer from response
  const emotionValue = extractField('emotion');
  if (emotionValue && emotionValue !== 'neutral') {
    result.emotion = emotionValue;
  } else if (result.response) {
    // Infer emotion from response text if not explicitly provided
    const inferredEmotion = inferEmotionFromText(result.response);
    if (inferredEmotion !== 'neutral') {
      result.emotion = inferredEmotion;
      console.log(`[Flagship] Inferred emotion from response: ${inferredEmotion}`);
    }
  }

  // Extract action field (multiline)
  const actionValue = extractField('action', true);
  if (actionValue) {
    result.action = actionValue;
  }

  // Extract shouldVisualize field
  const visualizeValue = extractField('shouldVisualize');
  if (visualizeValue) {
    result.shouldVisualize = visualizeValue.toLowerCase() === 'true';
  }

  // Extract imagePrompt field (multiline)
  const imagePromptValue = extractField('imagePrompt', true);
  if (imagePromptValue) {
    result.imagePrompt = imagePromptValue;
  }

  // Extract newLocation field
  const locationValue = extractField('newLocation');
  if (locationValue && locationValue.toLowerCase() !== 'null') {
    result.newLocation = locationValue;
  }

  // Extract suggestedResponses - handle multiple formats
  // Format 1: JSON array ["a", "b", "c"]
  let suggestionsMatch = content.match(/"?suggestedResponses"?\s*:\s*\[([\s\S]*?)\]/i);
  if (suggestionsMatch) {
    const suggestions = suggestionsMatch[1].match(/"((?:[^"\\]|\\.)*)"/g);
    if (suggestions && suggestions.length > 0) {
      result.suggestedResponses = suggestions.map(s => s.slice(1, -1).replace(/\\"/g, '"'));
    }
  } else {
    // Format 2: Numbered list
    // 1. "suggestion one"
    // 2. "suggestion two"
    const numberedMatch = content.match(/suggestedResponses\s*:\s*\n?((?:\s*\d+\.\s*"[^"]+"\s*\n?)+)/i);
    if (numberedMatch) {
      const items = numberedMatch[1].match(/"([^"]+)"/g);
      if (items && items.length > 0) {
        result.suggestedResponses = items.map(s => s.slice(1, -1));
      }
    } else {
      // Format 3: Numbered list without quotes
      // 1. suggestion one
      // 2. suggestion two
      const unquotedMatch = content.match(/suggestedResponses\s*:\s*\n?((?:\s*\d+\.\s*[^\n]+\n?)+)/i);
      if (unquotedMatch) {
        const lines = unquotedMatch[1].split('\n').filter(l => l.trim());
        const items = lines.map(l => l.replace(/^\s*\d+\.\s*"?|"?\s*$/g, '').trim()).filter(l => l.length > 0);
        if (items.length > 0) {
          result.suggestedResponses = items;
        }
      }
    }
  }

  // Fallback: if no response but we have action or content looks like narrative, try harder
  if (!result.response && content.length > 50) {
    console.warn('[Flagship] No response extracted, attempting fallback extraction');

    // Try to find any quoted text that looks like dialogue/narration (longer than 50 chars)
    const quotedMatches = content.match(/"([^"]{50,})"/g);
    if (quotedMatches && quotedMatches.length > 0) {
      // Use the longest quoted text as the response
      const longest = quotedMatches
        .map(m => m.slice(1, -1))
        .sort((a, b) => b.length - a.length)[0];
      result.response = longest;
      console.log(`[Flagship] Fallback: extracted from quoted text, length: ${longest.length}`);
    } else {
      // Try to find text between common delimiters
      const textMatch = content.match(/(?:response|narrator|says|speaks)[\s:]*["\s]*([^"]{50,}?)(?:"|$|\n\s*[a-z]+:)/i);
      if (textMatch && textMatch[1]) {
        result.response = textMatch[1].trim();
        console.log(`[Flagship] Fallback: extracted near keyword, length: ${result.response.length}`);
      }
    }

    // Infer emotion from fallback response
    if (result.response && result.emotion === 'neutral') {
      const inferred = inferEmotionFromText(result.response);
      if (inferred !== 'neutral') {
        result.emotion = inferred;
        console.log(`[Flagship] Inferred emotion from fallback: ${inferred}`);
      }
    }
  }

  // If we got a response, clean it from any embedded metadata fields
  if (result.response) {
    // Remove any metadata fields that got embedded in the response text
    // These patterns match field names followed by their values
    // Handle ALL variations: "shouldVisualize:", "Should Visualize:", "should visualize:", standalone lines, inline, etc.
    let cleanResponse = result.response;

    // ═══════════════════════════════════════════════════════════════════════════
    // AGGRESSIVE METADATA REMOVAL - Match anywhere in text, not just line starts
    // ═══════════════════════════════════════════════════════════════════════════

    // Remove Emotion: patterns (standalone or inline) - "Emotion: curious", "Curious Emotion:", etc.
    cleanResponse = cleanResponse.replace(/\s*\**"?(?:\w+\s+)?emotion"?\**\s*:\s*"?[\w\s]+?"?[,.]?\s*/gi, ' ');

    // Remove Action: patterns - "Action: she smiles", "Curious Action:", etc.
    cleanResponse = cleanResponse.replace(/\s*\**"?(?:\w+\s+)?action"?\**\s*:\s*"?[^"\n]*?"?[,.]?\s*(?=\n|$|[A-Z])/gi, ' ');
    cleanResponse = cleanResponse.replace(/\s*\**"?action"?\**\s*:\s*[^\n]+/gi, '');

    // Remove Should Visualize / shouldVisualize patterns
    cleanResponse = cleanResponse.replace(/\s*\**"?should\s*visualize"?\**\s*:\s*"?(true|false)"?[,.]?\s*/gi, ' ');

    // Remove Image Prompt / imagePrompt patterns
    cleanResponse = cleanResponse.replace(/\s*\**"?image\s*prompt"?\**\s*:\s*"?[^"\n]*"?[,.]?\s*/gi, '');

    // Remove New Location / newLocation patterns
    cleanResponse = cleanResponse.replace(/\s*\**"?new\s*location"?\**\s*:\s*"?[^"\n]*"?[,.]?\s*/gi, '');

    // Remove Suggested Responses patterns (arrays and numbered lists)
    cleanResponse = cleanResponse.replace(/\s*\**"?suggested\s*responses"?\**\s*:\s*\[[\s\S]*?\]\s*/gi, '');
    cleanResponse = cleanResponse.replace(/\s*\**"?suggested\s*responses"?\**\s*:\s*\n?(?:\s*[-•*]?\s*\d*\.?\s*"?[^"\n]+?"?\s*\n?)*/gi, '');

    // Remove Response: if it appears (shouldn't but just in case)
    cleanResponse = cleanResponse.replace(/^\s*\**"?response"?\**\s*:\s*"?/gi, '');

    // Remove any standalone field labels that might remain
    // Pattern: word followed by colon at start of line or after newline
    const metadataFields = ['emotion', 'action', 'shouldvisualize', 'should visualize', 'imageprompt', 'image prompt', 'newlocation', 'new location', 'suggestedresponses', 'suggested responses'];
    metadataFields.forEach(field => {
      const pattern = new RegExp(`\\n\\s*\\**"?${field}"?\\**\\s*:\\s*[^\\n]*`, 'gi');
      cleanResponse = cleanResponse.replace(pattern, '');
    });

    // Remove orphaned JSON syntax that might remain
    cleanResponse = cleanResponse.replace(/^\s*[{}\[\]]\s*$/gm, '');
    cleanResponse = cleanResponse.replace(/,\s*$/gm, '');
    cleanResponse = cleanResponse.replace(/"\s*$/gm, ''); // Trailing quotes

    // Clean up multiple spaces and extra whitespace
    cleanResponse = cleanResponse.replace(/  +/g, ' ');
    cleanResponse = cleanResponse.replace(/\n{3,}/g, '\n\n').trim();

    // If cleaning removed too much content, use the original extracted response
    if (cleanResponse.length < 10 && result.response.length >= 10) {
      console.warn('[Flagship] Cleaning removed too much content, using original');
      cleanResponse = result.response.trim();
    }

    result.response = cleanResponse;

    console.log('[Flagship] Extracted fields:', {
      hasResponse: !!result.response,
      responseLength: result.response?.length || 0,
      responsePreview: result.response?.substring(0, 100) || 'EMPTY',
      emotion: result.emotion,
      hasAction: !!result.action,
      shouldVisualize: result.shouldVisualize,
      hasImagePrompt: !!result.imagePrompt,
      suggestionsCount: result.suggestedResponses.length,
    });
    return result;
  }

  // Try to extract companion/scenario fields if roleplay fields not found
  const companionResult = {};
  const companionFields = ['name', 'description', 'personality', 'appearance', 'background', 'voiceStyle', 'avatar', 'setting', 'mood'];

  for (const fieldName of companionFields) {
    const value = extractField(fieldName, fieldName === 'background' || fieldName === 'appearance' || fieldName === 'setting');
    if (value) {
      companionResult[fieldName] = value;
    }
  }

  // If we found companion fields (name is the key indicator), return that
  if (companionResult.name) {
    console.log('[Flagship] Extracted companion/scenario fields:', Object.keys(companionResult));
    return companionResult;
  }

  // Last resort: if content looks like roleplay text (not JSON at all), use it as response
  const cleanedContent = content.trim();
  if (cleanedContent.length > 50 && !cleanedContent.startsWith('{') && !cleanedContent.includes('"response"') && !cleanedContent.match(/^response:/i)) {
    console.warn('[Flagship] Using plain text as response');
    const inferredEmotion = inferEmotionFromText(cleanedContent);
    console.log(`[Flagship] Inferred emotion from text: ${inferredEmotion}`);
    return {
      response: cleanedContent,
      emotion: inferredEmotion,
      action: null,
      shouldVisualize: false,
      suggestedResponses: ['Continue...', 'Tell me more', 'What happens next?'],
    };
  }

  console.error('[Flagship] Failed to extract response from:', content.substring(0, 500));
  throw new Error('Could not extract response from LLM output');
}

// Image generation - FLUX turbo (fast)
async function generateImage(prompt, options = {}) {
  // Endpoint selection: quality (FLUX Krea) > advanced (Z Turbo) > turbo (FLUX Klein)
  const endpoint = options.quality ? '/image/quality' : (options.advanced ? '/image/advanced' : '/image/turbo');
  return await callFlaskEndpoint(endpoint, {
    prompt,
    negative_prompt: options.negativePrompt || '',
    width: options.width || 1024,
    height: options.height || 1024,
    steps: options.steps || (options.quality ? 20 : (options.advanced ? 9 : 4)),
    guidance_scale: options.guidanceScale || 3.5,
  }, true); // Enable demo mode fallback
}

// SDXL generation - for uncensored/adult content
async function generateImageSDXL(prompt, options = {}) {
  return await callFlaskEndpoint('/image/standard', {
    prompt,
    negative_prompt: options.negativePrompt || 'blurry, low quality, distorted',
    width: options.width || 1024,
    height: options.height || 1024,
    steps: options.steps || 25,
    guidance_scale: options.guidanceScale || 7.5,
  }, true); // Enable demo mode fallback
}

// Image-to-Image transformation
async function editImage(imageBase64, prompt, options = {}) {
  return await callFlaskEndpoint('/image/image/turbo', {
    image_base64: imageBase64,
    prompt,
    negative_prompt: options.negativePrompt || '',
    strength: options.strength || 0.75,
    width: options.width || 1024,
    height: options.height || 1024,
    steps: options.steps || 4,
    guidance_scale: options.guidanceScale || 3.5,
  });
}

// TTS narration - supports Qwen3-TTS (high quality persona), Kokoro (fast), and Chatterbox (multilingual)
async function generateNarration(text, options = {}) {
  // Use Qwen3-TTS /audio/quality/persona for companion roleplay (high quality)
  if (options.companion) {
    const companion = options.companion;
    const voiceId = `companion_${companion.id}`;

    // Build voice description from companion attributes
    const genderDesc = companion.gender === 'male' ? 'Male' : companion.gender === 'female' ? 'Female' : 'Neutral';
    const basePersonality = companion.voiceStyle || companion.personality || '';

    // Map emotions to voice delivery instructions
    const emotionVoiceStyles = {
      excited: 'slow bold confident tone, breathless with anticipation, mix of excitement and nervousness',
      happy: 'warm and cheerful tone, moderate pace, bright voice',
      playful: 'teasing and lighthearted tone, varied pace, playful inflections',
      flirty: 'sultry and inviting tone, slower pace, breathy voice',
      aroused: 'breathless and husky tone, slow pace, soft and intimate',
      passionate: 'intense and fervent tone, rhythmic pace, deep emotion',
      loving: 'tender and affectionate tone, gentle pace, warm voice',
      content: 'relaxed and peaceful tone, slow pace, soft voice',
      sad: 'melancholic and soft tone, slow pace, lower pitch',
      angry: 'sharp and forceful tone, fast pace, raised voice',
      nervous: 'hesitant and trembling tone, uneven pace, higher pitch',
      shy: 'quiet and timid tone, slow pace, soft whisper',
      confident: 'bold and assured tone, steady pace, strong projection',
      curious: 'inquisitive and wondering tone, varied pace, rising inflections',
      surprised: 'startled and amazed tone, quick pace, exclamatory',
      thoughtful: 'contemplative and measured tone, slow pace, pauses',
      teasing: 'mischievous and playful tone, lilting pace, knowing inflections',
      seductive: 'alluring and sensual tone, slow deliberate pace, low intimate voice',
      ecstatic: 'overwhelmed and breathless tone, quick gasping pace, high emotion',
      climax: 'intense gasping tone, rhythmic pace, building to release',
    };

    // Get emotion-specific voice style
    const emotion = options.emotion?.toLowerCase() || '';
    const emotionKey = Object.keys(emotionVoiceStyles).find(e => emotion.includes(e));
    const emotionStyle = emotionVoiceStyles[emotionKey] || '';

    // Build comprehensive instruct with emotion context
    let instruct = `${genderDesc}`;
    if (basePersonality) {
      instruct += `, ${basePersonality}`;
    }
    if (emotionStyle) {
      instruct += `. Speaking with ${emotionStyle}`;
    }
    if (options.action) {
      // Add action context for additional nuance
      const actionClean = options.action.replace(/\*+/g, '').trim();
      if (actionClean.length > 0 && actionClean.length < 50) {
        instruct += `. While ${actionClean}`;
      }
    }

    console.log(`[Roleplay] TTS instruct: ${instruct}`);

    // Sample text for voice design (use a characteristic phrase)
    const sampleText = options.sampleText || `Hello, I'm ${companion.name}. It's wonderful to meet you.`;

    return await callFlaskEndpoint('/audio/quality/persona', {
      text,
      persona: {
        voice_id: voiceId,
        instruct,
        sample_text: sampleText,
      },
      language: options.language || 'English',
    }, true); // Enable demo mode fallback
  }

  // Use Kokoro /audio/turbo for fast TTS with gender (fallback)
  if (options.gender) {
    return await callFlaskEndpoint('/audio/turbo', {
      prompt: text,
      gender: options.gender,
      voice: options.voice,
      speed: options.speed || 1.0,
    }, true);
  }

  // Fall back to Chatterbox for multilingual or voice cloning
  return await callFlaskEndpoint('/audio', {
    prompt: text,
    language: options.language || 'en',
    exaggeration: options.exaggeration || 0.5,
    max_tokens: options.maxTokens || 1024,
    ...(options.voiceBase64 && { synthesis_base64: options.voiceBase64 }),
  }, true);
}

// Scenery background generation using turbo endpoint (fast)
async function generateSceneryBackground(scenarioOrLocation, options = {}) {
  // Build a scenery-focused prompt (no characters, just environment)
  let sceneryPrompt;
  if (typeof scenarioOrLocation === 'object') {
    // Full scenario object
    sceneryPrompt = `${scenarioOrLocation.setting || scenarioOrLocation.description}, ${scenarioOrLocation.mood || 'atmospheric'} mood, scenic background, no people, environmental shot, cinematic lighting, high quality`;
  } else {
    // Location string
    sceneryPrompt = `${scenarioOrLocation}, scenic background, no people, environmental shot, cinematic lighting, high quality`;
  }

  console.log(`[Roleplay] Generating scenery background: ${sceneryPrompt.substring(0, 100)}...`);

  try {
    // Use /image/turbo (FLUX Klein) for backgrounds - fast generation, no characters
    const result = await callFlaskEndpoint('/image/turbo', {
      prompt: sceneryPrompt,
      negative_prompt: 'person, people, character, face, human, portrait, figure',
      width: options.width || 1280,
      height: options.height || 720,
      steps: 4,
      guidance_scale: 3.5,
    }, true);

    return result.image_base64 || result.image || null;
  } catch (e) {
    console.warn('[Roleplay] Scenery background generation failed:', e.message);
    return null;
  }
}

// Clear VRAM/RAM after generation to free memory for next task
async function clearGenerationMemory(aggressive = false) {
  try {
    const port = getFlaskPort();
    const response = await fetch(`http://localhost:${port}/memory/clear`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    const result = await response.json();
    console.log('[Flagship] Memory cleared:', result.unloaded || 'none');

    // If aggressive mode, clear multiple times with delays
    if (aggressive) {
      await new Promise(r => setTimeout(r, 300));
      await fetch(`http://localhost:${port}/memory/clear`, { method: 'POST' });
      await new Promise(r => setTimeout(r, 300));
      await fetch(`http://localhost:${port}/memory/clear`, { method: 'POST' });
      console.log('[Flagship] Aggressive memory clear complete');
    }
  } catch (e) {
    console.warn('[Flagship] Failed to clear memory:', e.message);
  }
}

// Get memory status for debugging
async function getMemoryStatus() {
  try {
    const port = getFlaskPort();
    const response = await fetch(`http://localhost:${port}/memory/status`);
    return await response.json();
  } catch (e) {
    console.warn('[Flagship] Failed to get memory status:', e.message);
    return null;
  }
}

// Video generation (I2V or T2V)
// Reduced defaults for MPS/Apple Silicon memory constraints
async function generateVideo(imageBase64OrNull, prompt, options = {}) {
  const mode = imageBase64OrNull ? 'i2v' : 't2v';
  return await callFlaskEndpoint('/video', {
    mode,
    prompt,
    ...(imageBase64OrNull && { image_base64: imageBase64OrNull }),
    height: options.height || 480,
    width: options.width || 352,
    frames: options.frames || 37,  // ~3 seconds at 12fps
    frame_rate: options.frameRate || 12,
    steps: options.steps || 10,
    guidance_scale: options.guidanceScale || 1.0,
  }, true); // Enable demo mode fallback
}

// ═══════════════════════════════════════════════════════════════════════════
// ROLEPLAY COMPANION BEHAVIOR HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Calculate text similarity using Jaccard index (simple but effective)
 * @param {string} text1 - First text
 * @param {string} text2 - Second text
 * @returns {number} Similarity score between 0 and 1
 */
function calculateTextSimilarity(text1, text2) {
  if (!text1 || !text2) return 0;

  const words1 = new Set(text1.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  const words2 = new Set(text2.toLowerCase().split(/\s+/).filter(w => w.length > 3));

  if (words1.size === 0 || words2.size === 0) return 0;

  const intersection = new Set([...words1].filter(w => words2.has(w)));
  const union = new Set([...words1, ...words2]);

  return intersection.size / union.size;
}

/**
 * Detect if the conversation is stuck in a loop
 * @param {string} newResponse - The new response to check
 * @param {Array} history - Recent chat history
 * @param {number} threshold - Similarity threshold (default 0.5 - more sensitive)
 * @returns {object} { isLoop: boolean, similarity: number }
 */
function detectResponseLoop(newResponse, history, threshold = 0.5) {
  if (!history || history.length < 2) return { isLoop: false, similarity: 0 };

  // Check against last 4 assistant messages
  const recentAssistantMsgs = history
    .filter(m => m.role === 'assistant')
    .slice(-4)
    .map(m => m.content);

  let maxSimilarity = 0;
  for (const prevMsg of recentAssistantMsgs) {
    const similarity = calculateTextSimilarity(newResponse, prevMsg);
    maxSimilarity = Math.max(maxSimilarity, similarity);
    if (similarity > threshold) {
      return { isLoop: true, similarity };
    }
  }

  // Also check for repetitive phrases/patterns
  const newWords = newResponse.toLowerCase().split(/\s+/);
  for (const prevMsg of recentAssistantMsgs) {
    const prevWords = prevMsg.toLowerCase().split(/\s+/);
    // Check if first 10 words are very similar
    const firstTenNew = newWords.slice(0, 10).join(' ');
    const firstTenPrev = prevWords.slice(0, 10).join(' ');
    if (firstTenNew === firstTenPrev && firstTenNew.length > 20) {
      return { isLoop: true, similarity: 0.9 };
    }
  }

  return { isLoop: false, similarity: maxSimilarity };
}

/**
 * Extract the first few words of a response (opening phrase)
 * @param {string} text - The response text
 * @returns {string} First 5 words
 */
function extractOpeningPhrase(text) {
  if (!text) return '';
  return text.split(/\s+/).slice(0, 5).join(' ');
}

/**
 * Relationship levels for tracking intimacy progression
 */
const RELATIONSHIP_LEVELS = {
  strangers: { order: 0, label: 'Just met', description: 'Initial encounter, getting to know each other' },
  acquaintances: { order: 1, label: 'Acquaintances', description: 'Familiar with each other, casual rapport' },
  friends: { order: 2, label: 'Friends', description: 'Comfortable friendship, trust established' },
  close_friends: { order: 3, label: 'Close friends', description: 'Deep friendship, emotional bond, possible attraction' },
  romantic: { order: 4, label: 'Romantic', description: 'Romantic relationship, dating, in love' },
  intimate: { order: 5, label: 'Intimate partners', description: 'Deep romantic and physical intimacy, committed relationship' },
};

/**
 * Determine relationship level based on history and emotions
 * @param {Array} history - Chat history
 * @param {Object} currentState - Current relationship state
 * @param {Object} newResponse - Latest response with emotion/action
 * @returns {Object} Updated relationship state
 */
function updateRelationshipState(history, currentState = {}, newResponse = {}) {
  const {
    level = 'strangers',
    milestones = [],
    intimacyScore = 0,
  } = currentState;

  let newLevel = level;
  let newScore = intimacyScore;
  const newMilestones = [...milestones];

  const emotion = (newResponse.emotion || '').toLowerCase();
  const action = (newResponse.action || '').toLowerCase();
  const response = (newResponse.response || '').toLowerCase();
  const combined = `${emotion} ${action} ${response}`;

  // Intimacy indicators that increase relationship score
  const intimacyKeywords = {
    light: ['flirt', 'blush', 'shy', 'nervous', 'attracted', 'cute', 'handsome', 'beautiful'],
    medium: ['kiss', 'hold hands', 'hug', 'embrace', 'caress', 'cuddle', 'affection', 'love', 'adore'],
    heavy: ['passionate', 'desire', 'want you', 'need you', 'aroused', 'intimate', 'make love'],
    intense: ['sex', 'fuck', 'orgasm', 'climax', 'thrust', 'moan', 'ecstasy', 'pleasure'],
  };

  // Score adjustments
  if (intimacyKeywords.light.some(k => combined.includes(k))) newScore += 1;
  if (intimacyKeywords.medium.some(k => combined.includes(k))) newScore += 3;
  if (intimacyKeywords.heavy.some(k => combined.includes(k))) newScore += 5;
  if (intimacyKeywords.intense.some(k => combined.includes(k))) newScore += 10;

  // Romantic emotions boost score
  const romanticEmotions = ['loving', 'flirty', 'longing', 'passionate', 'aroused', 'breathless'];
  if (romanticEmotions.includes(emotion)) newScore += 2;

  // Track milestones
  if (combined.includes('kiss') && !milestones.includes('first_kiss')) {
    newMilestones.push('first_kiss');
  }
  if (combined.includes('love') && combined.includes('you') && !milestones.includes('love_confession')) {
    newMilestones.push('love_confession');
  }
  if (intimacyKeywords.intense.some(k => combined.includes(k)) && !milestones.includes('physical_intimacy')) {
    newMilestones.push('physical_intimacy');
  }

  // Determine level based on score thresholds
  if (newScore >= 50 || newMilestones.includes('physical_intimacy')) {
    newLevel = 'intimate';
  } else if (newScore >= 30 || newMilestones.includes('love_confession')) {
    newLevel = 'romantic';
  } else if (newScore >= 15 || newMilestones.includes('first_kiss')) {
    newLevel = 'close_friends';
  } else if (newScore >= 5) {
    newLevel = 'friends';
  } else if (newScore >= 2 || history.length > 10) {
    newLevel = 'acquaintances';
  }

  return {
    level: newLevel,
    milestones: newMilestones,
    intimacyScore: newScore,
    levelInfo: RELATIONSHIP_LEVELS[newLevel],
  };
}

/**
 * Rebuild relationship state from chat history (for older sessions without saved state)
 * @param {Array} history - Full chat history
 * @returns {Object} Rebuilt relationship state
 */
function rebuildRelationshipFromHistory(history) {
  let state = { level: 'strangers', milestones: [], intimacyScore: 0 };

  for (const msg of history) {
    if (msg.role === 'assistant') {
      state = updateRelationshipState(history, state, {
        emotion: msg.emotion || '',
        action: msg.action || '',
        response: msg.content || '',
      });
    }
  }

  console.log(`[Roleplay] Rebuilt relationship state from ${history.length} messages: ${state.level} (score: ${state.intimacyScore})`);
  return state;
}

/**
 * Build relationship context string for LLM prompt
 * @param {Object} relationshipState - Current relationship state
 * @param {number} historyLength - Total messages in history
 * @returns {string} Relationship context for prompt
 */
function buildRelationshipContext(relationshipState, historyLength) {
  const { level, milestones = [], levelInfo } = relationshipState || {};

  if (!level || level === 'strangers') {
    return '';
  }

  const milestoneDescriptions = {
    first_kiss: 'You have shared your first kiss',
    love_confession: 'You have confessed your love for each other',
    physical_intimacy: 'You have been physically intimate together',
  };

  const milestonesStr = milestones
    .map(m => milestoneDescriptions[m])
    .filter(Boolean)
    .join('. ');

  return `
RELATIONSHIP STATUS (CRITICAL - MAINTAIN THIS):
- Current relationship: ${levelInfo?.label || level} (${levelInfo?.description || ''})
- Conversation history: ${historyLength} messages exchanged
${milestonesStr ? `- Key moments: ${milestonesStr}` : ''}
- IMPORTANT: You and the user have an established relationship. Do NOT act like strangers.
- Continue the emotional intimacy level that has been built. Reference shared experiences naturally.
`;
}

/**
 * Configuration for smart image generation
 */
const IMAGE_GENERATION_CONFIG = {
  MIN_MESSAGES_BEFORE_FIRST_IMAGE: 1,  // Skip image on first N messages (let conversation start)
  MIN_MESSAGES_BETWEEN_IMAGES: 3,      // Minimum messages between images
  FORCE_IMAGE_AFTER_MESSAGES: 8,       // Force image after this many without one
};

// ═══════════════════════════════════════════════════════════════════════════
// 1. STORY STUDIO (Entertainment)
// ═══════════════════════════════════════════════════════════════════════════

export const storyStudio = createSkillDefinition({
  id: 'story-studio-v1.0.0',
  name: 'Story Studio',
  description: 'Transform your story idea into an illustrated, narrated experience with original artwork and audio.',
  version: '1.0.0',
  author: { address: '0x8Ff3b2e823b33BeE30e699bB1b6BBc8F622fEa89', name: 'BonzAI', verified: true },
  category: 'entertainment',
  tags: ['story', 'illustration', 'audiobook', 'creative'],
  requirements: {
    minLevel: 3,
    requiredApis: ['llm', 'image', 'audio'],
    requiredPermissions: [],
  },
  inputs: {
    storyIdea: { type: 'string', default: '', label: 'Story Idea', description: 'Describe your story concept' },
    genre: { type: 'select', default: 'fantasy', label: 'Genre', options: ['fantasy', 'sci-fi', 'mystery', 'romance', 'adventure', 'horror', 'comedy'] },
    length: { type: 'select', default: 'short', label: 'Length', options: ['flash', 'short', 'medium'] },
    artStyle: { type: 'select', default: 'digital-art', label: 'Art Style', options: ['digital-art', 'watercolor', 'anime', 'realistic', 'comic-book'] },
    includeNarration: { type: 'boolean', default: true, label: 'Include Audio Narration' },
  },
  prompt: { system: 'You are a master storyteller.', task: 'Create an illustrated story.', outputFormat: { type: 'json' } },
  tools: { bonzai: [], mcp: [] },
  execution: {
    type: 'javascript',
    entrypoint: 'execute',
    async execute(inputs, context) {
      const { storyIdea, genre, length, artStyle, includeNarration } = inputs;
      const sceneCount = { flash: 3, short: 5, medium: 8 }[length] || 5;

      context.updateStatus?.('Loading AI model...');
      await ensureLLMLoaded();

      context.updateStatus?.('Writing your story...');
      const storyPrompt = `Create a ${genre} story based on: ${storyIdea}

Output JSON with:
- "title": Story title
- "synopsis": 2-3 sentence summary
- "scenes": Array of ${sceneCount} scenes, each with:
  - "title": Scene title
  - "narrative": 2-3 paragraphs of story text
  - "imagePrompt": Detailed ${artStyle} illustration prompt

Return ONLY valid JSON.`;

      const storyResponse = await generateText(storyPrompt);
      let story;
      try {
        story = extractJSON(storyResponse);
      } catch (e) {
        throw new Error(`Failed to parse story: ${e.message}`);
      }

      context.updateStatus?.('Freeing memory for illustrations...');
      await unloadLLM();

      context.updateStatus?.('Creating illustrations...');
      for (let i = 0; i < story.scenes.length; i++) {
        const scene = story.scenes[i];
        context.updateStatus?.(`Illustrating scene ${i + 1}/${story.scenes.length}...`);
        try {
          const imgResult = await generateImage(`${scene.imagePrompt}, ${artStyle} style, high quality`, { width: 1024, height: 768 });
          scene.image = imgResult.image_base64 || imgResult.image;
        } catch (e) {
          scene.image = null;
        }
      }

      if (includeNarration) {
        context.updateStatus?.('Recording narration...');
        const fullNarrative = story.scenes.map(s => s.narrative).join('\n\n');
        try {
          const narrationResult = await generateNarration(fullNarrative);
          story.narration = narrationResult.audio_path || narrationResult.audio;
        } catch (e) {
          story.narration = null;
        }
      }

      return { success: true, story, meta: { genre, artStyle, sceneCount: story.scenes.length } };
    },
  },
  metadata: { createdAt: '2025-01-25T00:00:00Z', updatedAt: '2025-01-25T00:00:00Z', license: 'MIT' },
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. MEDITATION FORGE (Healthcare)
// ═══════════════════════════════════════════════════════════════════════════

export const meditationForge = createSkillDefinition({
  id: 'meditation-forge-v1.0.0',
  name: 'Meditation Forge',
  description: 'Create personalized guided meditations with calming visuals and ASMR narration. Choose from 8 unique scenarios designed for stress relief, sleep, focus, and more.',
  version: '1.0.0',
  author: { address: '0x8Ff3b2e823b33BeE30e699bB1b6BBc8F622fEa89', name: 'BonzAI', verified: true },
  category: 'healthcare',
  tags: ['meditation', 'wellness', 'mindfulness', 'relaxation', 'ASMR', 'sleep'],
  featured: true,
  // Custom UI component handles all rendering
  hasCustomUI: true,
  requirements: {
    minLevel: 3,
    requiredApis: ['llm', 'image', 'audio'],
    requiredPermissions: [],
  },
  // Inputs are handled by custom UI (MeditationForgeSkill.vue)
  // At least one input required for validation - scenario selection handled in UI
  inputs: {
    scenario: { type: 'string', default: 'forest-calm', label: 'Scenario', description: 'Meditation scenario (handled by custom UI)' },
  },
  prompt: { system: 'You are a meditation guide.', task: 'Create a meditation script.', outputFormat: { type: 'json' } },
  tools: { bonzai: [], mcp: [] },
  // Execution is handled by the custom UI component
  execution: {
    type: 'custom',
    entrypoint: 'MeditationForgeSkill',
    // Legacy execute function kept for backwards compatibility
    async execute(inputs, context) {
      const { intention, duration, environment } = inputs;

      context.updateStatus?.('Loading AI model...');
      await ensureLLMLoaded();

      context.updateStatus?.('Writing meditation script...');
      const scriptPrompt = `Create a ${duration}-minute guided meditation for: ${intention}
Environment: ${environment}

Output JSON with:
- "title": Meditation title
- "script": Full meditation script (${parseInt(duration) * 120} words)
- "visualPrompt": Prompt for calming ${environment} scene

Return ONLY valid JSON.`;

      const scriptResponse = await generateText(scriptPrompt);
      let meditation;
      try {
        meditation = extractJSON(scriptResponse);
      } catch (e) {
        throw new Error(`Failed to parse meditation: ${e.message}`);
      }

      context.updateStatus?.('Freeing memory...');
      await unloadLLM();

      context.updateStatus?.('Creating visuals...');
      try {
        const imgResult = await generateImage(`${meditation.visualPrompt}, serene, peaceful, 4k, calming colors`, { width: 1024, height: 768, quality: true });
        meditation.image = imgResult.image_base64 || imgResult.image;
      } catch (e) {
        meditation.image = null;
      }

      context.updateStatus?.('Recording narration...');
      try {
        const narrationResult = await generateNarration(meditation.script, { exaggeration: 0.3 });
        meditation.narration = narrationResult.audio_path || narrationResult.audio;
      } catch (e) {
        meditation.narration = null;
      }

      return { success: true, meditation, meta: { intention, duration, environment } };
    },
  },
  metadata: { createdAt: '2025-01-25T00:00:00Z', updatedAt: '2025-01-25T00:00:00Z', license: 'MIT' },
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. VIRTUAL STAGING PRO (Housing)
// ═══════════════════════════════════════════════════════════════════════════

export const virtualStagingPro = createSkillDefinition({
  id: 'virtual-staging-pro-v1.0.0',
  name: 'Virtual Staging Pro',
  description: 'Transform empty rooms into beautifully staged interiors.',
  version: '1.0.0',
  author: { address: '0x8Ff3b2e823b33BeE30e699bB1b6BBc8F622fEa89', name: 'BonzAI', verified: true },
  category: 'housing',
  tags: ['interior-design', 'staging', 'real-estate'],
  requirements: {
    minLevel: 3,
    requiredApis: ['llm', 'image'],
    requiredPermissions: [],
  },
  inputs: {
    roomPhoto: { type: 'image', default: '', label: 'Room Photo (Optional)' },
    roomType: { type: 'select', default: 'living-room', label: 'Room Type', options: ['living-room', 'bedroom', 'kitchen', 'dining-room', 'office', 'bathroom'] },
    styles: { type: 'string', default: 'modern, scandinavian, industrial', label: 'Styles (comma-separated)' },
    budget: { type: 'select', default: 'mid-range', label: 'Budget', options: ['budget', 'mid-range', 'luxury'] },
  },
  prompt: { system: 'You are an interior designer.', task: 'Create staged room designs.', outputFormat: { type: 'json' } },
  tools: { bonzai: [], mcp: [] },
  execution: {
    type: 'javascript',
    entrypoint: 'execute',
    async execute(inputs, context) {
      const { roomPhoto, roomType, styles, budget } = inputs;
      const styleList = styles.split(',').map(s => s.trim());
      const hasRoomPhoto = roomPhoto && roomPhoto.length > 100;

      context.updateStatus?.('Loading AI model...');
      await ensureLLMLoaded();

      context.updateStatus?.('Creating design concepts...');
      const designPrompt = `Create staged ${roomType} designs for styles: ${styleList.join(', ')}
Budget: ${budget}

Output JSON with "designs" array. Each design has:
- "style": Style name
- "concept": Design concept
- "imagePrompt": Detailed interior design prompt

Return ONLY valid JSON.`;

      const designResponse = await generateText(designPrompt);
      let designPlan;
      try {
        designPlan = extractJSON(designResponse);
      } catch (e) {
        throw new Error(`Failed to parse designs: ${e.message}`);
      }

      context.updateStatus?.('Freeing memory...');
      await unloadLLM();

      context.updateStatus?.('Rendering staged rooms...');
      for (let i = 0; i < designPlan.designs.length; i++) {
        const design = designPlan.designs[i];
        context.updateStatus?.(`Rendering ${design.style} (${i + 1}/${designPlan.designs.length})...`);
        try {
          const prompt = `${design.imagePrompt}, professional real estate photography, 4k`;
          let imageResult;
          if (hasRoomPhoto) {
            imageResult = await editImage(roomPhoto, prompt, { strength: 0.7 });
          } else {
            imageResult = await generateImage(prompt, { width: 1344, height: 768 });
          }
          design.image = imageResult.image_base64 || imageResult.image;
        } catch (e) {
          design.image = null;
        }
      }

      return { success: true, staging: designPlan, meta: { roomType, styleCount: designPlan.designs.length } };
    },
  },
  metadata: { createdAt: '2025-01-25T00:00:00Z', updatedAt: '2025-01-25T00:00:00Z', license: 'MIT' },
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. VIRTUAL TRY-ON (Fashion) - Formerly Personal Lookbook
// ═══════════════════════════════════════════════════════════════════════════

export const virtualTryOn = createSkillDefinition({
  id: 'virtual-try-on-v1.0.0',
  name: 'Virtual Try-On',
  description: 'See how clothes, accessories, and styles look on you before buying.',
  version: '1.0.0',
  author: { address: '0x8Ff3b2e823b33BeE30e699bB1b6BBc8F622fEa89', name: 'BonzAI', verified: true },
  category: 'fashion',
  tags: ['fashion', 'try-on', 'clothing', 'style', 'virtual-fitting'],
  requirements: {
    minLevel: 3,
    requiredApis: ['llm', 'image'],
    requiredPermissions: [],
  },
  inputs: {
    userPhoto: { type: 'image', default: '', label: 'Your Photo', description: 'Full body or upper body photo' },
    itemDescription: { type: 'string', default: '', label: 'Item to Try On', description: 'Describe the clothing item (e.g., "red leather jacket", "blue evening gown")' },
    itemCategory: { type: 'select', default: 'top', label: 'Category', options: ['top', 'bottom', 'dress', 'outerwear', 'accessory', 'full-outfit'] },
    style: { type: 'select', default: 'realistic', label: 'Style', options: ['realistic', 'fashion-shoot', 'editorial', 'casual', 'glamorous'] },
    variations: { type: 'number', default: 3, min: 1, max: 6, label: 'Number of Variations' },
  },
  prompt: { system: 'You are a fashion stylist.', task: 'Create virtual try-on prompts.', outputFormat: { type: 'json' } },
  tools: { bonzai: [], mcp: [] },
  execution: {
    type: 'javascript',
    entrypoint: 'execute',
    async execute(inputs, context) {
      const { userPhoto, itemDescription, itemCategory, style, variations } = inputs;
      const hasUserPhoto = userPhoto && userPhoto.length > 100;

      if (!hasUserPhoto) {
        throw new Error('Please upload a photo of yourself for the virtual try-on experience.');
      }

      context.updateStatus?.('Loading AI model...');
      await ensureLLMLoaded();

      context.updateStatus?.('Creating try-on variations...');
      const tryOnPrompt = `Create ${variations} virtual try-on variations for: ${itemDescription}
Category: ${itemCategory}
Style: ${style}

Output JSON with "tryOns" array. Each has:
- "name": Variation name
- "description": Brief description
- "imagePrompt": Detailed prompt to transform the photo with this item
- "stylingTip": One styling tip

Return ONLY valid JSON.`;

      const tryOnResponse = await generateText(tryOnPrompt);
      let tryOnPlan;
      try {
        tryOnPlan = extractJSON(tryOnResponse);
      } catch (e) {
        throw new Error(`Failed to parse try-on plan: ${e.message}`);
      }

      context.updateStatus?.('Freeing memory...');
      await unloadLLM();

      context.updateStatus?.('Generating try-on images...');
      const results = [];
      for (let i = 0; i < tryOnPlan.tryOns.length; i++) {
        const tryOn = tryOnPlan.tryOns[i];
        context.updateStatus?.(`Creating variation ${i + 1}/${tryOnPlan.tryOns.length}...`);
        try {
          const prompt = `${tryOn.imagePrompt}, ${style} fashion photography, professional lighting, high quality`;
          const imageResult = await editImage(userPhoto, prompt, { strength: 0.65, width: 768, height: 1024 });
          results.push({
            ...tryOn,
            image: imageResult.image_base64 || imageResult.image,
          });
        } catch (e) {
          results.push({ ...tryOn, image: null, error: e.message });
        }
      }

      return {
        success: true,
        tryOns: results,
        item: itemDescription,
        meta: { category: itemCategory, style, variationCount: results.length },
      };
    },
  },
  metadata: { createdAt: '2025-01-25T00:00:00Z', updatedAt: '2025-01-25T00:00:00Z', license: 'MIT' },
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. CHEF'S TABLE (Food)
// ═══════════════════════════════════════════════════════════════════════════

export const chefsTable = createSkillDefinition({
  id: 'chefs-table-v1.0.0',
  name: "Chef's Table",
  description: 'Create restaurant-quality recipes with professional food photography.',
  version: '1.0.0',
  author: { address: '0x8Ff3b2e823b33BeE30e699bB1b6BBc8F622fEa89', name: 'BonzAI', verified: true },
  category: 'food',
  tags: ['cooking', 'recipes', 'food-photography'],
  requirements: {
    minLevel: 3,
    requiredApis: ['llm', 'image'],
    requiredPermissions: [],
  },
  inputs: {
    dish: { type: 'string', default: '', label: 'Dish or Cuisine', description: 'What would you like to cook?' },
    dietaryRestrictions: { type: 'string', default: '', label: 'Dietary Restrictions', description: 'vegetarian, vegan, gluten-free, etc.' },
    skillLevel: { type: 'select', default: 'intermediate', label: 'Skill Level', options: ['beginner', 'intermediate', 'advanced', 'chef'] },
  },
  prompt: { system: 'You are a professional chef.', task: 'Create a detailed recipe.', outputFormat: { type: 'json' } },
  tools: { bonzai: [], mcp: [] },
  execution: {
    type: 'javascript',
    entrypoint: 'execute',
    async execute(inputs, context) {
      const { dish, dietaryRestrictions, skillLevel } = inputs;

      context.updateStatus?.('Loading AI model...');
      await ensureLLMLoaded();

      context.updateStatus?.('Crafting recipe...');
      const recipePrompt = `Create a ${skillLevel}-level recipe for: ${dish}
${dietaryRestrictions ? `Dietary restrictions: ${dietaryRestrictions}` : ''}

Output JSON with:
- "name": Dish name
- "description": Appetizing description
- "prepTime": Prep time
- "cookTime": Cook time
- "servings": Number of servings
- "ingredients": Array of ingredients
- "steps": Array of step-by-step instructions
- "dishImagePrompt": Prompt for plated dish photo
- "tips": Chef's tips

Return ONLY valid JSON.`;

      const recipeResponse = await generateText(recipePrompt);
      let recipe;
      try {
        recipe = extractJSON(recipeResponse);
      } catch (e) {
        throw new Error(`Failed to parse recipe: ${e.message}`);
      }

      context.updateStatus?.('Freeing memory...');
      await unloadLLM();

      context.updateStatus?.('Photographing dish...');
      try {
        const dishResult = await generateImage(`${recipe.dishImagePrompt}, professional food photography, michelin star plating, beautiful lighting`, { width: 1024, height: 1024, quality: true });
        recipe.image = dishResult.image_base64 || dishResult.image;
      } catch (e) {
        recipe.image = null;
      }

      return { success: true, recipe, meta: { skillLevel } };
    },
  },
  metadata: { createdAt: '2025-01-25T00:00:00Z', updatedAt: '2025-01-25T00:00:00Z', license: 'MIT' },
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. ELI5 - Explain Like I'm 5 (Education) - Formerly Lesson Animator
// ═══════════════════════════════════════════════════════════════════════════

export const eli5 = createSkillDefinition({
  id: 'eli5-v1.0.0',
  name: 'ELI5 - Explain Like I\'m 5',
  description: 'Break down complex topics into simple, visual explanations anyone can understand.',
  version: '1.0.0',
  author: { address: '0x8Ff3b2e823b33BeE30e699bB1b6BBc8F622fEa89', name: 'BonzAI', verified: true },
  category: 'education',
  tags: ['education', 'explainer', 'learning', 'eli5', 'simple'],
  requirements: {
    minLevel: 3,
    requiredApis: ['llm', 'image', 'audio'],
    requiredPermissions: [],
  },
  inputs: {
    topic: { type: 'string', default: '', label: 'Topic to Explain', description: 'What concept would you like explained simply?' },
    analogy: { type: 'string', default: '', label: 'Preferred Analogy (Optional)', description: 'e.g., "using food", "using sports", "using animals"' },
    includeAudio: { type: 'boolean', default: true, label: 'Include Audio Explanation' },
  },
  prompt: { system: 'You explain complex topics simply.', task: 'Create an ELI5 explanation.', outputFormat: { type: 'json' } },
  tools: { bonzai: [], mcp: [] },
  execution: {
    type: 'javascript',
    entrypoint: 'execute',
    async execute(inputs, context) {
      const { topic, analogy, includeAudio } = inputs;

      context.updateStatus?.('Loading AI model...');
      await ensureLLMLoaded();

      context.updateStatus?.('Creating simple explanation...');
      const eli5Prompt = `Explain "${topic}" like I'm 5 years old.
${analogy ? `Use analogies related to: ${analogy}` : 'Use simple, everyday analogies.'}

Output JSON with:
- "title": Simple title
- "oneLiner": One sentence summary a child could understand
- "explanation": Full ELI5 explanation (3-5 short paragraphs, simple words)
- "analogy": The main analogy used
- "funFact": One fun fact about this topic
- "imagePrompt": Prompt for a cute, colorful illustration of the analogy
- "keyPoints": Array of 3 simple takeaways

Return ONLY valid JSON.`;

      const eli5Response = await generateText(eli5Prompt);
      let explanation;
      try {
        explanation = extractJSON(eli5Response);
      } catch (e) {
        throw new Error(`Failed to parse explanation: ${e.message}`);
      }

      context.updateStatus?.('Freeing memory...');
      await unloadLLM();

      context.updateStatus?.('Creating illustration...');
      try {
        const imgResult = await generateImage(`${explanation.imagePrompt}, cute cartoon style, colorful, friendly, educational illustration for children`, { width: 1024, height: 1024 });
        explanation.image = imgResult.image_base64 || imgResult.image;
      } catch (e) {
        explanation.image = null;
      }

      if (includeAudio) {
        context.updateStatus?.('Recording explanation...');
        try {
          const audioResult = await generateNarration(explanation.explanation, { exaggeration: 0.6 });
          explanation.audio = audioResult.audio_path || audioResult.audio;
        } catch (e) {
          explanation.audio = null;
        }
      }

      return { success: true, explanation, meta: { topic, hasAudio: !!explanation.audio } };
    },
  },
  metadata: { createdAt: '2025-01-25T00:00:00Z', updatedAt: '2025-01-25T00:00:00Z', license: 'MIT' },
});

// ═══════════════════════════════════════════════════════════════════════════
// 7. MUSIC VIDEO FORGE (Entertainment)
// ═══════════════════════════════════════════════════════════════════════════

export const musicVideoForge = createSkillDefinition({
  id: 'music-video-forge-v1.0.0',
  name: 'Music Video Forge',
  description: 'Create music video visuals with AI-generated imagery and animations.',
  version: '1.0.0',
  author: { address: '0x8Ff3b2e823b33BeE30e699bB1b6BBc8F622fEa89', name: 'BonzAI', verified: true },
  category: 'entertainment',
  tags: ['music', 'video', 'visuals', 'creative'],
  requirements: {
    minLevel: 4,
    requiredApis: ['llm', 'image', 'video'],
    requiredPermissions: [],
  },
  inputs: {
    mood: { type: 'string', default: '', label: 'Mood / Theme', description: 'Describe the feeling of your music' },
    visualStyle: { type: 'select', default: 'abstract', label: 'Visual Style', options: ['abstract', 'nature', 'urban', 'surreal', 'minimalist', 'retro', 'futuristic'] },
    sceneCount: { type: 'number', default: 4, min: 2, max: 8, label: 'Number of Scenes' },
  },
  prompt: { system: 'You are a music video director.', task: 'Create music video concept.', outputFormat: { type: 'json' } },
  tools: { bonzai: [], mcp: [] },
  execution: {
    type: 'javascript',
    entrypoint: 'execute',
    async execute(inputs, context) {
      const { mood, visualStyle, sceneCount } = inputs;

      context.updateStatus?.('Loading AI model...');
      await ensureLLMLoaded();

      context.updateStatus?.('Creating video concept...');
      const conceptPrompt = `Create a music video concept for mood: ${mood}
Style: ${visualStyle}

Output JSON with:
- "title": Video title
- "scenes": Array of ${sceneCount} scenes, each with:
  - "description": Scene description
  - "imagePrompt": Detailed ${visualStyle} style image prompt
  - "motionDescription": How it should animate

Return ONLY valid JSON.`;

      const conceptResponse = await generateText(conceptPrompt);
      let concept;
      try {
        concept = extractJSON(conceptResponse);
      } catch (e) {
        throw new Error(`Failed to parse concept: ${e.message}`);
      }

      context.updateStatus?.('Freeing memory...');
      await unloadLLM();

      context.updateStatus?.('Generating visuals...');
      for (let i = 0; i < concept.scenes.length; i++) {
        const scene = concept.scenes[i];
        context.updateStatus?.(`Creating scene ${i + 1}/${concept.scenes.length}...`);
        try {
          const imgResult = await generateImage(`${scene.imagePrompt}, ${visualStyle} aesthetic, cinematic`, { width: 1024, height: 576 });
          scene.image = imgResult.image_base64 || imgResult.image;

          context.updateStatus?.(`Animating scene ${i + 1}...`);
          const videoResult = await generateVideo(scene.image, scene.motionDescription, { frames: 37, fps: 12, height: 480, width: 352 });
          scene.video = videoResult.video_path || videoResult.video;
        } catch (e) {
          scene.image = null;
          scene.video = null;
        }
      }

      return { success: true, musicVideo: concept, meta: { mood, visualStyle, sceneCount: concept.scenes.length } };
    },
  },
  metadata: { createdAt: '2025-01-25T00:00:00Z', updatedAt: '2025-01-25T00:00:00Z', license: 'MIT' },
});

// ═══════════════════════════════════════════════════════════════════════════
// 8. GAME MAKER (Entertainment) - Formerly Game Asset Foundry
// ═══════════════════════════════════════════════════════════════════════════

export const gameMaker = createSkillDefinition({
  id: 'game-maker-v1.0.0',
  name: 'Game Maker',
  description: 'Create complete 2D or 3D game concepts with characters, environments, items, and game design documents.',
  version: '1.0.0',
  author: { address: '0x8Ff3b2e823b33BeE30e699bB1b6BBc8F622fEa89', name: 'BonzAI', verified: true },
  category: 'entertainment',
  tags: ['game', 'gamedev', '2d', '3d', 'creative', 'assets'],
  requirements: {
    minLevel: 5,
    requiredApis: ['llm', 'image', '3d'],
    requiredPermissions: [],
  },
  inputs: {
    gameIdea: { type: 'string', default: '', label: 'Game Idea', description: 'Describe your game concept' },
    gameType: { type: 'select', default: 'platformer', label: 'Game Type', options: ['platformer', 'rpg', 'puzzle', 'action', 'adventure', 'simulation', 'horror', 'casual'] },
    artStyle: { type: 'select', default: 'pixel-art', label: 'Art Style', options: ['pixel-art', 'cartoon', 'anime', 'realistic', 'low-poly', 'voxel', 'hand-drawn'] },
    dimension: { type: 'select', default: '2d', label: 'Dimension', options: ['2d', '3d'] },
  },
  prompt: { system: 'You are a game designer.', task: 'Create a complete game design.', outputFormat: { type: 'json' } },
  tools: { bonzai: [], mcp: [] },
  execution: {
    type: 'javascript',
    entrypoint: 'execute',
    async execute(inputs, context) {
      const { gameIdea, gameType, artStyle, dimension } = inputs;

      context.updateStatus?.('Loading AI model...');
      await ensureLLMLoaded();

      context.updateStatus?.('Designing your game...');
      const designPrompt = `Design a ${dimension} ${gameType} game based on: ${gameIdea}
Art style: ${artStyle}

Output JSON with:
- "title": Game title
- "tagline": One-line pitch
- "story": Brief story synopsis
- "mechanics": Array of 3-5 core game mechanics
- "characters": Array of 2-3 characters with name, role, description, imagePrompt
- "environments": Array of 2-3 environments with name, description, imagePrompt
- "items": Array of 3-5 items/power-ups with name, description, imagePrompt
- "uiElements": Array of UI element descriptions

Return ONLY valid JSON.`;

      const designResponse = await generateText(designPrompt);
      let gameDesign;
      try {
        gameDesign = extractJSON(designResponse);
      } catch (e) {
        throw new Error(`Failed to parse game design: ${e.message}`);
      }

      context.updateStatus?.('Freeing memory...');
      await unloadLLM();

      // Generate character sprites
      context.updateStatus?.('Creating characters...');
      for (let i = 0; i < gameDesign.characters.length; i++) {
        const char = gameDesign.characters[i];
        try {
          const imgResult = await generateImage(`${char.imagePrompt}, ${artStyle} style, game character, transparent background concept`, { width: 512, height: 512 });
          char.image = imgResult.image_base64 || imgResult.image;
        } catch (e) {
          char.image = null;
        }
      }

      // Generate environments
      context.updateStatus?.('Creating environments...');
      for (let i = 0; i < gameDesign.environments.length; i++) {
        const env = gameDesign.environments[i];
        try {
          const imgResult = await generateImage(`${env.imagePrompt}, ${artStyle} style, game environment, ${dimension === '2d' ? 'side-scrolling background' : '3D render'}`, { width: 1024, height: 576 });
          env.image = imgResult.image_base64 || imgResult.image;
        } catch (e) {
          env.image = null;
        }
      }

      // Generate items
      context.updateStatus?.('Creating items...');
      for (let i = 0; i < gameDesign.items.length; i++) {
        const item = gameDesign.items[i];
        try {
          const imgResult = await generateImage(`${item.imagePrompt}, ${artStyle} style, game item icon, clean design`, { width: 256, height: 256 });
          item.image = imgResult.image_base64 || imgResult.image;
        } catch (e) {
          item.image = null;
        }
      }

      return { success: true, game: gameDesign, meta: { gameType, artStyle, dimension } };
    },
  },
  metadata: { createdAt: '2025-01-25T00:00:00Z', updatedAt: '2025-01-25T00:00:00Z', license: 'MIT' },
});

// ═══════════════════════════════════════════════════════════════════════════
// 9. MANGA TO ANIME (Reading) - Formerly Book Trailer Studio
// ═══════════════════════════════════════════════════════════════════════════

export const mangaToAnime = createSkillDefinition({
  id: 'manga-to-anime-v1.0.0',
  name: 'Manga to Anime',
  description: 'Transform manga panels or story concepts into animated anime sequences.',
  version: '1.0.0',
  author: { address: '0x8Ff3b2e823b33BeE30e699bB1b6BBc8F622fEa89', name: 'BonzAI', verified: true },
  category: 'entertainment',
  tags: ['manga', 'anime', 'animation', 'japanese', 'creative'],
  requirements: {
    minLevel: 4,
    requiredApis: ['llm', 'image', 'video'],
    requiredPermissions: [],
  },
  inputs: {
    mangaPanel: { type: 'image', default: '', label: 'Manga Panel (Optional)', description: 'Upload a manga panel to animate' },
    sceneDescription: { type: 'string', default: '', label: 'Scene Description', description: 'Describe the scene if no image uploaded' },
    animeStyle: { type: 'select', default: 'shonen', label: 'Anime Style', options: ['shonen', 'shojo', 'seinen', 'slice-of-life', 'mecha', 'isekai', 'horror'] },
    motionType: { type: 'select', default: 'action', label: 'Motion Type', options: ['action', 'emotional', 'comedic', 'dramatic', 'peaceful', 'intense'] },
  },
  prompt: { system: 'You are an anime director.', task: 'Create anime sequences.', outputFormat: { type: 'json' } },
  tools: { bonzai: [], mcp: [] },
  execution: {
    type: 'javascript',
    entrypoint: 'execute',
    async execute(inputs, context) {
      const { mangaPanel, sceneDescription, animeStyle, motionType } = inputs;
      const hasMangaPanel = mangaPanel && mangaPanel.length > 100;

      context.updateStatus?.('Loading AI model...');
      await ensureLLMLoaded();

      context.updateStatus?.('Creating anime sequence...');
      const animePrompt = `Create an anime sequence for a ${animeStyle} style scene.
Scene: ${sceneDescription || 'A dramatic manga panel'}
Motion type: ${motionType}

Output JSON with:
- "title": Scene title
- "keyFrames": Array of 3 key frames, each with:
  - "description": What happens in this frame
  - "imagePrompt": Detailed anime-style image prompt
  - "motion": How this frame should animate
  - "dialogue": Any dialogue (or null)
- "soundEffects": Array of suggested sound effects
- "mood": Overall mood

Return ONLY valid JSON.`;

      const animeResponse = await generateText(animePrompt);
      let animeSequence;
      try {
        animeSequence = extractJSON(animeResponse);
      } catch (e) {
        throw new Error(`Failed to parse anime sequence: ${e.message}`);
      }

      context.updateStatus?.('Freeing memory...');
      await unloadLLM();

      // Generate key frames
      context.updateStatus?.('Drawing key frames...');
      for (let i = 0; i < animeSequence.keyFrames.length; i++) {
        const frame = animeSequence.keyFrames[i];
        context.updateStatus?.(`Drawing frame ${i + 1}/${animeSequence.keyFrames.length}...`);
        try {
          let imageResult;
          const prompt = `${frame.imagePrompt}, ${animeStyle} anime style, high quality animation frame, vibrant colors`;

          if (hasMangaPanel && i === 0) {
            // Use manga panel as base for first frame
            imageResult = await editImage(mangaPanel, prompt, { strength: 0.7, width: 1024, height: 576 });
          } else {
            imageResult = await generateImage(prompt, { width: 1024, height: 576 });
          }
          frame.image = imageResult.image_base64 || imageResult.image;

          // Animate the frame
          context.updateStatus?.(`Animating frame ${i + 1}...`);
          const videoResult = await generateVideo(frame.image, `${frame.motion}, anime animation, smooth motion`, { frames: 37, fps: 12, height: 480, width: 352 });
          frame.video = videoResult.video_path || videoResult.video;
        } catch (e) {
          frame.image = null;
          frame.video = null;
        }
      }

      return { success: true, anime: animeSequence, meta: { animeStyle, motionType, frameCount: animeSequence.keyFrames.length } };
    },
  },
  metadata: { createdAt: '2025-01-25T00:00:00Z', updatedAt: '2025-01-25T00:00:00Z', license: 'MIT' },
});

// ═══════════════════════════════════════════════════════════════════════════
// 10. HAIRSTYLE STUDIO (Personal Care)
// ═══════════════════════════════════════════════════════════════════════════

export const hairstyleStudio = createSkillDefinition({
  id: 'hairstyle-studio-v1.0.0',
  name: 'Hairstyle Studio',
  description: 'Visualize different hairstyles and colors on your photo.',
  version: '1.0.0',
  author: { address: '0x8Ff3b2e823b33BeE30e699bB1b6BBc8F622fEa89', name: 'BonzAI', verified: true },
  category: 'personal-care',
  tags: ['hairstyle', 'beauty', 'transformation'],
  requirements: {
    minLevel: 3,
    requiredApis: ['llm', 'image'],
    requiredPermissions: [],
  },
  inputs: {
    userPhoto: { type: 'image', default: '', label: 'Your Photo' },
    desiredStyles: { type: 'string', default: 'bob, layers, pixie', label: 'Styles to Try (comma-separated)' },
    colorOptions: { type: 'string', default: '', label: 'Colors to Try (optional)' },
  },
  prompt: { system: 'You are a hairstylist.', task: 'Create hairstyle recommendations.', outputFormat: { type: 'json' } },
  tools: { bonzai: [], mcp: [] },
  execution: {
    type: 'javascript',
    entrypoint: 'execute',
    async execute(inputs, context) {
      const { userPhoto, desiredStyles, colorOptions } = inputs;
      const styles = desiredStyles.split(',').map(s => s.trim());
      const hasUserPhoto = userPhoto && userPhoto.length > 100;

      context.updateStatus?.('Loading AI model...');
      await ensureLLMLoaded();

      context.updateStatus?.('Creating hairstyle recommendations...');
      const stylePrompt = `Create hairstyle visualizations for: ${styles.join(', ')}
${colorOptions ? `Colors: ${colorOptions}` : ''}

Output JSON with "recommendations" array. Each has:
- "name": Style name
- "description": Description
- "imagePrompt": Detailed prompt for this hairstyle

Return ONLY valid JSON.`;

      const styleResponse = await generateText(stylePrompt);
      let styleGuide;
      try {
        styleGuide = extractJSON(styleResponse);
      } catch (e) {
        throw new Error(`Failed to parse styles: ${e.message}`);
      }

      context.updateStatus?.('Freeing memory...');
      await unloadLLM();

      context.updateStatus?.('Visualizing hairstyles...');
      for (let i = 0; i < styleGuide.recommendations.length; i++) {
        const rec = styleGuide.recommendations[i];
        context.updateStatus?.(`Rendering ${rec.name} (${i + 1}/${styleGuide.recommendations.length})...`);
        try {
          const prompt = `${rec.imagePrompt}, professional salon photography, beautiful lighting`;
          let imageResult;
          if (hasUserPhoto) {
            imageResult = await editImage(userPhoto, prompt, { strength: 0.65, width: 768, height: 1024 });
          } else {
            imageResult = await generateImage(prompt, { width: 768, height: 1024 });
          }
          rec.image = imageResult.image_base64 || imageResult.image;
        } catch (e) {
          rec.image = null;
        }
      }

      return { success: true, styleGuide, meta: { stylesGenerated: styleGuide.recommendations.length } };
    },
  },
  metadata: { createdAt: '2025-01-25T00:00:00Z', updatedAt: '2025-01-25T00:00:00Z', license: 'MIT' },
});

// ═══════════════════════════════════════════════════════════════════════════
// 11. ROLEPLAY COMPANION (Entertainment) - Chat-based skill
// ═══════════════════════════════════════════════════════════════════════════

export const roleplayCompanion = createSkillDefinition({
  id: 'roleplay-companion-v1.0.0',
  name: 'Roleplay Companion',
  description: 'Immersive roleplay experiences with AI characters that respond with text, images, and audio.',
  version: '1.0.0',
  author: { address: '0x8Ff3b2e823b33BeE30e699bB1b6BBc8F622fEa89', name: 'BonzAI', verified: true },
  category: 'entertainment',
  tags: ['roleplay', 'chat', 'character', 'interactive', 'creative', 'companion'],
  featured: true,
  requirements: {
    minLevel: 4,
    requiredApis: ['llm', 'image', 'audio'],
    requiredPermissions: [],
  },
  // Chat-based skill flag - UI will render chat interface instead of form
  chatBased: true,
  // References to predefined data
  predefinedCompanions: PREDEFINED_COMPANIONS,
  predefinedScenarios: PREDEFINED_SCENARIOS,
  contentLevels: CONTENT_LEVELS,
  // Inputs for session setup (not per-message)
  inputs: {
    companionId: { type: 'select', default: '', label: 'Choose Companion', options: PREDEFINED_COMPANIONS.map(c => c.id), description: 'Select a predefined companion or create custom' },
    customCompanion: { type: 'object', default: null, label: 'Custom Companion', description: 'Custom companion definition (name, description, personality, appearance, background)' },
    scenarioId: { type: 'select', default: '', label: 'Choose Scenario', options: PREDEFINED_SCENARIOS.map(s => s.id), description: 'Select a predefined scenario or create custom' },
    customScenario: { type: 'object', default: null, label: 'Custom Scenario', description: 'Custom scenario definition (name, description, setting, mood)' },
    contentLevel: { type: 'select', default: 'pg13', label: 'Content Level', options: ['pg', 'pg13', 'mature', 'adult'] },
    responseMode: { type: 'select', default: 'text+image', label: 'Response Mode', options: ['text', 'text+image', 'text+audio', 'text+image+audio', 'text+image+video', 'text+image+audio+video'] },
  },
  prompt: { system: 'You are an immersive roleplay character.', task: 'Respond in character.', outputFormat: { type: 'json' } },
  tools: { bonzai: [], mcp: [] },
  execution: {
    type: 'chat', // Chat-based execution
    entrypoint: 'executeMessage',
    /**
     * Execute a single chat message in the roleplay session
     * @param {Object} params - Execution parameters
     * @param {string} params.userMessage - The user's message
     * @param {Object} params.session - Session state (companion, scenario, history)
     * @param {Object} params.settings - Content level and response mode
     * @param {Object} params.sceneState - Scene state for smart image generation
     * @param {Object} params.visionData - Vision analysis data from uploaded image
     * @param {Object} context - Execution context
     */
    async executeMessage({ userMessage, session, settings, sceneState = {}, visionData = null }, context) {
      const { companion, scenario, history = [] } = session;
      const { contentLevel, responseMode, autonomousMode = false, forceVisualize = false, forceLocationChange = false } = settings;

      const includeImage = responseMode.includes('image');
      const includeAudio = responseMode.includes('audio');
      const includeVideo = responseMode.includes('video');
      const isAdult = contentLevel === 'adult';
      const contentConfig = CONTENT_LEVELS[contentLevel];

      console.log(`[Roleplay] executeMessage settings: contentLevel="${contentLevel}", isAdult=${isAdult}`);

      // Scene state defaults
      const {
        lastImageAt = -IMAGE_GENERATION_CONFIG.MIN_MESSAGES_BETWEEN_IMAGES,
        currentLocation = scenario?.setting || '',
        recentEmotions = [],
        recentActions = [],
        lastOpeningPhrase = '',
        relationshipState: savedRelationshipState,
      } = sceneState;

      const messageIndex = history.length;

      // Rebuild relationship state if missing or outdated (for older saved sessions)
      let relationshipState = savedRelationshipState;
      if (!relationshipState || (relationshipState.level === 'strangers' && history.length > 5)) {
        relationshipState = rebuildRelationshipFromHistory(history);
      }

      // Build relationship context for the prompt
      const relationshipContext = buildRelationshipContext(relationshipState, messageIndex);
      const messagesSinceLastImage = messageIndex - lastImageAt;

      // Build character description
      const characterDesc = `
Name: ${companion.name}
Personality: ${companion.personality}
Appearance: ${companion.appearance}
Background: ${companion.background}
Voice Style: ${companion.voiceStyle || 'Natural and engaging'}
      `.trim();

      // Build scenario context
      const scenarioContext = scenario ? `
Setting: ${scenario.setting}
Mood: ${scenario.mood}
Scene: ${scenario.description}
      `.trim() : 'A casual conversation';

      // Build conversation history (last 10 messages for context)
      const recentHistory = history.slice(-10).map(h =>
        h.role === 'user' ? `User: ${h.content}` : `${companion.name}: ${h.content}`
      ).join('\n');

      // Build anti-repetition context
      const recentEmotionsStr = recentEmotions.slice(-3).join(', ');
      const recentActionsStr = recentActions.slice(-2).join('; ');

      context.updateStatus?.('Loading language model...');
      await ensureLLMLoaded(ROLEPLAY_LLM);

      context.updateStatus?.(`${companion.name} is thinking...`);

      // Build smart image generation instructions
      let imageInstructions = '';
      if (includeImage) {
        if (forceVisualize || autonomousMode) {
          // Autonomous mode: always generate images
          imageInstructions = `
IMAGE GENERATION (AUTONOMOUS MODE):
You MUST set "shouldVisualize": true for this message.
Generate an image showing ${companion.name} in their current activity.
Make the image prompt specific and detailed about:
- What ${companion.name} is physically doing right now
- Their pose, expression, and body language
- The environment/setting around them
${forceLocationChange ? `- IMPORTANT: ${companion.name} is in a NEW LOCATION - describe it in "newLocation" field` : ''}
`;
        } else {
          imageInstructions = `
IMAGE GENERATION DECISION (CRITICAL - READ CAREFULLY):
You MUST set "shouldVisualize" to decide if a new image is needed. DEFAULT TO FALSE.

Set "shouldVisualize": TRUE only for these MAJOR events:
- Location/setting PHYSICALLY CHANGES (current: "${currentLocation}")
- A NEW character appears in the scene for the first time
- MAJOR physical action: combat, intimacy, transformation, dramatic costume change
- CLIMACTIC emotional moment that changes the visual scene

Set "shouldVisualize": FALSE for (this is the DEFAULT):
- Normal conversation and dialogue (most messages!)
- Emotional reactions without physical scene change
- Continuing the same activity in the same place
- Minor gestures, smiles, expressions (these don't need images)
- Any time you're unsure - default to FALSE

IMPORTANT: Images are expensive and slow. Most responses (70-80%) should have shouldVisualize: FALSE.
Last image was ${messagesSinceLastImage} messages ago. Only set TRUE if something visually significant happens.
`;
        }
      }

      // Build anti-repetition instructions
      const antiRepetitionInstructions = `
RESPONSE VARIETY RULES (CRITICAL - FOLLOW STRICTLY):
- NEVER repeat the same emotion 3 times in a row. Recent emotions: [${recentEmotionsStr || 'none'}]
- NEVER start responses the same way. Avoid starting with: "${lastOpeningPhrase || 'none'}"
- Vary your sentence structure and vocabulary
- Reference specific things the user said or did
- Advance the scene/narrative with each response - something new must happen
- Recent actions taken: [${recentActionsStr || 'none'}] - do something DIFFERENT
- If you feel stuck, introduce: a new topic, an unexpected observation, a mood shift, or physical movement
`;

      // Build vision context if user uploaded an image
      const visionContext = visionData?.imageAnalysis ? `
VISUAL CONTEXT (User shared an image):
The user has shared an image with you. Here's what you see:
${visionData.imageAnalysis}

IMPORTANT: Incorporate what you see in the image into your response. React to it naturally in character.
If the image shows the user or someone they're describing, acknowledge their appearance.
If it shows a place or object, comment on it and integrate it into the scene.
` : '';

      const roleplayPrompt = `You are ${companion.name}, an immersive roleplay character.

CRITICAL RULES:
- You are ONLY ${companion.name}. NEVER write dialogue or actions for the user.
- NEVER start your response with what the user says, does, or thinks.
- NEVER write "User:", "[User]", or any text from the user's perspective.
- Your "response" field contains ONLY ${companion.name}'s words, thoughts, and actions.
- The user controls their own character - you control ONLY ${companion.name}.

CHARACTER:
${characterDesc}

SCENARIO:
${scenarioContext}
${relationshipContext}${visionContext}
CONTENT GUIDELINES:
${contentConfig.guidelines}
${antiRepetitionInstructions}
${imageInstructions}
${recentHistory ? `CONVERSATION SO FAR:\n${recentHistory}\n` : ''}
USER SAYS/DOES: "${userMessage}"

Respond ONLY as ${companion.name}. Be immersive, descriptive, and stay in character.
DO NOT write the user's response or actions - only ${companion.name}'s perspective.

OUTPUT FORMAT - STRICT JSON ONLY:
You MUST output a single valid JSON object. NO prose, NO character names before text, NO numbered lists, NO markdown.
Do NOT write "${companion.name}:" or any prefix. Do NOT write "Emotion:" as a label. ONLY output the JSON object.

{
  "response": "Your in-character response here (2-4 paragraphs, descriptive and immersive. Write ONLY as ${companion.name}. Never mention 'the user' - write as if speaking TO them directly.)",
  "emotion": "single word from: happy, sad, flirty, angry, shy, playful, nervous, loving, content, curious, surprised, confident, teasing, longing, breathless, aroused, passionate, overwhelmed, ecstatic. For physical intimacy use: aroused, passionate, breathless, overwhelmed, ecstatic. MUST be DIFFERENT from recent: [${recentEmotionsStr}]",
  "action": "Physical action description (what you're doing, body language) - DIFFERENT from recent",
  "newLocation": null or "new location description if setting changed",
  ${includeImage ? `"shouldVisualize": true or false based on IMAGE GENERATION RULES,
  "imagePrompt": "scene description if shouldVisualize is true - pose, action, expression, clothing, lighting",` : ''}
  "suggestedResponses": ["short reply 1", "short reply 2", "short reply 3"]
}

CRITICAL: Output ONLY the JSON object above. No other text.`;

      let roleplayResponse = await generateTextWithModel(roleplayPrompt, '', ROLEPLAY_LLM);
      let response;
      try {
        response = extractJSON(roleplayResponse);
      } catch (e) {
        throw new Error(`Failed to parse response: ${e.message}`);
      }

      // Clean up response content - remove "Companion:", "User:", character name prefixes, etc.
      if (response.response) {
        response.response = response.response
          .replace(/^(Companion|User|Assistant|\w+):\s*/gi, '') // Remove prefix at start
          .replace(/\n(Companion|User|Assistant):\s*/gi, '\n') // Remove prefixes after newlines
          .replace(new RegExp(`^${companion.name}:\\s*`, 'i'), '') // Remove character name prefix
          .trim();
      }

      // Clean up suggested responses - remove "User:", "Companion:", numbers, etc.
      if (response.suggestedResponses && Array.isArray(response.suggestedResponses)) {
        response.suggestedResponses = response.suggestedResponses.map(s => {
          return s
            .replace(/^(User|Companion|Assistant|\d+[\.\)]\s*):\s*/gi, '') // Remove role prefixes
            .replace(/^["']|["']$/g, '') // Remove surrounding quotes
            .replace(/^\d+[\.\)]\s*/, '') // Remove numbered list prefixes like "1." or "1)"
            .trim();
        }).filter(s => s.length > 0);
      }

      // Streaming callback - notify text is ready
      console.log(`[Roleplay] Text ready, response.response length: ${response.response?.length || 0}, preview: "${response.response?.substring(0, 50) || 'EMPTY'}"`);
      if (context.onProgress) {
        context.onProgress({
          type: 'text',
          response: { ...response },
        });
      }

      // Loop detection and recovery
      const loopCheck = detectResponseLoop(response.response, history);
      if (loopCheck.isLoop) {
        console.log(`[Roleplay] Loop detected (similarity: ${loopCheck.similarity.toFixed(2)}), regenerating...`);
        context.updateStatus?.(`${companion.name} reconsiders...`);

        // More aggressive variation prompt
        const variationPrompt = `You are ${companion.name}. The user just said: "${userMessage}"

CRITICAL RULES:
- You are ONLY ${companion.name}. NEVER write dialogue or actions for the user.
- Your response contains ONLY ${companion.name}'s words and actions.

VARIATION INSTRUCTION: Your last responses were TOO SIMILAR. You MUST respond COMPLETELY DIFFERENTLY.

DO NOT:
- Start with the same words or phrases
- Describe the same actions
- Use the same emotional tone
- Repeat any ideas from before

INSTEAD, try ONE of these:
- Change the subject entirely
- Express a contrasting emotion (if you were happy, be pensive; if flirty, be serious)
- Move to a new location or suggest an activity
- Ask the user a surprising question
- Reveal something unexpected about yourself

CHARACTER: ${companion.name} - ${companion.personality}
SETTING: ${scenario?.setting || 'casual setting'}

Respond with JSON:
{
  "response": "Your COMPLETELY DIFFERENT response here (2-3 paragraphs)",
  "emotion": "a DIFFERENT emotion than before",
  "action": "a NEW physical action",
  "shouldVisualize": false,
  "suggestedResponses": ["option 1", "option 2", "option 3"]
}`;

        roleplayResponse = await generateTextWithModel(variationPrompt, '', ROLEPLAY_LLM);
        try {
          const newResponse = extractJSON(roleplayResponse);
          // Only use new response if it's actually different
          const newLoopCheck = detectResponseLoop(newResponse.response, history);
          if (!newLoopCheck.isLoop || newLoopCheck.similarity < loopCheck.similarity) {
            response = newResponse;
            console.log('[Roleplay] Regeneration successful, using new response');
          } else {
            console.warn('[Roleplay] Regeneration still similar, keeping original');
          }
        } catch (e) {
          console.warn('[Roleplay] Regeneration parse failed, using original');
        }
      }

      // Unload LLM before image generation to free memory
      if (includeImage || includeAudio) {
        context.updateStatus?.('Freeing memory...');
        await unloadLLM();
      }

      // Smart image generation with throttling
      // HARD GATES:
      // 1. Never generate images on the first message (let conversation start with text) - unless forceVisualize
      // 2. Never generate images more frequently than MIN_MESSAGES_BETWEEN_IMAGES - unless forceVisualize
      const isFirstMessage = messageIndex < IMAGE_GENERATION_CONFIG.MIN_MESSAGES_BEFORE_FIRST_IMAGE;
      const passesMinimumGate = messagesSinceLastImage >= IMAGE_GENERATION_CONFIG.MIN_MESSAGES_BETWEEN_IMAGES;
      const llmWantsImage = response.shouldVisualize === true;
      const forceImageDueToGap = messagesSinceLastImage >= IMAGE_GENERATION_CONFIG.FORCE_IMAGE_AFTER_MESSAGES;

      // In autonomous mode with forceVisualize, bypass the gates and always generate
      const shouldGenerateImage = forceVisualize
        ? includeImage  // Just check if images are enabled
        : includeImage && !isFirstMessage && passesMinimumGate && (llmWantsImage || forceImageDueToGap);

      console.log(`[Roleplay] Image decision: includeImage=${includeImage}, forceVisualize=${forceVisualize}, isFirstMessage=${isFirstMessage}, passesMinimumGate=${passesMinimumGate} (${messagesSinceLastImage} msgs since last), llmWantsImage=${llmWantsImage}, forceImageDueToGap=${forceImageDueToGap}, RESULT=${shouldGenerateImage}`);

      // If we should generate an image but no imagePrompt exists, create a default one
      // This happens with forceVisualize (autonomous mode) or forceImageDueToGap
      if (shouldGenerateImage && !response.imagePrompt) {
        response.imagePrompt = `${companion.name}, ${companion.appearance}, ${response.emotion || 'neutral'} expression, ${response.action || 'in a dramatic pose'}, ${currentLocation || scenario?.setting || 'beautiful background'}, highly detailed, cinematic lighting`;
        console.log('[Roleplay] Generated default imagePrompt for forced/autonomous image');
      }

      // Generate character image based on content level (only if warranted)
      if (shouldGenerateImage && response.imagePrompt) {
        context.updateStatus?.(`Visualizing ${companion.name}...`);
        try {
          let imageResult;

          // Detect explicit/sexual scenes based on emotion, action, and context
          // Only triggers SDXL when content level is set to "adult"
          const explicitEmotions = ['aroused', 'lustful', 'passionate', 'breathless', 'overwhelmed', 'ecstatic'];
          const explicitKeywords = ['sex', 'fuck', 'thrust', 'moan', 'orgasm', 'cum', 'naked', 'undress', 'intimate', 'penetrat', 'riding', 'sucking', 'licking', 'cock', 'pussy', 'nipple', 'breast'];
          const actionLower = (response.action || '').toLowerCase();
          const emotionLower = (response.emotion || '').toLowerCase();
          const responseLower = (response.response || '').toLowerCase();

          // Explicit scene detection requires adult content level
          const hasExplicitKeywords = explicitKeywords.some(k => actionLower.includes(k)) ||
                                      explicitKeywords.some(k => responseLower.includes(k));
          const hasExplicitEmotion = explicitEmotions.some(e => emotionLower.includes(e));
          const isExplicitScene = isAdult && (hasExplicitKeywords || hasExplicitEmotion);

          // Model selection:
          // - image_standard (SDXL): Only for adult content level with explicit content
          // - image_advanced (Z Turbo): Default for all other content
          // - image_quality (FLUX Krea): For mature content (if configured)
          const imageModel = isExplicitScene ? 'image_standard' : (contentConfig?.imageModel || 'image_advanced');
          console.log(`[Roleplay] Image generation: contentLevel=${contentLevel}, isAdult=${isAdult}, hasExplicitKeywords=${hasExplicitKeywords}, hasExplicitEmotion=${hasExplicitEmotion}, isExplicitScene=${isExplicitScene}, imageModel=${imageModel}`);

          // ═══════════════════════════════════════════════════════════════════
          // CHARACTER CONSISTENCY: Always use companion's full appearance as base
          // ═══════════════════════════════════════════════════════════════════

          // Extract core character features that must remain consistent
          const characterBase = `${companion.name}, ${companion.appearance}`;

          // Style anchors for visual consistency across all images
          const styleAnchors = 'consistent character design, same person, same face, same features';

          // Scene context from LLM (action, emotion, setting)
          const sceneContext = response.imagePrompt;

          // Current setting/location
          const settingContext = response.newLocation || currentLocation || scenario?.setting || '';

          // Vision context - incorporate elements from user's uploaded image if present
          const visionImageContext = visionData?.imageAnalysis
            ? `, incorporating elements from: ${visionData.imageAnalysis.substring(0, 150)}`
            : '';

          // Build prompt with character consistency as foundation
          // Note: isExplicitScene, actionLower, emotionLower, responseLower already defined above for model selection
          let prompt;

          if (isAdult && isExplicitScene) {
            // Adult explicit scene: generate image depicting the sexual activity
            const activityHints = [];
            if (actionLower.includes('riding') || responseLower.includes('riding')) activityHints.push('cowgirl position');
            if (actionLower.includes('behind') || responseLower.includes('behind') || responseLower.includes('doggy')) activityHints.push('doggy style');
            if (actionLower.includes('missionary') || responseLower.includes('missionary')) activityHints.push('missionary position');
            if (actionLower.includes('oral') || actionLower.includes('sucking') || actionLower.includes('blowjob')) activityHints.push('oral sex');
            if (actionLower.includes('kiss') && (actionLower.includes('passionate') || responseLower.includes('passionate'))) activityHints.push('passionate kissing');

            const activityStr = activityHints.length > 0 ? activityHints.join(', ') : 'intimate sexual activity';
            // Character base FIRST, then scene, then explicit modifiers
            prompt = `${characterBase}, ${sceneContext}, ${activityStr}${visionImageContext}, explicit nsfw sex scene, nude, erotic, graphic sexual content, two people having sex, detailed bodies, ${styleAnchors}, high quality, realistic`;
          } else if (isAdult) {
            // Adult/NSFW but not explicit scene
            prompt = `${characterBase}, ${sceneContext}, ${settingContext}${visionImageContext}, explicit, nsfw, sensual, seductive, attractive, ${styleAnchors}, high quality, detailed`;
          } else if (contentLevel === 'mature') {
            // Mature: suggestive but tasteful
            prompt = `${characterBase}, ${sceneContext}, ${settingContext}${visionImageContext}, sensual, alluring, tasteful, ${styleAnchors}, high quality, detailed`;
          } else {
            // PG/PG13: beautiful and clean
            prompt = `${characterBase}, ${sceneContext}, ${settingContext}${visionImageContext}, beautiful, elegant, ${styleAnchors}, high quality, detailed`;
          }

          console.log(`[Roleplay] Image prompt with character consistency: ${prompt.substring(0, 200)}...`);

          // Use appropriate model based on content level (landscape orientation)
          if (imageModel === 'image_standard') {
            // SDXL for explicit/NSFW scenes (uncensored)
            imageResult = await generateImageSDXL(prompt, { width: 1024, height: 768 });
          } else if (imageModel === 'image_quality') {
            // FLUX Krea for mature content (high quality)
            imageResult = await generateImage(prompt, { width: 1024, height: 768, quality: true });
          } else if (imageModel === 'image_advanced') {
            // Z Turbo for general content (pg, pg13, adult non-explicit)
            imageResult = await generateImage(prompt, { width: 1024, height: 768, advanced: true });
          } else {
            // Fallback to Z Turbo (advanced) as default
            imageResult = await generateImage(prompt, { width: 1024, height: 768, advanced: true });
          }
          response.image = imageResult.image_base64 || imageResult.image;

          // Streaming callback - notify image is ready
          if (context.onProgress) {
            context.onProgress({
              type: 'image',
              response: { ...response },
            });
          }

          // Clear memory after image generation
          await clearGenerationMemory();
        } catch (e) {
          console.warn('[Roleplay] Image generation failed:', e.message);
          response.image = null;
        }
      } else if (includeImage && !shouldGenerateImage) {
        // Log why we skipped image generation
        console.log(`[Roleplay] Skipped image: shouldGenerateImage=false (llmWants=${response.shouldVisualize}, forceVisualize=${forceVisualize}, passesGate=${passesMinimumGate}, forceGap=${forceImageDueToGap})`);
        response.image = null;
      }

      // Generate new scenery background when location changes or forced
      const locationChanged = response.newLocation && response.newLocation !== currentLocation;
      const shouldGenerateBackground = includeImage && (locationChanged || forceLocationChange);

      if (shouldGenerateBackground) {
        context.updateStatus?.('Changing scenery...');
        try {
          // Use new location if provided, otherwise generate a variation of current setting
          const locationForBackground = response.newLocation || `${scenario?.setting || 'scenic location'} - new perspective`;
          response.backgroundImage = await generateSceneryBackground(locationForBackground);
          console.log(`[Roleplay] Generated new scenery: ${locationForBackground}`);

          // Streaming callback - notify background image is ready
          if (context.onProgress) {
            context.onProgress({
              type: 'background',
              response: { ...response },
            });
          }

          // Clear memory after background generation
          await clearGenerationMemory();
        } catch (e) {
          console.warn('[Roleplay] Scenery background generation failed:', e.message);
        }
      }

      // Generate voice response using Qwen3-TTS persona (high quality voice design + cloning)
      // If quotes are present, only narrate quoted dialogue
      // If no quotes, narrate the full response (companion is speaking directly)
      if (includeAudio && response.response) {
        // Extract quoted dialogue from the response
        const quoteMatches = response.response.match(/"([^"]+)"/g) || [];
        const dialogueOnly = quoteMatches
          .map(q => q.replace(/"/g, '').trim())
          .filter(q => q.length > 0)
          .join(' ');

        // Use quoted dialogue if present, otherwise use full response
        let textToSpeak = dialogueOnly.length > 0
          ? dialogueOnly
          : response.response
              .replace(/\*[^*]+\*/g, '') // Remove action text in asterisks
              .replace(/^(Companion|User|Assistant|\w+):\s*/gi, '') // Remove role prefixes
              .trim();

        // Additional cleanup for TTS - remove any remaining asterisks or formatting
        textToSpeak = textToSpeak
          .replace(/\*+/g, '') // Remove any remaining asterisks
          .replace(/\s+/g, ' ') // Normalize whitespace
          .trim();

        if (textToSpeak.length > 0) {
          context.updateStatus?.(`${companion.name} is speaking...`);
          try {
            // Use Qwen3-TTS persona for high-quality companion voice
            const audioResult = await generateNarration(textToSpeak, {
              companion, // Pass full companion object for persona voice design
              emotion: response.emotion, // Pass emotion for voice tone/pace
              action: response.action, // Pass action for additional context
            });
            response.audio = audioResult.audio_path || audioResult.audio;

            // Streaming callback - notify audio is ready
            if (context.onProgress) {
              context.onProgress({
                type: 'audio',
                response: { ...response },
              });
            }

            // Clear memory after audio generation
            await clearGenerationMemory();
          } catch (e) {
            console.warn('[Roleplay] Audio generation failed:', e.message);
            response.audio = null;
          }
        }
      }

      // ═══════════════════════════════════════════════════════════════════════════
      // VIDEO GENERATION FOR PEAK EMOTIONS (LTX-2 I2V)
      // ═══════════════════════════════════════════════════════════════════════════
      const peakEmotions = ['excited', 'aroused', 'passionate', 'ecstatic', 'overwhelmed', 'climax', 'orgasmic', 'breathless', 'longing', 'lustful'];
      const videoEmotionLower = (response.emotion || '').toLowerCase();
      const isPeakEmotion = peakEmotions.some(e => videoEmotionLower.includes(e));

      console.log(`[Roleplay] Video check: includeVideo=${includeVideo}, hasImage=${!!response.image}, emotion=${videoEmotionLower}, isPeakEmotion=${isPeakEmotion}`);

      // If video is enabled but no image exists, generate one for the video
      if (includeVideo && !response.image && isPeakEmotion) {
        console.log('[Roleplay] Video needs image - generating image first for video input');
        context.updateStatus?.(`Preparing visual for video...`);
        try {
          // Generate image prompt if not available
          const videoImagePrompt = response.imagePrompt ||
            `${companion.name}, ${companion.appearance}, ${response.emotion || 'expressive'} expression, ${response.action || 'dramatic pose'}, cinematic lighting, high quality`;

          // Use SDXL for video frames (better quality for animation)
          const videoImageResult = await generateImageSDXL(
            `${companion.name}, ${companion.appearance}, ${videoImagePrompt}, cinematic, film still, high quality`,
            { width: 1024, height: 768 }
          );
          response.image = videoImageResult.image_base64 || videoImageResult.image;
          console.log('[Roleplay] Generated image for video input');

          // Notify UI of image
          if (context.onProgress) {
            context.onProgress({
              type: 'image',
              response: { ...response },
            });
          }

          // Clear memory after image generation
          await clearGenerationMemory();
        } catch (e) {
          console.warn('[Roleplay] Failed to generate image for video:', e.message);
        }
      }

      if (includeVideo && response.image && isPeakEmotion) {
        context.updateStatus?.(`Preparing cinematic video...`);
        try {
          // Aggressively clear memory BEFORE video generation
          await clearGenerationMemory(true); // Use aggressive mode
          await new Promise(r => setTimeout(r, 1000)); // Wait 1s for memory to fully free

          // Check memory status
          const memStatus = await getMemoryStatus();
          if (memStatus) {
            console.log(`[Roleplay] Memory before video: ${memStatus.rss_gb}GB RSS, cached: ${memStatus.cached_models?.join(', ') || 'none'}`);
          }

          context.updateStatus?.(`Writing cinematographic script...`);

          // Use LLM to create a detailed cinematographic video prompt
          // LTX-2 needs highly detailed, chronological descriptions
          const videoPromptInstruction = `You are a cinematographer writing a shot description for a 5-second video clip.

CHARACTER: ${companion.name}
APPEARANCE: ${companion.appearance}
CURRENT EMOTION: ${response.emotion || 'neutral'}
CURRENT ACTION: ${response.action || 'idle'}
SCENE CONTEXT: ${response.response?.substring(0, 300) || 'A quiet moment'}
IMAGE PROMPT (starting frame): ${response.imagePrompt || 'character portrait'}
SETTING: ${currentLocation || scenario?.setting || 'indoor scene'}

Write a single flowing paragraph (under 200 words) describing what happens in this 5-second video clip. Follow this structure:
1. Start with the main action in one sentence
2. Add specific details about movements and gestures
3. Describe the character's appearance precisely (hair, skin, clothing, expression)
4. Include background and environment details
5. Specify camera angle and any camera movement
6. Describe lighting and colors
7. Note any changes during the clip

Be literal and precise. Think like a cinematographer describing a shot list. Start directly with the action.

Example: "A woman with long red hair and tan skin slowly tilts her head back, her emerald eyes half-closed with pleasure. She runs her fingers through her flowing hair, her full lips parted in a soft gasp. She wears a sheer silk robe that drapes off one shoulder. The camera holds a medium close-up, slowly pushing in. Warm golden light from nearby candles casts soft shadows across her features. The background shows a dimly lit bedroom with silk curtains. Her breathing causes subtle movement in her chest as she exhales slowly."

Write ONLY the video description paragraph, nothing else:`;

          await ensureLLMLoaded(ROLEPLAY_LLM);
          const videoPromptRaw = await generateTextWithModel(videoPromptInstruction, '', ROLEPLAY_LLM);
          await unloadLLM();

          // Clean up the prompt - remove any quotes or prefixes
          const videoPrompt = videoPromptRaw
            .replace(/^["']|["']$/g, '')
            .replace(/^(Video description|Shot description|Paragraph):\s*/i, '')
            .trim()
            .substring(0, 500); // Keep under 500 chars for LTX-2

          console.log(`[Roleplay] Video prompt (LLM generated): ${videoPrompt}`);

          const port = window.BONZAI_SERVER_PORT || 65000;
          const authHeaders = getAuthHeaders();
          const videoHeaders = {
            'Content-Type': 'application/json',
            ...authHeaders,
          };
          // Use demo mode if no auth token available
          if (!authHeaders.Authorization) {
            videoHeaders['X-Demo-Mode'] = 'true';
          }

          const videoResponse = await fetch(`http://localhost:${port}/video`, {
            method: 'POST',
            headers: videoHeaders,
            body: JSON.stringify({
              mode: 'i2v',  // Image-to-video
              prompt: videoPrompt,
              negative_prompt: 'static, frozen, low quality, blurry, distorted face',
              image_base64: response.image,  // Use generated image as starting frame
              height: 448,   // 480p landscape
              width: 640,
              frames: 61,    // 5 seconds at 12fps (must be 8n+1)
              frame_rate: 12,
              steps: 10,
              guidance_scale: 1.0,
              auto_download: true,
            }),
          });

          if (videoResponse.ok) {
            const videoData = await videoResponse.json();
            if (videoData.video_path || videoData.video_base64) {
              response.video = videoData.video_path || `data:video/mp4;base64,${videoData.video_base64}`;
              console.log('[Roleplay] Video generated successfully');

              // If we have audio, the frontend can combine them
              // Store dialogue for potential TTS overlay (extract from response if not already available)
              const videoDialogue = response.response ? (response.response.match(/"([^"]+)"/g) || []).map(q => q.replace(/"/g, '')).join(' ') : '';
              response.videoDialogue = videoDialogue;

              // Streaming callback - notify video is ready
              if (context.onProgress) {
                context.onProgress({
                  type: 'video',
                  response: { ...response },
                });
              }

              // Clear memory after video generation
              await clearGenerationMemory();
            }
          } else {
            const errorText = await videoResponse.text();
            console.warn(`[Roleplay] Video generation failed (${videoResponse.status}):`, errorText);
          }
        } catch (e) {
          console.warn('[Roleplay] Video generation error:', e.message, e.stack);
          response.video = null;
        }
      } else if (includeVideo && !response.image) {
        console.log('[Roleplay] Video skipped: no image available as starting frame');
      } else if (includeVideo && !isPeakEmotion) {
        console.log(`[Roleplay] Video skipped: emotion "${response.emotion || 'unknown'}" not in peak emotions list`);
      }

      // Update relationship state based on the response
      const updatedRelationshipState = updateRelationshipState(history, relationshipState, response);

      // Return updated scene state for the UI to track
      const updatedSceneState = {
        lastImageAt: response.image ? messageIndex : lastImageAt,
        currentLocation: response.newLocation || currentLocation,
        recentEmotions: [...recentEmotions.slice(-2), response.emotion].filter(Boolean),
        recentActions: [...recentActions.slice(-1), response.action].filter(Boolean),
        lastOpeningPhrase: extractOpeningPhrase(response.response),
        relationshipState: updatedRelationshipState,
      };

      return {
        success: true,
        character: companion.name,
        response,
        sceneState: updatedSceneState,
        meta: {
          contentLevel,
          responseMode,
          hasImage: !!response.image,
          hasAudio: !!response.audio,
          hasVideo: !!response.video,
          emotion: response.emotion,
          isPeakEmotion,
          imageSkipped: includeImage && !response.image,
          shouldVisualize: response.shouldVisualize,
        },
      };
    },

    /**
     * Initialize a new roleplay session - generates background from scenario
     * Call this when starting a new chat session
     * @param {Object} params - Session parameters
     * @param {Object} params.companion - Selected companion
     * @param {Object} params.scenario - Selected scenario
     * @param {Object} params.settings - Content level and response mode
     * @param {Object} context - Execution context
     */
    async initSession({ companion, scenario, settings }, context) {
      context.updateStatus?.('Preparing scene...');

      let backgroundImage = null;

      // Generate initial scenery background from scenario
      if (scenario && settings?.responseMode?.includes('image')) {
        context.updateStatus?.('Setting the scene...');
        backgroundImage = await generateSceneryBackground(scenario);

        // Clear memory after background generation
        await clearGenerationMemory();
      }

      // Initialize voice for companion (pre-cache for consistency)
      if (companion && settings?.responseMode?.includes('audio')) {
        context.updateStatus?.('Preparing voice...');
        try {
          // Pre-generate voice prompt by synthesizing a short greeting
          await generateNarration(`Hello.`, {
            companion,
            sampleText: `Hello, I'm ${companion.name}. It's wonderful to meet you.`,
          });

          // Clear memory after voice initialization
          await clearGenerationMemory();
        } catch (e) {
          console.warn('[Roleplay] Voice pre-cache failed:', e.message);
        }
      }

      return {
        success: true,
        backgroundImage,
        sceneState: {
          lastImageAt: -IMAGE_GENERATION_CONFIG.MIN_MESSAGES_BETWEEN_IMAGES,
          currentLocation: scenario?.setting || '',
          recentEmotions: [],
          recentActions: [],
          lastOpeningPhrase: '',
        },
      };
    },

    /**
     * Generate a custom companion using LLM
     */
    async generateCompanion({ description, style = 'romantic' }, context) {
      context.updateStatus?.('Generating companion...');

      const prompt = `Create a unique roleplay companion character.

User wants: ${description}
Style: ${style}

Output JSON with these exact fields:
{
  "name": "Character name",
  "description": "1-2 sentence hook",
  "personality": "trait1, trait2, trait3",
  "appearance": "Detailed physical appearance",
  "background": "Character backstory (2-3 sentences)",
  "voiceStyle": "How they speak",
  "avatar": "woman"
}

avatar must be one of: woman, man, android, demon, soldier, fantasy

Return ONLY the JSON object, no other text.`;

      const response = await generateTextWithModel(prompt, '', ROLEPLAY_LLM);
      const companion = extractJSON(response);
      companion.id = `custom_${Date.now()}`;
      companion.isCustom = true;

      await unloadLLM();
      return companion;
    },

    /**
     * Generate a custom scenario using LLM
     */
    async generateScenario({ description, mood = 'romantic' }, context) {
      context.updateStatus?.('Generating scenario...');

      const prompt = `Create a unique roleplay scenario.

User wants: ${description}
Mood: ${mood}

Output JSON with these exact fields:
{
  "name": "Scenario title",
  "description": "1 sentence summary",
  "setting": "Detailed setting description",
  "mood": "${mood}"
}

Return ONLY the JSON object, no other text.`;

      const response = await generateTextWithModel(prompt, '', ROLEPLAY_LLM);
      const scenario = extractJSON(response);
      scenario.id = `custom_${Date.now()}`;
      scenario.isCustom = true;

      await unloadLLM();
      return scenario;
    },
  },
  metadata: { createdAt: '2025-01-25T00:00:00Z', updatedAt: '2025-01-25T00:00:00Z', license: 'MIT' },
});

// ═══════════════════════════════════════════════════════════════════════════
// EXPORT ALL FLAGSHIP SKILLS
// ═══════════════════════════════════════════════════════════════════════════

export const flagshipSkills = [
  polymarketTopPerformers,  // Polymarket Top Performers
  dslaSmartMarket,          // Prediction Market Maker
  roleplayCompanion,        // Roleplay Companion
  tcgPredictionMarket,      // Trading Card Game Insurance
  meditationForge,          // Meditation Forge
];

// Export memory management functions for use by components
export { clearAllMemory, getMemoryStatus, clearGenerationMemory };

export default flagshipSkills;
