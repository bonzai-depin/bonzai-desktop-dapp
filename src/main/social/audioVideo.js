import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

/** Real local conversion. Input is bytes, never an untrusted path or URL. */
export async function audioToVideo({ audio, coverImage }, ffmpegPath, { timeoutMs = 180000 } = {}) {
  if (!audio?.length || audio.length > 64 * 1024 * 1024) throw new Error('Audio is empty or exceeds the 64 MB local limit.');
  if (coverImage?.length > 12 * 1024 * 1024) throw new Error('Cover image exceeds the local limit.');
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'bonzai-audio-reply-'));
  try {
    const input = path.join(folder, 'audio');
    const cover = path.join(folder, 'cover');
    const output = path.join(folder, 'reply.mp4');
    await fs.writeFile(input, Buffer.from(audio));
    if (coverImage?.length) await fs.writeFile(cover, Buffer.from(coverImage));
    const args = ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y',
      ...(coverImage?.length ? ['-loop', '1', '-framerate', '2', '-i', cover] : ['-f', 'lavfi', '-i', 'color=c=0x181324:s=1280x720:r=2']),
      '-i', input, '-map', '0:v:0', '-map', '1:a:0', '-vf', 'scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,format=yuv420p',
      '-c:v', 'libx264', '-preset', 'ultrafast', '-tune', 'stillimage', '-c:a', 'aac', '-b:a', '128k', '-shortest', '-movflags', '+faststart', '-fs', String(64 * 1024 * 1024), output];
    await new Promise((resolve, reject) => {
      const child = spawn(ffmpegPath, args, { windowsHide: true });
      let stderr = '';
      const timer = setTimeout(() => { child.kill(); reject(new Error('Audio conversion timed out.')); }, timeoutMs);
      child.stderr.on('data', chunk => { stderr = (stderr + chunk.toString()).slice(-1500); });
      child.once('error', error => { clearTimeout(timer); reject(error); });
      child.once('close', code => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error(`Audio conversion failed: ${stderr}`)); });
    });
    const video = await fs.readFile(output);
    if (!video.length || video.length >= 63 * 1024 * 1024) throw new Error('Audio conversion exceeded the reply size limit.');
    return video;
  } finally { await fs.rm(folder, { force: true, recursive: true }); }
}
