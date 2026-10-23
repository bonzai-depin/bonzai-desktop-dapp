import { createSkillDefinition } from './types.js';

const brief = { type: 'string', default: '', required: true, label: 'Creative Brief', description: 'Describe your audience, story, tone and desired result. You can paste source content here.' };
const duration = { type: 'number', default: 30, min: 10, max: 600, label: 'Duration (Seconds)' };
const visualStyle = { type: 'string', default: 'Cinematic, consistent characters and palette', label: 'Visual Direction' };
const definition = (id, name, description, inputs, apis) => createSkillDefinition({
  id, name, description, version: '1.0.0',
  author: { name: 'BonzAI', address: '0x8Ff3b2e823b33BeE30e699bB1b6BBc8F622fEa89', verified: true },
  category: 'entertainment', price: 0, tags: ['creative', 'video', 'production'],
  requirements: { minLevel: 0, requiredApis: apis, requiredPermissions: [] },
  inputs, tools: { bonzai: [], mcp: [] },
  prompt: { system: 'Produce complete local media from the supplied creative brief. Preserve source meaning and require review before publication.', task: '{{brief}}', outputFormat: { type: 'json' } },
  execution: { type: 'javascript', entrypoint: 'execute', managesGeneration: true,
    async execute(inputs, context) {
      const { runMediaProduction } = await import('../services/company/mediaProduction.js');
      return runMediaProduction(id, inputs, context);
    } },
  metadata: { license: 'Apache-2.0', workspaceCategory: 'media' },
});

export const podcastStudio = definition('podcast-studio-v1.0.0', 'Podcast Studio',
  'Turn a topic or an answer into an illustrated podcast: script, complete narration, cover and episode notes.',
  { brief, duration: { ...duration, default: 180, max: 1800, label: 'Approximate Length (Seconds)', description: 'Narration follows this length; the complete recording is kept without cutting the ending.' }, voice: { type: 'select', default: 'af_heart', label: 'Narrator', options: ['af_heart', 'af_bella', 'am_adam', 'am_michael', 'bf_emma', 'bm_george'] }, visualStyle },
  ['llm', 'audio', 'image']);

export const musicVideoForge = definition('music-video-forge-v1.0.0', 'Music Video Studio',
  'Create a song or use your own, illustrate its storyboard, animate each shot with H3, and assemble a video covering the full soundtrack.',
  { brief, soundtrack: { type: 'audio', default: '', label: 'Existing Song (Optional)', description: 'Use a local song, or leave empty to generate music.' },
    duration, visualStyle, instrumental: { type: 'boolean', default: false, label: 'Instrumental' },
    h3Accepted: { type: 'boolean', default: false, label: 'MiniMax H3 Terms', description: 'I have reviewed and accept the MiniMax H3 model license.' } },
  ['llm', 'music', 'image', 'video']);

export const mangaToAnime = definition('manga-to-anime-v1.0.0', 'Anime Studio',
  'Bring your manga panels to life as ordered H3 shots, assembled into one anime sequence with a saved storyboard.',
  { brief, panels: { type: 'images', default: [], required: true, label: 'Manga Panels', description: 'Add panels in story order. Each panel becomes an animated shot.' },
    secondsPerPanel: { type: 'select', default: '5', label: 'Seconds Per Panel', options: ['5', '10'] },
    visualStyle: { ...visualStyle, default: 'Preserve the manga artwork, characters, line work and composition' },
    h3Accepted: { type: 'boolean', default: false, label: 'MiniMax H3 Terms', description: 'I have reviewed and accept the MiniMax H3 model license.' } },
  ['llm', 'video']);

export const MEDIA_WORKFLOW_IDS = [podcastStudio.id, musicVideoForge.id, mangaToAnime.id];
export const MEDIA_TEAM_ROLES = {
  [podcastStudio.id]: ['CEO', 'Producer:text', 'Producer:audio', 'Producer:image'],
  [musicVideoForge.id]: ['CEO', 'Producer:text', 'Producer:music', 'Producer:image', 'Producer:video'],
  [mangaToAnime.id]: ['CEO', 'Producer:text', 'Producer:video'],
};
