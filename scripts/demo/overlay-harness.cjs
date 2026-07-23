const { app, BrowserWindow } = require("electron");

const source = process.argv[2];
if (!source) throw new Error("Overlay harness requires an SVG source");

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1920,
    height: 1080,
    show: false,
    transparent: true,
    frame: false,
    webPreferences: { backgroundThrottling: false },
  });
  await win.loadFile(source);
});

app.on("window-all-closed", () => app.quit());
