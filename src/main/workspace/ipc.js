import { runBusinessDemo, ensureDemoDeliverables } from './demo.js';
import { printLocalPdf } from '../gmao/pdf.js';
import { app, ipcMain, shell, dialog, BrowserWindow } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { createWorkspaceLicense } from './license.js';
let service;
export function workspaceLicense() {
  return service ||= createWorkspaceLicense({ directory: app.getPath('userData'), paymentRequired: process.env.BONZAI_WORKSPACE_PAYMENT_REQUIRED === '1', publicKey: (process.env.BONZAI_WORKSPACE_PUBLIC_KEY || '').replace(/\\n/g, '\n'), allowTest: !app.isPackaged && process.env.BONZAI_WORKSPACE_TEST === '1' });
}
const base = () => {
  const value = process.env.BONZAI_WORKSPACE_CHECKOUT_URL;
  if (!value) throw new Error('Workspace checkout has not been configured.');
  const u = new URL(value);
  if (u.protocol !== 'https:' && !(process.env.BONZAI_WORKSPACE_TEST === '1' && !app.isPackaged && ['127.0.0.1','localhost'].includes(u.hostname))) throw new Error('Checkout requires HTTPS.');
  return value.replace(/\/$/, '');
};
async function request(route, body) {
  const response = await fetch(base() + route, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Checkout unavailable.');
  return result;
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
  ipcMain.handle('workspace:status', () => ({...workspaceLicense().status(), configured: Boolean(process.env.BONZAI_WORKSPACE_CHECKOUT_URL && process.env.BONZAI_WORKSPACE_PUBLIC_KEY)}));
  ipcMain.handle('workspace:checkout', async (_e, method) => {
    if (!['card','wallet'].includes(method)) throw new Error('Choose a payment method.');
    const result = await request('/checkout', {workspaceId:workspaceLicense().status().workspaceId,method});
    if (result.url) { const url = new URL(result.url); if (url.protocol !== 'https:' || url.hostname !== 'checkout.stripe.com') throw new Error('Untrusted checkout URL.'); await shell.openExternal(url.href); }
    return result;
  });
  ipcMain.handle('workspace:verify', async (_e, input) => {
    const result = await request('/verify', {...input,workspaceId:workspaceLicense().status().workspaceId});
    if (result.receipt) return workspaceLicense().activate(result.receipt);
    return {...workspaceLicense().status(),pending:true};
  });
  ipcMain.handle('workspace:backup', async () => {
    if (!workspaceLicense().status().licensed) throw new Error('No paid license to back up. Temporary access does not require a license.');
    const choice = await dialog.showSaveDialog({defaultPath:'bonzai-workspace-license.json'});
    if (!choice.canceled) await fs.promises.writeFile(choice.filePath,JSON.stringify(workspaceLicense().backup()),{mode:0o600});
  });
  ipcMain.handle('workspace:restore', async () => {
    const choice = await dialog.showOpenDialog({properties:['openFile'],filters:[{name:'Workspace license',extensions:['json']}]});
    if (choice.canceled) return workspaceLicense().status();
    if ((await fs.promises.stat(choice.filePaths[0])).size > 20000) throw new Error('Invalid license file.');
    return workspaceLicense().restore(JSON.parse(await fs.promises.readFile(choice.filePaths[0],'utf8')));
  });
}
