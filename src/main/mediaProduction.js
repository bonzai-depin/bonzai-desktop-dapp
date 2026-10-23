import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createReadStream, constants } from 'node:fs';

const extensions = { image: 'png', audio: 'wav', video: 'mp4' };
const supportedExtensions = { image: ['png','jpg','jpeg','webp','gif'], audio: ['wav','mp3','m4a','ogg','flac','webm'], video: ['mp4','webm'] };
function mediaExtension(source, kind) {
  const subtype = source.match(/^data:[^/]+\/([^;]+);/i)?.[1].toLowerCase();
  const ext = subtype ? ({ mpeg: 'mp3', 'x-wav': 'wav', mp4: kind === 'audio' ? 'm4a' : 'mp4' }[subtype] || subtype) : path.extname(source).slice(1).toLowerCase();
  return supportedExtensions[kind].includes(ext) ? ext : extensions[kind];
}
// Local files only. In particular, an LLM cannot make FFmpeg open arbitrary
// URLs or playlists by supplying a source string.
async function localBytes(source, kind) {
  if (typeof source !== 'string' || !source) throw new Error('Select a local media file.');
  const data = source.match(/^data:(image|audio|video)\/[a-z0-9.+-]+;base64,([A-Za-z0-9+/=\s]+)$/i);
  if (data) {
    if (data[1] !== kind) throw new Error('The selected media has the wrong type.');
    return Buffer.from(data[2], 'base64');
  }
  if (source.startsWith('file:')) source = fileURLToPath(source);
  if (!path.isAbsolute(source)) {
    // Older image engines return bare base64.
    if (source.length > 32 && /^[A-Za-z0-9+/=\s]+$/.test(source)) return Buffer.from(source, 'base64');
    throw new Error('Only local files and embedded media can be used in a production.');
  }
  const stat = await fs.stat(source);
  if (!stat.isFile() || stat.size > 2 * 1024 ** 3) throw new Error('Choose a media file smaller than 2 GiB.');
  return fs.readFile(source);
}
function run(binary, args, allowFailure = false) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, ['-nostdin', '-hide_banner', ...args], { windowsHide: true });
    let output = '';
    child.stderr.on('data', value => { output = (output + value).slice(-12000); });
    const timer = setTimeout(() => { child.kill('SIGKILL'); }, 20 * 60 * 1000);
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('close', code => {
      clearTimeout(timer);
      if (code === 0 || allowFailure) resolve(output);
      else reject(new Error(`Media assembly failed. ${output.slice(-1200)}`));
    });
  });
}
export function mediaDuration(log) {
  const match = log.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  const seconds = match && Number(match[1]) * 3600 + Number(match?.[2]) * 60 + Number(match?.[3]);
  if (!Number.isFinite(seconds) || seconds <= 0) throw new Error('Could not measure this media. Choose a playable audio or video file.');
  return seconds;
}
export function createMediaProduction({ directory, ffmpeg }) {
  const prepare = async ({ source, kind }) => {
    if (!extensions[kind]) throw new Error('Unsupported production media.');
    await fs.mkdir(directory, { recursive: true });
    if (typeof source !== 'string') throw new Error('Select a local media file.');
    const ext = mediaExtension(source, kind);
    const localPath = typeof source === 'string' && source.startsWith('file:') ? fileURLToPath(source) : source;
    if (typeof localPath === 'string' && path.isAbsolute(localPath)) {
      const stat = await fs.stat(localPath);
      if (!stat.isFile() || !stat.size || stat.size > 2 * 1024 ** 3) throw new Error('Choose a media file smaller than 2 GiB.');
      const hash = createHash('sha256');
      for await (const chunk of createReadStream(localPath)) hash.update(chunk);
      const target = path.join(directory, `${hash.digest('hex')}.${ext}`);
      if (localPath !== target) await fs.copyFile(localPath, target, constants.COPYFILE_EXCL).catch(error => { if (error.code !== 'EEXIST') throw error; });
      return { path: target };
    }
    const bytes = await localBytes(source, kind);
    if (!bytes.length) throw new Error('The selected media is empty.');
    const digest = createHash('sha256').update(bytes).digest('hex');
    const target = path.join(directory, `${digest}.${ext}`);
    await fs.writeFile(target, bytes, { flag: 'wx' }).catch(error => { if (error.code !== 'EEXIST') throw error; });
    return { path: target };
  };
  const probe = async source => {
    if (!path.isAbsolute(source) || !(await fs.stat(source)).isFile()) throw new Error('Media file not found.');
    const log = await run(ffmpeg(), ['-protocol_whitelist', 'file,pipe', '-i', source], true);
    return { durationSeconds: mediaDuration(log), hasAudio: /Stream.*Audio:/.test(log), hasVideo: /Stream.*Video:/.test(log) };
  };
  const compose = async ({ kind, clips, soundtrack, width = 512, height = 288, fit = 'cover' }) => {
    if (!['audio', 'video'].includes(kind) || !Array.isArray(clips) || !clips.length || clips.length > 200) throw new Error('Choose between 1 and 200 clips.');
    if (kind === 'video' && (![512, 768, 1024].includes(width) || ![288, 432, 512, 576].includes(height))) throw new Error('Unsupported output canvas.');
    await fs.mkdir(directory, { recursive: true });
    const work = await fs.mkdtemp(path.join(directory, 'assembly-'));
    const output = path.join(directory, `${path.basename(work)}.${kind === 'audio' ? 'wav' : 'mp4'}`);
    let complete = false;
    try {
      let total = 0;
      // Normalize one shot at a time. A long sequence never loads every clip
      // into memory, and each H3 clip's audio is removed for a music soundtrack.
      for (const [index, clip] of clips.entries()) {
        const info = await probe(clip.source);
        if (!(kind === 'video' ? info.hasVideo : info.hasAudio)) throw new Error(`Clip ${index + 1} has no ${kind} track.`);
        const seconds = kind === 'audio' ? info.durationSeconds : Number(clip.duration);
        if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 600) throw new Error('Invalid clip duration.');
        if (kind === 'video' && info.durationSeconds + 0.15 < seconds) throw new Error(`Shot ${index + 1} is shorter than its storyboard timing.`);
        total += seconds;
        if (total > 3600) throw new Error('Keep the production under one hour.');
        const args = ['-y', '-threads', '1', '-protocol_whitelist', 'file,pipe', '-i', clip.source];
        if (kind === 'audio') args.push('-vn', '-ar', '24000', '-ac', '1', '-c:a', 'pcm_s16le');
        else {
          // Anime retains H3's audio. A silent shot gets a silent track so
          // concatenating mixed shots cannot drop or desynchronize later audio.
          if (!soundtrack && !info.hasAudio) args.push('-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo');
          const scale = fit === 'contain' ? `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2` : `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}`;
          args.push('-t', String(seconds), '-vf', `${scale},setsar=1,fps=24`, '-filter_threads', '1', '-map', '0:v:0');
          if (soundtrack) args.push('-an');
          else args.push('-map', info.hasAudio ? '0:a:0' : '1:a:0', '-af', 'apad', '-ar', '48000', '-ac', '2', '-c:a', 'aac', '-b:a', '192k');
          args.push('-c:v', 'libx264', '-threads', '1', '-preset', 'fast', '-crf', '18', '-pix_fmt', 'yuv420p');
        }
        args.push(path.join(work, `${index}.${kind === 'audio' ? 'wav' : 'mp4'}`));
        await run(ffmpeg(), args);
      }
      await fs.writeFile(path.join(work, 'clips.txt'), clips.map((_, i) => `file '${i}.${kind === 'audio' ? 'wav' : 'mp4'}'`).join('\n'));
      const args = ['-y', '-f', 'concat', '-safe', '1', '-protocol_whitelist', 'file,pipe', '-i', path.join(work, 'clips.txt')];
      if (soundtrack) {
        const info = await probe(soundtrack);
        if (!info.hasAudio || Math.abs(info.durationSeconds - total) > 0.2) throw new Error('The video timeline must cover the complete soundtrack.');
        args.push('-protocol_whitelist', 'file,pipe', '-i', soundtrack, '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-t', String(info.durationSeconds));
      } else args.push('-c', 'copy');
      if (kind === 'video') args.push('-movflags', '+faststart');
      args.push(output);
      await run(ffmpeg(), args);
      const final = await probe(output);
      if (Math.abs(final.durationSeconds - total) > 0.25) throw new Error('The assembled duration does not match the production.');
      complete = true;
      return { path: output, durationSeconds: final.durationSeconds };
    } finally {
      await fs.rm(work, { recursive: true, force: true });
      if (!complete) await fs.rm(output, { force: true });
    }
  };
  return { prepare, probe, compose };
}
