import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

/** Generated code runs without preload, credentials, app storage or network access. */
export async function exportWorker3D(code, { BrowserWindow, url, file, timeoutMs = 120000 }) {
  if (typeof code !== 'string' || !code.trim() || Buffer.byteLength(code) > 1024 * 1024) throw new Error('Invalid 3D source.');
  const win = new BrowserWindow({ show: false, width: 640, height: 640, webPreferences: {
    sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false,
    partition: `worker-3d-${randomUUID()}`,
  } });
  let timer;
  try {
    const session = win.webContents.session;
    session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
    session.setPermissionCheckHandler(() => false);
    session.on('will-download', event => event.preventDefault());
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', event => event.preventDefault());
    let executing = false;
    session.webRequest.onBeforeRequest((details, callback) => {
      let allowed = false;
      try {
        const target = new URL(details.url);
        if (['blob:', 'data:'].includes(target.protocol)) allowed = true;
        else if (!executing && url) allowed = target.origin === new URL(url).origin;
        else if (!executing && target.protocol === 'file:') {
          const relative = path.relative(path.dirname(file), fileURLToPath(target));
          allowed = relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
        }
      } catch {}
      callback({ cancel: !allowed });
    });
    return await Promise.race([
      (async () => {
        await (url ? win.loadURL(url) : win.loadFile(file));
        await win.webContents.executeJavaScript('window.worker3DReady');
        // The renderer imports its modules before this boundary. Generated code
        // cannot use HTTP, file URLs, sockets, images or imports to exfiltrate.
        executing = true;
        return await win.webContents.executeJavaScript(`window.exportWorkerGLB(${JSON.stringify(code)})`);
      })(),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('3D export timed out.')), timeoutMs); }),
    ]);
  } finally { clearTimeout(timer); if (!win.isDestroyed()) win.destroy(); }
}
