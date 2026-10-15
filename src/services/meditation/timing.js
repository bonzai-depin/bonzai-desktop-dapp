/** Narration budgets leave room for breathing, instead of cutting speech to a timer. */
export function meditationTiming(minutes) {
  const seconds = Math.round(Number(minutes) * 60);
  if (!Number.isFinite(seconds) || seconds < 30 || seconds > 900) throw new Error('Choose a meditation length from 30 seconds to 15 minutes.');
  const words = Math.round(seconds * 75 / 60);
  return { seconds, words, minWords: Math.round(words * 0.7), maxWords: Math.round(words * 1.25) };
}

export function narrationText(value) {
  return String(typeof value === 'string' ? value : value?.text || value?.response || '')
    .replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, '')
    .replace(/```(?:text|markdown|md)?/gi, '').replace(/```/g, '')
    .replace(/^(?:transcript|script|meditation script|spoken transcript)\s*:\s*/i, '').trim();
}

// Japanese and Chinese do not separate words with spaces. Count their written
// characters as approximate spoken units; audio timing remains the final authority.
export function narrationUnits(text) {
  const value = String(text || '');
  const cjk = value.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu) || [];
  const separatedWords = value.replace(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu, ' ')
    .match(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu) || [];
  return separatedWords.length + cjk.length / 2;
}

export function scriptTimingProblem(text, minutes) {
  const { minWords, maxWords } = meditationTiming(minutes);
  const words = narrationUnits(text);
  if (words < minWords || words > maxWords) {
    if (/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(text)) return `Fit the narration to ${minWords * 2}–${maxWords * 2} Japanese or Chinese characters, including a complete closing sentence.`;
    return `The narration has ${words} words; it needs ${minWords}–${maxWords} words, including a complete closing sentence.`;
  }
  if (/(?:requirements:|output only|system prompt|session variables|environment:)/i.test(text)) return 'Return the spoken narration only, without writing instructions.';
  if (!/[.!?…。！？]["'”’」』)]?$/.test(text)) return 'The narration ends mid-sentence. Include a complete, calm ending.';
  return null;
}

/** Split only at sentence/paragraph boundaries; Kokoro uses newlines for measured chunks. */
export function narrationChunks(text) {
  const sentences = String(text || '').match(/[^.!?。！？\n]+(?:[.!?。！？]+["'”’」』)]*|$)/g) || [text];
  const chunks = [];
  let paragraph = '';
  for (const sentence of sentences) {
    const next = String(sentence || '').trim();
    if (!next) continue;
    paragraph = [paragraph, next].filter(Boolean).join(' ');
    if (narrationUnits(paragraph) >= 24) { chunks.push(paragraph); paragraph = ''; }
  }
  if (paragraph) chunks.push(paragraph);
  return chunks.join('\n\n');
}

export async function writeTimedMeditation({ minutes, prompt, write, system }) {
  let previous = '';
  let problem = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    const request = attempt ? `${prompt}\n\nRevise this draft to satisfy the duration: ${problem}\nDraft:\n${previous}` : prompt;
    previous = narrationText(await write(request, { system, maxTokens: Math.max(512, Math.ceil(meditationTiming(minutes).words * 2.5)), temperature: 0.65 }));
    problem = scriptTimingProblem(previous, minutes);
    if (!problem) return narrationChunks(previous);
  }
  throw new Error(`The narration does not yet fit this session. ${problem} Retry writing the meditation.`);
}
