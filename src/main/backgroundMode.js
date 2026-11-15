/** Opt-in background mode: closing the last window keeps team automation
 * running behind a tray icon. Off, idle or without a tray, closing the window
 * quits exactly as before. */

export const BACKGROUND_SETTING_KEY = 'company.keepRunningInBackground';

/** The window-closed decision. Never stay without a visible way back. */
export function shouldStayInBackground({ setting, activeTeams, quitting, trayAvailable }) {
  return setting === true && Number(activeTeams) > 0 && quitting !== true && trayAvailable === true;
}

function trayImage(nativeImage, iconPath, platform) {
  const source = nativeImage.createFromPath(iconPath);
  if (source.isEmpty()) throw new Error('Tray icon is unavailable.');
  const size = platform === 'darwin' ? 18 : platform === 'win32' ? 16 : 24;
  const image = nativeImage.createEmpty();
  for (const scaleFactor of [1, 2]) {
    const side = size * scaleFactor;
    image.addRepresentation({ scaleFactor, width: side, height: side, buffer: source.resize({ width: side, height: side, quality: 'best' }).toPNG() });
  }
  return image;
}

export function createBackgroundMode({ app, Tray, Menu, nativeImage, iconPath, platform = process.platform,
  enabled = () => false, activeTeams = () => 0, open = () => {}, quit = () => app.quit(), report = () => {} }) {
  let tray = null, quitting = false, staying = false;
  const removeTray = () => {
    const current = tray; tray = null;
    if (current && !current.isDestroyed?.()) current.destroy();
  };
  function ensureTray() {
    if (tray) return true;
    try {
      tray = new Tray(trayImage(nativeImage, iconPath, platform));
      tray.setToolTip('BonzAI — teams are running');
      tray.setContextMenu(Menu.buildFromTemplate([
        { label: 'Open BonzAI', click: () => open() },
        { type: 'separator' },
        { label: 'Quit', click: () => quit() },
      ]));
      // A left click on Windows and Linux does not open the menu by itself.
      if (platform !== 'darwin') tray.on('click', () => open());
      return true;
    } catch (error) {
      // e.g. a Linux desktop without a status area: never leave an invisible process.
      removeTray();
      report(error);
      return false;
    }
  }
  app.on('before-quit', () => { quitting = true; staying = false; });
  app.on('will-quit', removeTray);
  return {
    /** Call when the main window has closed. True means: do not quit. */
    windowClosed() {
      const base = { setting: enabled() === true, activeTeams: activeTeams(), quitting };
      // Only create the tray once everything else already says "stay".
      staying = shouldStayInBackground({ ...base, trayAvailable: true })
        && shouldStayInBackground({ ...base, trayAvailable: ensureTray() });
      return staying;
    },
    /** Call when a main window exists again; the tray is only the way back. */
    windowOpened() { staying = false; removeTray(); },
    /** True while the app deliberately runs without a main window. */
    get active() { return staying && !quitting; },
  };
}
