// Business reason: closing the window must only keep teams running when the
// owner asked for it, a team is actually active, and there is a visible way
// back. In every other case the app quits exactly as it always has.
import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { shouldStayInBackground, createBackgroundMode } from '../src/main/backgroundMode.js';

test('the window-closed decision stays in the background only when every condition holds', () => {
  const yes = { setting: true, activeTeams: 1, quitting: false, trayAvailable: true };
  assert.equal(shouldStayInBackground(yes), true);
  assert.equal(shouldStayInBackground({ ...yes, activeTeams: 4 }), true);
  for (const change of [{ setting: false }, { setting: undefined }, { setting: 'true' }, { activeTeams: 0 }, { activeTeams: undefined }, { quitting: true }, { trayAvailable: false }, { trayAvailable: undefined }]) {
    assert.equal(shouldStayInBackground({ ...yes, ...change }), false, JSON.stringify(change));
  }
});

function harness({ setting = true, teams = 1, trayThrows = false, emptyIcon = false, platform = 'linux' } = {}) {
  const app = new EventEmitter(), trays = [], calls = [], reports = [];
  const state = { setting, teams };
  class Tray extends EventEmitter {
    constructor(image) { super(); if (trayThrows) throw new Error('no status area'); this.image = image; trays.push(this); }
    setToolTip(text) { this.tip = text; }
    setContextMenu(menu) { this.menu = menu; }
    isDestroyed() { return !!this.destroyed; }
    destroy() { this.destroyed = true; }
  }
  const picture = () => ({ isEmpty: () => emptyIcon, resize: size => ({ toPNG: () => Buffer.from(`png${size.width}`) }), reps: [], addRepresentation(rep) { this.reps.push(rep); } });
  const nativeImage = { createFromPath: picture, createEmpty: picture };
  const Menu = { buildFromTemplate: template => template };
  const mode = createBackgroundMode({ app, Tray, Menu, nativeImage, iconPath: '/fixture/logo.png', platform,
    enabled: () => state.setting, activeTeams: () => state.teams, open: () => calls.push('open'), quit: () => { calls.push('quit'); app.emit('before-quit'); app.emit('will-quit'); }, report: error => reports.push(error.message) });
  return { app, mode, trays, calls, reports, state };
}

test('off by default behaviour: closing the window quits and no tray appears', () => {
  for (const options of [{ setting: false }, { teams: 0 }]) {
    const h = harness(options);
    assert.equal(h.mode.windowClosed(), false);
    assert.equal(h.mode.active, false);
    assert.equal(h.trays.length, 0);
  }
});

test('on with an active team: the app stays behind a tray that can reopen or fully quit', () => {
  const h = harness();
  assert.equal(h.mode.windowClosed(), true);
  assert.equal(h.mode.active, true);
  assert.equal(h.trays.length, 1);
  const [tray] = h.trays;
  assert.deepEqual(tray.menu.filter(entry => entry.label).map(entry => entry.label), ['Open BonzAI', 'Quit']);
  assert.deepEqual(tray.image.reps.map(rep => [rep.scaleFactor, rep.width]), [[1, 24], [2, 48]]);
  tray.menu[0].click();
  assert.deepEqual(h.calls, ['open']);
  h.mode.windowOpened();
  assert.equal(tray.destroyed, true, 'the tray is only the way back while no window exists');
  assert.equal(h.mode.active, false);
  // Closing again reuses the same path; Quit runs the normal quit sequence.
  assert.equal(h.mode.windowClosed(), true);
  h.trays[1].menu.at(-1).click();
  assert.deepEqual(h.calls, ['open', 'quit']);
  assert.equal(h.mode.active, false);
  assert.equal(h.trays[1].destroyed, true);
  assert.equal(h.mode.windowClosed(), false, 'a window closing during quit never revives the session');
  assert.equal(h.trays.length, 2);
});

test('Cmd+Q and other quit paths win over background mode', () => {
  const h = harness({ platform: 'darwin' });
  h.app.emit('before-quit');
  assert.equal(h.mode.windowClosed(), false);
  assert.equal(h.trays.length, 0);
});

test('without a working tray the app quits instead of running invisibly', () => {
  for (const options of [{ trayThrows: true }, { emptyIcon: true }]) {
    const h = harness(options);
    assert.equal(h.mode.windowClosed(), false);
    assert.equal(h.mode.active, false);
    assert.equal(h.reports.length, 1);
  }
});

test('the last active team pausing before the window closes restores the normal quit', () => {
  const h = harness();
  h.state.teams = 0;
  assert.equal(h.mode.windowClosed(), false);
  h.state.teams = 2; h.state.setting = false;
  assert.equal(h.mode.windowClosed(), false);
});

test('the runtime host reports its active teams and recognises only its own worker as a trusted sender', async () => {
  const { createCompanyRuntime } = await import('../src/main/companyRuntime.js');
  const ipc = new EventEmitter(), app = new EventEmitter(); ipc.handle = () => {};
  let worker;
  class Window extends EventEmitter {
    constructor() { super(); this.webContents = new EventEmitter(); this.webContents.id = 5; this.webContents.setWindowOpenHandler = () => {}; this.webContents.send = () => {}; worker = this; }
    loadURL() { queueMicrotask(() => ipc.emit('company-runtime:ready', { sender: this.webContents })); return Promise.resolve(); }
    isDestroyed() { return !!this.destroyed; }
    destroy() { this.destroyed = true; this.emit('closed'); }
  }
  const host = createCompanyRuntime({ BrowserWindow: Window, ipcMain: ipc, app, preload: '/fixture/preload', url: 'http://localhost/company-runtime.html', getUI: () => null });
  try {
    assert.equal(host.activeTeams(), 0);
    assert.equal(host.ownsSender(undefined), false, 'nothing is trusted before the worker exists');
    await host.start();
    assert.equal(host.ownsSender(worker.webContents), true);
    assert.equal(host.ownsSender(new EventEmitter()), false);
    ipc.emit('company-runtime:stream', { sender: {} }, { type: 'runtime-state', activeTeams: 9 });
    assert.equal(host.activeTeams(), 0, 'another window cannot claim teams are active');
    ipc.emit('company-runtime:stream', { sender: worker.webContents }, { type: 'runtime-state', activeTeams: 2 });
    assert.equal(host.activeTeams(), 2);
  } finally {
    app.emit('before-quit');
    assert.equal(host.ownsSender(worker.webContents), false);
  }
});
