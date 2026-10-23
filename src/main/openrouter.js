import { createOpenRouterMedia } from './openrouterMedia.js';
/** Optional, user-funded inference transport. Credentials never cross back into the renderer. */
export const OPENROUTER_HEADERS = Object.freeze({
  'HTTP-Referer': 'https://bonzai.sh',
  'X-OpenRouter-Title': 'BonzAI',
  'X-OpenRouter-Categories': 'roleplay,creative-writing,personal-agent',
});
const SECRET = 'openrouter-secret';
const SETTINGS = 'openrouter.settings';
const API = 'https://openrouter.ai/api/v1';

export function createOpenRouter({ store, safeStorage, fetchImpl = globalThis.fetch, saveMedia, inspectImage, sleep }) {
  let catalog = [];
  let catalogAt = 0;
  const active = () => store.get('p2p.networkMode', 'local') === 'consumer' && store.get(SETTINGS, {}).source === 'openrouter';
  const status = () => ({ source: 'network', maxTokens: 2048, ...store.get(SETTINGS, {}), connected: Boolean(store.get(SECRET)), active: active() });
  function secure() {
    if (!safeStorage.isEncryptionAvailable() || safeStorage.getSelectedStorageBackend?.() === 'basic_text') throw new Error('Unlock your system keychain to connect OpenRouter.');
  }
  function key() {
    secure();
    const encrypted = store.get(SECRET);
    if (!encrypted) throw new Error('Connect OpenRouter in Network settings first.');
    return safeStorage.decryptString(Buffer.from(encrypted, 'base64'));
  }
  async function request(path, options = {}, token = key()) {
    let response;
    try {
      response = await fetchImpl(`${API}${path}`, { ...options, redirect: 'error', signal: options.signal || AbortSignal.timeout(60000), headers: { ...OPENROUTER_HEADERS, 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } });
    } catch (error) {
      if (options.signal?.aborted) throw error;
      throw new Error('OpenRouter could not be reached. Check your connection and retry.');
    }
    if (!response.ok) {
      throw new Error(({ 401: 'Reconnect your OpenRouter account.', 402: 'Your OpenRouter spending limit or credits have been reached.', 429: 'OpenRouter is busy. Wait a moment before retrying.' })[response.status] || `OpenRouter could not complete this request (${response.status}).`);
    }
    return response;
  }
  async function account(token) {
    const data = (await (await request('/key', {}, token)).json()).data;
    return { limit: data.limit, remaining: data.limit_remaining, usage: data.usage, daily: data.usage_daily, monthly: data.usage_monthly };
  }
  async function connect(token) {
    secure();
    if (typeof token !== 'string' || !token.trim() || token.length > 1024) throw new Error('Enter an OpenRouter API key.');
    const details = await account(token.trim());
    // The upstream cap also covers concurrent requests, other devices and interrupted streams.
    if (!Number.isFinite(details.limit)) throw new Error('Set a spending limit for this key in OpenRouter before connecting it.');
    store.set(SECRET, safeStorage.encryptString(token.trim()).toString('base64'));
    return details;
  }
  async function models() {
    if (Date.now() - catalogAt < 300000 && catalog.length) return catalog;
    const result = await request('/models');
    catalog = (await result.json()).data.filter(m => m.architecture?.output_modalities?.includes('text')).map(m => ({ id: m.id, name: m.name, context: m.context_length, input: m.architecture?.input_modalities || ['text'], pricing: m.pricing, supported: m.supported_parameters || [] }));
    catalogAt = Date.now();
    return catalog;
  }
  const media = createOpenRouterMedia({ request, status, models, store, saveMedia, inspectImage, sleep });
  async function configure(input) {
    if (!['network', 'openrouter'].includes(input.source)) throw new Error('Choose an inference source.');
    if (input.source === 'openrouter') {
      if (input.consent !== true) throw new Error('Confirm remote processing before enabling OpenRouter.');
      if (!(await models()).some(m => m.id === input.model)) throw new Error('Choose an available OpenRouter model.');
    }
    const maxTokens = Number(input.maxTokens);
    if (!Number.isInteger(maxTokens) || maxTokens < 128 || maxTokens > 32768) throw new Error('Choose an output limit between 128 and 32768 tokens.');
    const mediaModels = input.source === 'openrouter' ? await media.validateSelections(input.mediaModels || {}) : {};
    const inputModalities = input.source === 'openrouter' ? (await models()).find(m => m.id === input.model)?.input || [] : [];
    store.set(SETTINGS, { inputModalities, mediaModels, speechVoice: String(input.speechVoice || '').trim().slice(0, 200), source: input.source, model: String(input.model || ''), maxTokens, consent: input.consent === true });
    return status();
  }
  async function complete({ messages, maxTokens, temperature, signal, onToken }) {
    if (!active() || status().consent !== true) throw new Error('OpenRouter is not enabled for Consumer Mode.');
    const settings = status();
    const model = (await models()).find(m => m.id === settings.model);
    if (!model) throw new Error('This OpenRouter model is unavailable. Choose another model in Network settings.');
    if (!active()) throw new Error('The inference source changed. Send the request again.');
    if (messages.some(m => Array.isArray(m.content) && m.content.some(part => part.type === 'image_url')) && !model.input.includes('image')) throw new Error('Choose an OpenRouter model that supports images.');
    const start = Date.now();
    const body = { model: model.id, messages, max_tokens: Math.max(1, Math.min(Math.floor(Number(maxTokens) || settings.maxTokens), settings.maxTokens)), stream: Boolean(onToken), ...(Number.isFinite(temperature) ? { temperature } : {}) };
    const response = await request('/chat/completions', { method: 'POST', body: JSON.stringify(body), signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(300000)]) : AbortSignal.timeout(300000) });
    let text = '', usage = null, finishReason = null;
    if (!onToken) {
      const result = await response.json();
      if (result.error) throw new Error('OpenRouter could not complete this generation.');
      text = result.choices?.[0]?.message?.content || '';
      usage = result.usage;
      finishReason = result.choices?.[0]?.finish_reason;
    } else {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '', done = false;
      const consume = line => {
        if (!line.startsWith('data:')) return;
        const data = line.slice(5).trim();
        if (data === '[DONE]') { done = true; return; }
        if (!data) return;
        const event = JSON.parse(data);
        if (event.error) throw new Error('OpenRouter interrupted this generation. Please retry.');
        usage = event.usage || usage;
        finishReason = event.choices?.[0]?.finish_reason || finishReason;
        const chunk = event.choices?.[0]?.delta?.content;
        if (chunk) { text += chunk; onToken(chunk); }
      };
      try {
        while (!done) {
          const part = await reader.read();
          buffer += decoder.decode(part.value || new Uint8Array(), { stream: !part.done });
          const lines = buffer.split('\n'); buffer = lines.pop();
          for (const line of lines) consume(line.trimEnd());
          if (part.done) { if (buffer) consume(buffer); break; }
        }
        if (!done && !finishReason) throw new Error('OpenRouter disconnected before the answer was complete.');
      } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
    }
    const elapsedMs = Date.now() - start;
    const record = { at: Date.now(), model: model.id, source: 'openrouter', elapsedMs, inputTokens: usage?.prompt_tokens ?? null, outputTokens: usage?.completion_tokens ?? null, cost: usage?.cost ?? null };
    try { store.set('openrouter.usage', [...store.get('openrouter.usage', []), record].slice(-1000)); } catch { /* Never discard a paid response because the local ledger is unavailable. */ }
    return { text, usage, finishReason, elapsedMs, source: 'openrouter', model: model.id, networkMode: 'remote' };
  }
  return { active, status, account, connect, models, configure, complete, media, disconnect() { store.delete(SECRET); store.set(SETTINGS, { source: 'network', maxTokens: 2048 }); return status(); } };
}
