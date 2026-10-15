/** Main-process supervision for the native company executor. The hidden local
 * renderer reuses the existing inference/workflow adapters without owning UI. */
export function createCompanyRuntime({ BrowserWindow, ipcMain, app, preload, url, file, getUI, powerSaveBlocker, onInterrupted = () => {} }) {
  let worker = null, ready = null, stopping = false, restartTimer, stableTimer, failures = 0;
  let sleepBlocker = null;
  function protectExecution(active) {
    if (active && sleepBlocker === null && powerSaveBlocker) sleepBlocker = powerSaveBlocker.start('prevent-app-suspension');
    if (!active && sleepBlocker !== null) { powerSaveBlocker.stop(sleepBlocker); sleepBlocker = null; }
  }
  let sequence = 0;
  const pending = new Map();
  const commands = new Set(['boot', 'start', 'stop', 'tickCEO', 'tickRole', 'approve', 'wake', 'workerValidate', 'workerIdentity', 'workerSignature', 'workerVerifyJob', 'workerExecute']);
  const settleAll = reason => {
    for (const job of pending.values()) { clearTimeout(job.timer); job.reject(new Error(reason)); }
    pending.clear();
  };
  const isWorker = event => worker && event.sender === worker.webContents;
  function start() {
    if (ready) return ready;
    clearTimeout(restartTimer);
    stopping = false;
    ready = new Promise((resolve, reject) => {
      const win = new BrowserWindow({ show: false, skipTaskbar: true,
        webPreferences: { preload, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
      worker = win;
      const timeout = setTimeout(() => fail('The company runtime did not start.'), 90000);
      const onReady = (event, error) => {
        if (event.sender !== win.webContents) return;
        if (error) return fail(String(error));
        clearTimeout(timeout); ipcMain.removeListener('company-runtime:ready', onReady);
        // Reset only after a healthy minute, not after a brief crash-loop startup.
        stableTimer = setTimeout(() => { if (worker === win) failures = 0; }, 60000);
        const ui = getUI();
        if (ui && !ui.isDestroyed()) ui.webContents.send('company-runtime:status', {status:'ready'});
        resolve();
      };
      const fail = reason => {
        if (worker !== win) return;
        clearTimeout(stableTimer);
        clearTimeout(timeout); ipcMain.removeListener('company-runtime:ready', onReady);
        ready = null; worker = null;
        settleAll(reason); reject(new Error(reason));
        if (!stopping) { try { onInterrupted(win.webContents.id); } catch (error) { report(error); } }
        if (!win.isDestroyed()) win.destroy();
        // Durable leases expire naturally; uncertain effects require review.
        // Never steal an active lease or blindly replay a crashed request.
        if (!stopping && ++failures <= 3) restartTimer = setTimeout(() => { void start().catch(report); }, failures * 5000);
        report(new Error(reason));
      };
      ipcMain.on('company-runtime:ready', onReady);
      win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      win.webContents.on('will-navigate', event => event.preventDefault());
      win.webContents.on('render-process-gone', () => fail('Company execution was interrupted. Saved work will be recovered.'));
      win.on('closed', () => fail('Company execution stopped.'));
      Promise.resolve(url ? win.loadURL(url) : win.loadFile(file)).catch(error => fail(error.message));
    });
    return ready;
  }
  function report(error) {
    const ui = getUI();
    if (ui && !ui.isDestroyed()) ui.webContents.send('company-runtime:status', { status: 'error', message: error.message });
  }
  async function command(name, args = []) {
    if (!commands.has(name)) throw new Error('Unsupported company runtime command.');
    await start();
    if (!worker || stopping) throw new Error('Company execution is unavailable.');
    const requestId = String(++sequence);
    return new Promise((resolve, reject) => {
      // A timeout only ends the UI request. It never retries an external action.
      const timer = setTimeout(() => { pending.delete(requestId); reject(new Error('The task is still running. Check its saved progress before trying again.')); }, (name === 'workerExecute' ? 180 : 30) * 60 * 1000);
      pending.set(requestId, { resolve, reject, timer });
      worker.webContents.send('company-runtime:command', { requestId, name, args });
    });
  }
  ipcMain.handle('company-runtime:invoke', (event, name, args) => {
    if (event.sender !== getUI()?.webContents) throw new Error('Company commands must come from the application workspace.');
    if (name.startsWith('worker')) throw new Error('Worker commands require scoped dispatch.');
    if (!Array.isArray(args) || args.length > 3) throw new Error('Invalid company command.');
    return command(name, args);
  });
  ipcMain.on('company-runtime:result', (event, result) => {
    if (!isWorker(event)) return;
    const job = pending.get(result?.requestId);
    if (!job) return;
    clearTimeout(job.timer); pending.delete(result.requestId);
    if (result.error) job.reject(new Error(result.error)); else job.resolve(result.value);
  });
  ipcMain.on('company-runtime:stream', (event, payload) => {
    if (!isWorker(event)) return;
    if (payload?.type === 'runtime-state') protectExecution(payload.activeTeams > 0);
    const ui = getUI();
    if (ui && !ui.isDestroyed()) ui.webContents.send('company-runtime:stream', payload);
  });
  app.on('before-quit', () => {
    stopping = true; protectExecution(false); clearTimeout(restartTimer); clearTimeout(stableTimer); settleAll('BonzAI is closing.');
    const win = worker; worker = null; ready = null;
    if (win && !win.isDestroyed()) win.destroy();
  });
  return { start, command };
}
