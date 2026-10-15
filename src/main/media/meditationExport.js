/** Read actual PCM duration; renderer estimates must never decide where speech ends. */
export function wavDuration(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 44 || bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WAVE') throw new Error('A complete WAV narration is required to export this session.');
  let byteRate = 0, samples = 0;
  for (let cursor = 12; cursor + 8 <= bytes.length;) {
    const name = bytes.toString('ascii', cursor, cursor + 4);
    const size = bytes.readUInt32LE(cursor + 4);
    const start = cursor + 8;
    if (start + size > bytes.length) throw new Error('The narration file is incomplete. Reopen its saved audio or record it again.');
    if (name === 'fmt ' && size >= 16) byteRate = bytes.readUInt32LE(start + 8);
    if (name === 'data') samples += size;
    cursor = start + size + (size % 2);
  }
  if (!byteRate || !samples) throw new Error('The narration contains no playable audio.');
  return samples / byteRate;
}

export function meditationExportTiming(audioSeconds, requestedSeconds) {
  if (!Number.isFinite(audioSeconds) || audioSeconds <= 0) throw new Error('The narration duration could not be measured.');
  const requested = Number(requestedSeconds);
  return { audioSeconds, durationSeconds: Math.max(audioSeconds, Number.isFinite(requested) && requested >= 30 && requested <= 900 ? requested : 0) };
}

export function meditationCaptionCues(script, audioSeconds, segments = []) {
  const valid = segments.length && segments.every(segment => Number.isFinite(segment.start) && Number.isFinite(segment.end) && segment.start >= 0 && segment.end > segment.start && segment.end <= audioSeconds + 0.1 && typeof segment.text === 'string');
  const source = valid ? segments : [{ text: script, start: 0, end: audioSeconds }];
  return source.flatMap(segment => {
    const words = segment.text.trim().split(/\s+/).filter(Boolean);
    const cues = [];
    for (let offset = 0; offset < words.length; offset += 5) {
      const end = Math.min(offset + 5, words.length);
      cues.push({ text: words.slice(offset, end).join(' '), start: segment.start + offset / words.length * (segment.end - segment.start), end: segment.start + end / words.length * (segment.end - segment.start) });
    }
    return cues;
  });
}

export function meditationAudioFilters(durationSeconds) {
  // Silence fills a short historical recording; a longer recording extends video instead.
  return `apad=whole_dur=${durationSeconds}`;
}

export function meditationVideoArgs({ imagePath, audioPath, videoFilter, durationSeconds, outputPath }) {
  return ['-y', '-loop', '1', '-framerate', '30', '-i', imagePath, '-i', audioPath,
    '-vf', videoFilter, '-af', meditationAudioFilters(durationSeconds), '-t', String(durationSeconds),
    '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'libx264', '-profile:v', 'baseline', '-level', '4.0',
    '-pix_fmt', 'yuv420p', '-preset', 'veryfast', '-crf', '19', '-c:a', 'aac', '-b:a', '192k',
    '-ar', '48000', '-ac', '2', '-movflags', '+faststart', '-brand', 'mp42', outputPath];
}
