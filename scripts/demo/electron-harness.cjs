const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("node:path");

const repoRoot = process.argv[2];
if (!repoRoot) throw new Error("Demo harness requires the repository root");

const memoryStore = new Map();
ipcMain.handle("store-get", (_event, key, defaultValue) => memoryStore.has(key) ? memoryStore.get(key) : defaultValue);
ipcMain.handle("store-has", (_event, key) => memoryStore.has(key));
ipcMain.handle("store-set", (_event, key, value) => { memoryStore.set(key, value); return true; });
ipcMain.handle("store-delete", (_event, key) => memoryStore.delete(key));
ipcMain.handle("db:companies:listIds", () => []);
ipcMain.handle("db:companies:list", () => []);
ipcMain.handle("db:companies:get", () => null);
ipcMain.handle("get-system-info", () => ({ platform: process.platform, totalMemory: 16 * 1024 ** 3, freeMemory: 8 * 1024 ** 3 }));

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1920,
    height: 1080,
    show: true,
    backgroundColor: "#f5efe3",
    webPreferences: { preload: path.join(repoRoot, ".vite/build/preload.js") },
  });
  await win.loadFile(path.join(repoRoot, ".vite/renderer/main_window/index.html"));
});

app.on("window-all-closed", () => app.quit());
