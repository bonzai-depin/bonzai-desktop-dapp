/** Older local servers return audio without timing metadata. Measure it, never discard it. */
export function narrationMediaSource(audio, baseUrl = `http://localhost:${globalThis.window?.BONZAI_SERVER_PORT || 65000}`) {
  const value = audio.meta?.localPath || audio.payload;
  if (/^(?:data:|https?:|blob:)/i.test(value || '')) return value;
  if (audio.meta?.localPath || audio.meta?.payloadEncoding === 'path') return `${baseUrl}/media/stream?path=${encodeURIComponent(value)}`;
  return `data:audio/wav;base64,${value || ''}`;
}

export function wavBytesDuration(buffer) {
  const bytes = new Uint8Array(buffer), view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const name = start => String.fromCharCode(...bytes.subarray(start, start + 4));
  if (bytes.length < 44 || name(0) !== 'RIFF' || name(8) !== 'WAVE') throw new Error('The narration duration could not be read.');
  let rate = 0, size = 0;
  for (let start = 12; start + 8 <= bytes.length;) {
    const count = view.getUint32(start + 4, true);
    if (start + 8 + count > bytes.length) throw new Error('The narration file is incomplete.');
    if (name(start) === 'fmt ' && count >= 16) rate = view.getUint32(start + 16, true);
    if (name(start) === 'data') size += count;
    start += 8 + count + count % 2;
  }
  if (!rate || !size) throw new Error('The narration contains no playable audio.');
  return size / rate;
}

export async function measureNarrationDuration(source, { AudioClass = globalThis.Audio, fetchImpl = globalThis.fetch, timeoutMs = 10000 } = {}) {
  if (typeof AudioClass !== 'function') {
    const response = await fetchImpl(source, { signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) throw new Error('The generated narration could not be opened.');
    return wavBytesDuration(await response.arrayBuffer());
  }
  return new Promise((resolve, reject) => {
    const audio = new AudioClass();
    let timer;
    const finish = (error, duration) => {
      clearTimeout(timer); audio.onloadedmetadata = null; audio.onerror = null;
      audio.pause?.(); audio.removeAttribute?.('src'); audio.load?.();
      if (error) reject(error); else resolve(duration);
    };
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => Number.isFinite(audio.duration) && audio.duration > 0
      ? finish(null, audio.duration) : finish(new Error('The narration duration could not be measured.'));
    audio.onerror = () => finish(new Error('The generated narration could not be opened.'));
    timer = setTimeout(() => finish(new Error('Opening the narration timed out. Reopen the saved audio and retry.')), timeoutMs);
    audio.src = source;
    audio.load?.();
  });
}
