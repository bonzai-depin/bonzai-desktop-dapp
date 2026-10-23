import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { createMediaProduction } from '../src/main/mediaProduction.js';
const exec = promisify(execFile);
const binary = process.env.BONZAI_FFMPEG || path.resolve(`node_modules/ffmpeg-static-electron-forge/dist/bin/${process.platform}/${process.arch}/ffmpeg${process.platform === 'win32' ? '.exe' : ''}`);

test('real FFmpeg assembles music and anime, preserves audio, and rejects incomplete timelines', { timeout: 60000 }, async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'bonzai-production-'));
  const service = createMediaProduction({ directory: path.join(root, 'outputs'), ffmpeg: () => binary });
  const video = path.join(root, 'video.mp4'), silent = path.join(root, 'silent.mp4'), song = path.join(root, 'song.wav');
  try {
    await exec(binary, ['-y', '-f','lavfi','-i','color=c=blue:s=128x128:r=24','-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-t','1','-c:v','libx264','-threads','1','-pix_fmt','yuv420p','-c:a','aac',video]);
    await exec(binary, ['-y','-i',video,'-an','-c:v','copy',silent]);
    await exec(binary, ['-y','-f','lavfi','-i','sine=frequency=220:sample_rate=48000','-t','1.5',song]);
    const saved = await service.prepare({ source: song, kind: 'audio' });
    assert.equal((await service.probe(saved.path)).durationSeconds, 1.5);
    assert.equal((await service.prepare({ source: song, kind: 'audio' })).path, saved.path);
    const music = await service.compose({ kind: 'video', clips: [{ source: video, duration: .75 }, { source: silent, duration: .75 }], soundtrack: saved.path });
    const result = await service.probe(music.path);
    assert.ok(result.hasAudio && result.hasVideo);
    assert.ok(Math.abs(result.durationSeconds - 1.5) < .1);
    const anime = await service.compose({ kind:'video', clips: [{ source: video, duration: 1 }, { source: silent, duration: 1 }], height:512, fit:'contain' });
    assert.equal((await service.probe(anime.path)).hasAudio, true);
    const podcast = await service.compose({ kind: 'audio', clips: [{ source: song }, { source: song }] });
    assert.equal((await service.probe(podcast.path)).durationSeconds, 3);
    await assert.rejects(service.compose({kind:'video',clips:[{source:video,duration:3}]}), /shorter/);
    await assert.rejects(service.compose({kind:'video',clips:[{source:video,duration:1}],soundtrack:song}), /complete soundtrack/);
    await assert.rejects(service.prepare({source:'https://example.com/remote.mp4',kind:'video'}), /Only local/);
    assert.ok(!(await readdir(path.join(root,'outputs'), {withFileTypes:true})).some(item => item.isDirectory()), 'temporary assembly files are cleaned after success and failure');
  } finally { await rm(root,{recursive:true,force:true}); }
});
