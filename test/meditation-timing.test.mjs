import test from 'node:test';
import assert from 'node:assert/strict';
import { meditationTiming, narrationChunks, scriptTimingProblem, writeTimedMeditation } from '../src/services/meditation/timing.js';
import { wavDuration, meditationExportTiming, meditationCaptionCues, meditationAudioFilters, meditationVideoArgs } from '../src/main/media/meditationExport.js';
import { measureNarrationDuration, narrationMediaSource } from '../src/services/meditation/audioDuration.js';
import { meditationArtworkSource } from '../src/services/meditation/artwork.js';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const words = count => `${Array.from({ length: count }, () => 'calm').join(' ')}.`;
function wav(seconds) {
  const rate = 8000, samples = Buffer.alloc(seconds * rate * 2), header = Buffer.alloc(44);
  // Keep audible speech-like signal through the very last sample to detect truncation.
  for (let offset = 0; offset < samples.length; offset += 2) samples.writeInt16LE(Math.round(Math.sin(offset / 2 * 2 * Math.PI * 440 / rate) * 10000), offset);
  header.write('RIFF'); header.writeUInt32LE(samples.length + 36, 4); header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22); header.writeUInt32LE(rate, 24); header.writeUInt32LE(rate * 2, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34); header.write('data', 36); header.writeUInt32LE(samples.length, 40);
  return Buffer.concat([header, samples]);
}

test('duration budgets cover short and long sessions without arbitrary 320-word floors', () => {
  assert.equal(meditationTiming(.5).words, 38);
  assert.equal(meditationTiming(3).words, 225);
  assert.equal(meditationTiming(15).words, 1125);
  assert.throws(() => meditationTiming(100), /30 seconds to 15 minutes/);
});
test('writing repairs the full script instead of slicing its last words off', async () => {
  const requests = [];
  const script = await writeTimedMeditation({ minutes: .5, prompt: 'Write a calm session.', write: async prompt => { requests.push(prompt); return requests.length === 1 ? words(120) : `${words(30)} Gently return to your day. Namaste.`; } });
  assert.equal(requests.length, 2);
  assert.match(requests[1], /Revise this draft/);
  assert.match(script, /Gently return to your day\. Namaste\.$/);
  assert.equal(scriptTimingProblem(script, .5), null);
  await assert.rejects(writeTimedMeditation({ minutes: 15, prompt: 'Long practice.', write: async () => words(200) }), /does not yet fit/);
});
test('narration chunking preserves every word and the complete ending', () => {
  const original = `${words(30)}\n\n${words(25)} Breathe in... and breathe out. Carry this peace with you.`;
  const result = narrationChunks(original);
  assert.equal(result.replace(/\s+/g, ' '), original.replace(/\s+/g, ' '));
  assert.match(result, /\n\n/);
});
test('Japanese and Chinese narration is timed without requiring space-delimited words', async () => {
  for (const script of [
    'ゆっくりと息を吸いましょう。肩の力を抜いてください。穏やかな森を思い浮かべましょう。心地よい静けさを感じてください。ゆっくりと目を開けましょう。',
    '请慢慢地吸气，让肩膀和双手放松。感受周围的宁静，让心中的紧张慢慢离开。想象温暖阳光穿过森林，轻轻照在你的身上。慢慢呼气，带着这份平静回到今天。',
  ]) {
    assert.equal(scriptTimingProblem(script, .5), null);
    const result = await writeTimedMeditation({ minutes: .5, prompt: 'A quiet short session.', write: async () => script });
    assert.equal(result.replace(/\s+/g, ''), script);
    assert.match(result, /\n\n/);
  }
});
test('export measures real audio and extends video instead of clipping a long ending', () => {
  assert.equal(wavDuration(wav(32)), 32);
  assert.equal(meditationExportTiming(32, 30).durationSeconds, 32);
  assert.equal(meditationExportTiming(22, 30).durationSeconds, 30);
  assert.throws(() => wavDuration(wav(32).subarray(0, 100)), /incomplete/);
  assert.equal(meditationAudioFilters(32), 'apad=whole_dur=32');
});
test('captions follow narrated chunks and leave actual breath pauses uncaptioned', () => {
  const cues = meditationCaptionCues('Breathe in. Rest now.', 30, [{ text: 'Breathe in.', start: .4, end: 3 }, { text: 'Rest now.', start: 14, end: 16 }]);
  assert.equal(cues[0].end, 3); assert.equal(cues[1].start, 14); assert.equal(cues.at(-1).end, 16);
  assert.equal(cues.map(cue => cue.text).join(' '), 'Breathe in. Rest now.');
});
test('older server audio remains usable by measuring its real media, with a bounded wait', async () => {
  const bytes = wav(32);
  assert.equal(await measureNarrationDuration('data:audio/wav;base64,fixture', { AudioClass: undefined, fetchImpl: async () => new Response(bytes) }), 32);
  assert.equal(narrationMediaSource({ payload: '/tmp/narration.wav', meta: { payloadEncoding: 'path' } }, 'http://localhost:65000'), 'http://localhost:65000/media/stream?path=%2Ftmp%2Fnarration.wav');
  class OldAudio { load() { if (this.src && this.onloadedmetadata) { this.duration = 21; queueMicrotask(() => this.onloadedmetadata?.()); } } }
  assert.equal(await measureNarrationDuration('old-session.wav', { AudioClass: OldAudio }), 21);
  await assert.rejects(measureNarrationDuration('missing.wav', { AudioClass: class {}, timeoutMs: 5 }), /timed out/);
});
test('real ffmpeg keeps the last spoken second and fills short session duration', { skip: spawnSync('ffmpeg', ['-version']).status !== 0 }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bonzai-meditation-test-'));
  try {
    const image = path.join(dir, 'scene.png');
    execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=blue:s=64x64', '-frames:v', '1', image]);
    for (const sourceSeconds of [2, 32]) {
      const audio = path.join(dir, `${sourceSeconds}.wav`), video = path.join(dir, `${sourceSeconds}.mp4`);
      fs.writeFileSync(audio, wav(sourceSeconds));
      const { durationSeconds } = meditationExportTiming(wavDuration(fs.readFileSync(audio)), 30);
      execFileSync('ffmpeg', ['-v', 'error', ...meditationVideoArgs({ imagePath: image, audioPath: audio, videoFilter: 'format=yuv420p', durationSeconds, outputPath: video })]);
      const decoded = execFileSync('ffmpeg', ['-v', 'error', '-i', video, '-f', 's16le', '-ar', '8000', '-ac', '1', '-'], { maxBuffer: 4e6 });
      assert.ok(decoded.length / 16000 >= durationSeconds - .1);
      const beforeSpeechEnd = decoded.subarray((sourceSeconds - 1) * 16000, sourceSeconds * 16000);
      assert.ok(beforeSpeechEnd.some(byte => byte > 20), 'the final spoken second must remain audible');
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});


test('artwork accepts inline pixels and absolute local paths across devices without remote URLs', () => {
  const base = 'http://localhost:65000';
  for (const localPath of ['/tmp/meditation.png', 'C:\\BonzAI\\meditation.webp', '\\\\server\\meditation.jpg']) {
    assert.equal(meditationArtworkSource({ image_path: localPath }, base), `${base}/media/stream?path=${encodeURIComponent(localPath)}`);
  }
  assert.equal(meditationArtworkSource({ image: 'data:image/webp;base64,AAAA' }, base), 'data:image/webp;base64,AAAA');
  assert.equal(meditationArtworkSource({ image_base64: 'AAAA' }, base), 'data:image/png;base64,AAAA');
  for (const value of ['', 'https://remote.example/image.png', '../image.png', 'file:///tmp/image.png', '<svg />']) {
    assert.throws(() => meditationArtworkSource({ image: value }, base), /no usable artwork/);
  }
});
