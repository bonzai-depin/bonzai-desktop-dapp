import { runBusinessDemo, ensureDemoDeliverables } from './demo.js';
import { printLocalPdf } from '../gmao/pdf.js';
import { ipcMain, BrowserWindow } from 'electron';
let service;
export function workspaceLicense() {
  // Retired license files, expired receipts and checkout environment variables
  // must never lock local workflows or prevent the application from starting.
  return service ||= { status: () => ({ unlocked: true, licensed: false, free: true, bypassed: false }), assert() {} };
}
export function registerWorkspaceIpc() {
  ipcMain.handle('workspace:demoOpen', (_event, id) => ensureDemoDeliverables(id));
  let demoRunning = false;
  ipcMain.handle('workspace:demo', async (event, kind) => {
    if (demoRunning) throw new Error('A business demonstration is already running.');
    demoRunning = true;
    try { const result = await runBusinessDemo(kind, {printPdf: printLocalPdf, onStep: result => { if(!event.sender.isDestroyed()) event.sender.send('workspace:demo-progress', result); }}); for(const win of BrowserWindow.getAllWindows()) if(!win.isDestroyed()) win.webContents.send('db:companies:changed',{companyId:result.id}); return result; }
    finally { demoRunning = false; }
  });
  ipcMain.handle('workspace:status', () => ({...workspaceLicense().status(), configured: true}));
  // Retain IPC compatibility without opening an obsolete paid checkout.
  for (const channel of ['checkout', 'verify', 'backup', 'restore']) {
    ipcMain.handle(`workspace:${channel}`, () => workspaceLicense().status());
  }
}
