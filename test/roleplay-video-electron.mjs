// Run: npx electron test/roleplay-video-electron.mjs
// Optional BONZAI_TEST_VIDEO points to an existing MP4, read/copy only.
// Own temporary profile, Vite server and synthetic video; never touches a live session.
import { app, BrowserWindow, protocol } from 'electron';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { BLOB_MEDIA_SCHEME, createBlobProtocolHandler } from '../src/main/localMediaProtocol.js';

const root = mkdtempSync(path.join(os.tmpdir(), 'bonzai-video-electron-'));
const repo = fileURLToPath(new URL('..', import.meta.url));
app.setPath('userData', path.join(root, 'profile'));
app.on('window-all-closed', () => {});
protocol.registerSchemesAsPrivileged([BLOB_MEDIA_SCHEME]);
let vite, win;
let exitCode = 0;
const requests = [];
const deadline = setTimeout(() => { console.error('FAIL: playback test timed out'); app.exit(1); }, 60000);

async function waitFor(expression) {
  const until = Date.now() + 10000;
  while (Date.now() < until) {
    if (await win.webContents.executeJavaScript(expression)) return;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  const state = await win.webContents.executeJavaScript(`(() => { const v=document.querySelector('video'); return {error:v?.error?.message, readyState:v?.readyState, time:v?.currentTime}; })()`);
  throw new Error(`Timed out: ${expression}\n${JSON.stringify(state)}`);
}

app.whenReady().then(async () => {
  try {
    const clip = path.join(root, 'generated clip.mp4');
    if (process.env.BONZAI_TEST_VIDEO) writeFileSync(clip, readFileSync(process.env.BONZAI_TEST_VIDEO));
    else {
      const ffmpeg = process.env.BONZAI_FFMPEG || path.join(repo, 'node_modules/ffmpeg-static-electron-forge/dist/bin', process.platform, process.arch, process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
      await promisify(execFile)(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=24', '-t', '3', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', clip]);
    }
    const bytes = readFileSync(clip);
    // A late MP4 index must work without remuxing or regenerating the file.
    assert.ok(bytes.indexOf(Buffer.from('moov')) > bytes.indexOf(Buffer.from('mdat')));
    const id = createHash('sha256').update(bytes).digest('hex');
    const blobRoot = path.join(root, 'blobs');
    const store = (hash, content) => {
      mkdirSync(path.join(blobRoot, hash.slice(0, 2)), { recursive: true });
      writeFileSync(path.join(blobRoot, hash.slice(0, 2), `${hash}.mp4`), content);
    };
    store(id, bytes);
    const handle = createBlobProtocolHandler(blobRoot);
    protocol.handle('bonzai-blob', async request => {
      const response = await handle(request);
      requests.push({ range: request.headers.get('range'), status: response.status, length: response.headers.get('content-length') });
      return response;
    });

    const { createServer } = await import('vite');
    const { default: vue } = await import('@vitejs/plugin-vue');
    vite = await createServer({
      root: repo, configFile: false,
      cacheDir: path.join(root, 'vite-cache'), logLevel: 'error',
      server: { host: '127.0.0.1', port: 0 },
      plugins: [vue(), {
        name: 'roleplay-playback-fixture',
        resolveId(id) { if (id === 'virtual:roleplay-video-test') return '\0roleplay-video-test'; },
        load(id) {
          if (id !== '\0roleplay-video-test') return;
          return `import { createApp, h, ref } from 'vue';
            import Player from '/src/components/skills/RoleplayVideoPlayer.vue';
            import '/src/assets/tokens.css';
            window.source = ref('');
            createApp({render:()=>h(Player,{source:window.source.value})}).mount('#fixture');
            window.playerMounted = true;`;
        },
        configureServer(server) {
          server.middlewares.use('/playback-test', (_req, res) => {
            res.setHeader('Content-Type', 'text/html');
            res.end('<div id="fixture"></div><script type="module" src="/@id/virtual:roleplay-video-test"></script>');
          });
        },
      }],
    });
    await vite.listen();
    const origin = `http://127.0.0.1:${vite.httpServer.address().port}`;
    win = new BrowserWindow({ show: false, width: 1100, height: 800, webPreferences: { sandbox: true, contextIsolation: true } });
    await win.loadURL(`${origin}/playback-test`);
    await waitFor('window.playerMounted');
    const source = `bonzai-blob://${id}.mp4`;
    await win.webContents.executeJavaScript(`window.source.value = ${JSON.stringify(source)}`);
    await waitFor("document.querySelector('video')?.readyState >= 2");
    await win.webContents.executeJavaScript("document.querySelector('video').play()", true);
    await waitFor("document.querySelector('video').currentTime > .15");
    await win.webContents.executeJavaScript("document.querySelector('video').currentTime = document.querySelector('video').duration * .7");
    await waitFor("!document.querySelector('video').seeking && document.querySelector('video').currentTime > document.querySelector('video').duration * .7 + .1");
    assert.ok(requests.some(r => r.status === 206 && Number(r.length) > 0));
    assert.equal(await win.webContents.executeJavaScript("Boolean(document.querySelector('[role=alert]'))"), false);

    // A saved chat reopened in a new renderer must still play, including canonical '/'.
    await win.loadURL(`${origin}/playback-test`);
    await waitFor('window.playerMounted');
    await win.webContents.executeJavaScript(`window.source.value = ${JSON.stringify(source + '/')}`);
    await waitFor("document.querySelector('video')?.readyState >= 2");
    await win.webContents.executeJavaScript("document.querySelector('video').play()", true);
    await waitFor("document.querySelector('video').currentTime > .15");

    // Missing data remains an actual error; Retry recovers once the file is available.
    win.setSize(390, 700);
    const missing = 'b'.repeat(64);
    await win.webContents.executeJavaScript(`window.source.value = 'bonzai-blob://${missing}.mp4'`);
    await waitFor("Boolean(document.querySelector('[role=alert]'))");
    store(missing, bytes);
    await win.webContents.executeJavaScript("document.querySelector('[role=alert] button').click()", true);
    await waitFor("document.querySelector('video').currentTime > .15");
    assert.equal(await win.webContents.executeJavaScript("Boolean(document.querySelector('[role=alert]'))"), false);

    console.log('PASS: real MP4 in roleplay, seek, saved-chat reload, missing-file retry');
  } catch (error) {
    console.error(error);
    console.error('Media responses:', requests);
    exitCode = 1;
  } finally {
    clearTimeout(deadline);
    win?.destroy();
    await vite?.close();
    rmSync(root, { recursive: true, force: true });
    app.exit(exitCode);
  }
});
