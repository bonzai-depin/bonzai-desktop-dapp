// npx electron test/video-fullscreen-electron.mjs — isolated profile, no app services.
import { app, BrowserWindow, session } from 'electron';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const root = mkdtempSync(path.join(tmpdir(), 'bonzai-fullscreen-'));
app.setPath('userData', path.join(root, 'profile'));
app.on('window-all-closed', () => {});
const deadline = setTimeout(() => app.exit(1), 30000);
let win;
app.whenReady().then(async () => {
try {
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  vm.runInNewContext(main.slice(main.indexOf('function isTrustedRendererUrl('), main.indexOf('app.on("ready",')) + '\nconfigureRendererPermissions();', { session, VITE_DEV_SERVER_URL: undefined });
  const page = path.join(root, 'video.html');
  writeFileSync(page, '<video controls></video>');
  win = new BrowserWindow({ show:true, webPreferences: { sandbox:true, contextIsolation:true } });
  await win.loadFile(page);
  const entered = await win.webContents.executeJavaScript(`(async () => {
    const video = document.querySelector('video');
    await video.requestFullscreen();
    return document.fullscreenElement === video;
  })()`, true);
  assert.equal(entered, true);
  await win.webContents.executeJavaScript('document.exitFullscreen()', true);
  assert.equal(await win.webContents.executeJavaScript('document.fullscreenElement === null'), true);
  console.log('PASS: video enters and exits fullscreen with production permission handlers');
  win.destroy();
  clearTimeout(deadline);
  app.exit(0);
} catch (error) {
  console.error(error);
  win?.destroy();
  clearTimeout(deadline);
  app.exit(1);
} finally { rmSync(root, {recursive:true, force:true}); }
});
