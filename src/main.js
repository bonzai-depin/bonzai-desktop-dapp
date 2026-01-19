// main.js
import {
  BrowserWindow,
  app,
  ipcMain,
  protocol,
  screen,
  shell,
  dialog,
  net,
  session,
} from "electron";
import Store from "electron-store";
import os from "os";
import fs from "fs";
import si from "systeminformation";
import psTree from "ps-tree";
import { getLlama, LlamaChatSession } from "node-llama-cpp";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { download } from "electron-dl";
import { unlink } from "node:fs";
import child_process from "child_process";

// ─────────────────────────────────────────────────────────────────────────────
// Globals / paths
// ─────────────────────────────────────────────────────────────────────────────
let llama = null;
try {
  llama = await getLlama();
} catch (error) {
  console.warn("node-llama-cpp initialization failed:", error.message);
  // Continue without LLM support - app will still work for other features
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Unified model directory (same as diffuser.py uses for diffusion models)
const MODEL_DIR = path.join(os.homedir(), "bonzai-models");
// Ensure directory exists
fs.mkdirSync(MODEL_DIR, { recursive: true });

// Dev/prod detection - app.isPackaged is true when running from packaged app
const isDev = !app.isPackaged;
const VITE_DEV_SERVER_URL = isDev ? "http://localhost:5173" : null;

let subpy = null;
const PY_SERVER_PORT = 65000;

// ─────────────────────────────────────────────────────────────────────────────
// Server self-healing configuration
// ─────────────────────────────────────────────────────────────────────────────
let serverRestartCount = 0;
let lastRestartTime = 0;
let restartBackoffMs = 2000; // Start with 2 seconds
const MAX_RESTART_ATTEMPTS = 5;
const RESTART_COOLDOWN_MS = 60000; // Reset counter after 1 minute of stability
const MAX_BACKOFF_MS = 30000; // Max 30 seconds between restarts
let isIntentionalShutdown = false; // Track if shutdown was intentional
let mainWindow = null; // Reference to main window for IPC

const PLATFORM_KEY =
  process.platform === "darwin"
    ? "macos"
    : process.platform === "win32"
      ? "windows"
      : "linux";
const ARCH_KEY = process.arch === "arm64" ? "arm64" : "x64";

// ─────────────────────────────────────────────────────────────────────────────
// Python server launcher
// - dev: run system python on src/server/diffuser.py
// - packaged (onedir): resources/server/python-runtime/<platform>-<arch>/diffuser(.exe)
//   PyInstaller onedir mode - executable + _internal/ folder with shared libraries
// ─────────────────────────────────────────────────────────────────────────────
function resolvePythonLaunch(port = PY_SERVER_PORT) {
  if (!app.isPackaged) {
    const candidates = [
      path.resolve(__dirname, "server", "diffuser.py"),
      path.resolve(__dirname, "../server", "diffuser.py"),
      path.resolve(__dirname, "../src/server", "diffuser.py"),
      path.resolve(process.cwd(), "src/server", "diffuser.py"),
    ];
    const script = candidates.find((p) => fs.existsSync(p));
    if (!script)
      throw new Error(
        `dev diffuser.py not found. Searched:\n${candidates.join("\n")}`
      );
    return {
      mode: "dev",
      cmd: process.platform === "win32" ? "python" : "python3",
      args: [script, `--port=${port}`],
      cwd: path.dirname(script),
    };
  }

  const onefilePath = path.join(
    process.resourcesPath,
    "server",
    "python-binary"
  );
  if (fs.existsSync(onefilePath) && fs.statSync(onefilePath).isFile()) {
    return {
      mode: "onefile",
      cmd: onefilePath,
      args: [`--port=${port}`],
      cwd: path.dirname(onefilePath),
    };
  }

  const runtimeDir = path.join(
    process.resourcesPath,
    "server",
    "python-runtime",
    `${PLATFORM_KEY}-${ARCH_KEY}`
  );
  const exeName = process.platform === "win32" ? "diffuser.exe" : "diffuser";
  const exePath = path.join(runtimeDir, exeName);
  if (fs.existsSync(exePath)) {
    return {
      mode: "onedir",
      cmd: exePath,
      args: [`--port=${port}`],
      cwd: runtimeDir,
    };
  }

  throw new Error(
    `No packaged Python runtime found.\nSearched:\n- ${onefilePath}\n- ${exePath}`
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Server status notifications to renderer
// ─────────────────────────────────────────────────────────────────────────────
const notifyServerStatus = (status, details = {}) => {
  const windows = BrowserWindow.getAllWindows();
  windows.forEach((win) => {
    if (!win.isDestroyed()) {
      win.webContents.send("server-status", { status, ...details });
    }
  });
  console.log(`[Server Status] ${status}`, details);
};

const scheduleServerRestart = () => {
  const now = Date.now();

  // Reset counter if server was stable for a while
  if (now - lastRestartTime > RESTART_COOLDOWN_MS) {
    serverRestartCount = 0;
    restartBackoffMs = 2000;
  }

  serverRestartCount++;
  lastRestartTime = now;

  if (serverRestartCount > MAX_RESTART_ATTEMPTS) {
    console.error(
      `[Self-Healing] Max restart attempts (${MAX_RESTART_ATTEMPTS}) exceeded. Server will not restart.`
    );
    notifyServerStatus("crashed", {
      message: "Server crashed too many times. Please restart the application.",
      restartCount: serverRestartCount,
      canRetry: true,
    });
    return;
  }

  console.log(
    `[Self-Healing] Scheduling restart attempt ${serverRestartCount}/${MAX_RESTART_ATTEMPTS} in ${restartBackoffMs}ms`
  );
  notifyServerStatus("restarting", {
    message: `Server crashed. Restarting in ${Math.round(restartBackoffMs / 1000)}s...`,
    restartCount: serverRestartCount,
    backoffMs: restartBackoffMs,
  });

  setTimeout(() => {
    console.log(`[Self-Healing] Attempting restart...`);
    startPythonSubprocess();
  }, restartBackoffMs);

  // Exponential backoff with cap
  restartBackoffMs = Math.min(restartBackoffMs * 2, MAX_BACKOFF_MS);
};

const killPort = (port = PY_SERVER_PORT) => {
  try {
    if (process.platform === "win32") {
      child_process.execSync(
        `for /f "tokens=5" %a in ('netstat -aon ^| find ":${port}" ^| find "LISTENING"') do taskkill /f /pid %a`,
        { stdio: "ignore" }
      );
    } else {
      child_process.execSync(`lsof -ti:${port} | xargs kill -9`, {
        stdio: "ignore",
      });
    }
    console.log(`[killPort] Freed port ${port}`);
  } catch {
    // no-op
  }
};

const startPythonSubprocess = () => {
  killPort(PY_SERVER_PORT);
  isIntentionalShutdown = false; // Reset flag on new start

  let launch;
  try {
    launch = resolvePythonLaunch(PY_SERVER_PORT);
  } catch (e) {
    console.error(e.message);
    notifyServerStatus("error", { message: e.message });
    return;
  }

  console.log(
    `Starting diffuser [${launch.mode}] → ${launch.cmd} ${launch.args.join(" ")}`
  );
  notifyServerStatus("starting", { message: "Starting ML server..." });

  const env = { ...process.env, PYTHONUNBUFFERED: "1" };

  subpy = child_process.spawn(launch.cmd, launch.args, {
    cwd: launch.cwd,
    env,
    stdio: ["ignore", "pipe", "pipe"],
    shell: false,
  });

  subpy.stdout.on("data", (d) => process.stdout.write(`Python stdout: ${d}`));
  subpy.stderr.on("data", (d) => process.stderr.write(`Python stderr: ${d}`));

  subpy.on("close", (code) => {
    console.log(`Python subprocess exited with code ${code}`);
    const wasRunning = subpy !== null;
    subpy = null;

    // Don't restart if it was intentional (user/app triggered)
    if (isIntentionalShutdown) {
      console.log("[Self-Healing] Intentional shutdown, not restarting.");
      notifyServerStatus("stopped", { message: "Server stopped." });
      return;
    }

    // Crash detected - schedule restart
    if (wasRunning || code !== 0 || code === null) {
      console.log(`[Self-Healing] Unexpected exit (code=${code}), triggering restart...`);
      notifyServerStatus("crashed", {
        message: `Server crashed (exit code: ${code ?? "OOM/killed"})`,
        exitCode: code,
      });
      scheduleServerRestart();
    }
  });

  subpy.on("error", (err) => {
    console.error(`Failed to start Python subprocess: ${err}`);
    notifyServerStatus("error", { message: err.message });
  });
};

const killPythonSubprocess = () => {
  console.log("Killing diffuser...");
  isIntentionalShutdown = true; // Mark as intentional to prevent auto-restart
  return new Promise((resolve) => {
    if (!subpy || !subpy.pid) return resolve();
    const pid = subpy.pid;

    psTree(pid, () => {
      if (process.platform === "win32") {
        child_process.exec(`taskkill /PID ${pid} /T /F`, () => resolve());
      } else {
        try {
          process.kill(pid, "SIGKILL");
        } catch {}
        resolve();
      }
      subpy = null;
    });
  });
};

const checkPythonServer = async (url, silent = false) => {
  const deadlineMs = Date.now() + 30000; // 30s
  while (Date.now() < deadlineMs) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        // Server is ready - reset restart counter (stability achieved)
        serverRestartCount = 0;
        restartBackoffMs = 2000;
        notifyServerStatus("ready", { message: "ML server is ready." });
        return true;
      }
    } catch {}
    if (!silent) console.log("Waiting for Python server…");
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("Python server did not start within timeout.");
};

// Manual restart handler (can be called from renderer when max restarts exceeded)
const restartServerManually = async () => {
  console.log("[Manual Restart] User requested server restart");
  serverRestartCount = 0; // Reset counter for manual restart
  restartBackoffMs = 2000;
  isIntentionalShutdown = true; // Prevent auto-restart from killing
  await killPythonSubprocess();
  isIntentionalShutdown = false;
  startPythonSubprocess();
  try {
    await checkPythonServer(`http://127.0.0.1:${PY_SERVER_PORT}`, true);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Protocol for local file reads (images, etc.)
// ─────────────────────────────────────────────────────────────────────────────
protocol.registerSchemesAsPrivileged([
  { scheme: "app", privileges: { bypassCSP: true } },
]);

app.whenReady().then(() => {
  protocol.handle("app", (req) => {
    const { pathname } = new URL(req.url);
    return net.fetch(pathToFileURL(pathname).toString());
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Squirrel (Windows) early-exit
// ─────────────────────────────────────────────────────────────────────────────
// Handle Squirrel events for Windows installer (install/update/uninstall)
if (process.platform === "win32") {
  try {
    const { default: squirrelStartup } = await import("electron-squirrel-startup");
    if (squirrelStartup) {
      app.quit();
    }
  } catch {
    // Package not available or not in Squirrel context - continue normally
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Store helpers
// ─────────────────────────────────────────────────────────────────────────────
const store = new Store();

ipcMain.handle("store-get", (_event, key, def) => store.get(key, def));
ipcMain.handle("store-set", (_event, key, value) => {
  store.set(key, value);
  return true;
});
ipcMain.handle("store-delete", (_event, key) => {
  store.delete(key);
  return true;
});

// File existence check for media validation
ipcMain.handle("file-exists", (_event, filePath) => {
  try {
    return fs.existsSync(filePath);
  } catch {
    return false;
  }
});

// Open URL in default browser
ipcMain.handle("open-external", async (_event, url) => {
  if (typeof url === "string" && url.startsWith("https://")) {
    // shell is already imported at top of file
    await shell.openExternal(url);
    return { success: true };
  }
  return { success: false, error: "Invalid URL" };
});

ipcMain.handle("agent-save-image", async (_event, defaultName, base64Data) => {
  const { canceled, filePath } = await dialog.showSaveDialog({
    defaultPath: defaultName,
    filters: [{ name: "Images", extensions: ["png"] }],
  });
  if (canceled || !filePath) return { success: false };

  const b64 = base64Data.replace(/^data:image\/\w+;base64,/, "");
  const buf = Buffer.from(b64, "base64");
  try {
    fs.writeFileSync(filePath, buf);
    return { success: true, path: filePath };
  } catch (e) {
    console.error("Failed to save:", e);
    return { success: false, error: e.message };
  }
});

ipcMain.handle("agent-save-audio", async (_event, defaultName, sourcePath) => {
  // Determine file extension from source path
  const ext = path.extname(sourcePath).slice(1) || "wav";
  const { canceled, filePath } = await dialog.showSaveDialog({
    defaultPath: defaultName,
    filters: [{ name: "Audio", extensions: [ext, "wav", "mp3", "flac"] }],
  });
  if (canceled || !filePath) return { success: false };

  try {
    fs.copyFileSync(sourcePath, filePath);
    return { success: true, path: filePath };
  } catch (e) {
    console.error("Failed to save audio:", e);
    return { success: false, error: e.message };
  }
});

ipcMain.handle("agent-save-video", async (_event, defaultName, sourcePath) => {
  // Determine file extension from source path
  const ext = path.extname(sourcePath).slice(1) || "mp4";
  const { canceled, filePath } = await dialog.showSaveDialog({
    defaultPath: defaultName,
    filters: [{ name: "Video", extensions: [ext, "mp4", "webm", "mov"] }],
  });
  if (canceled || !filePath) return { success: false };

  try {
    fs.copyFileSync(sourcePath, filePath);
    return { success: true, path: filePath };
  } catch (e) {
    console.error("Failed to save video:", e);
    return { success: false, error: e.message };
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Polymarket API Proxy (bypasses CORS for renderer process)
// ─────────────────────────────────────────────────────────────────────────────
const POLYMARKET_ENDPOINTS = {
  markets: "https://gamma-api.polymarket.com/markets",
  holders: "https://data-api.polymarket.com/holders",
  events: "https://gamma-api.polymarket.com/events",
  prices: "https://clob.polymarket.com/prices",
  leaderboard: "https://data-api.polymarket.com/v1/leaderboard",
  positions: "https://data-api.polymarket.com/positions",
};

/**
 * Generic fetch proxy for external APIs
 * Routes requests through main process to bypass CORS restrictions
 */
ipcMain.handle("polymarket:fetch", async (_event, { endpoint, params }) => {
  try {
    // Build URL
    const baseUrl = POLYMARKET_ENDPOINTS[endpoint] || endpoint;
    const url = new URL(baseUrl);

    // Add query params
    if (params && typeof params === "object") {
      Object.entries(params).forEach(([key, val]) => {
        if (val !== undefined && val !== null) {
          url.searchParams.append(key, String(val));
        }
      });
    }

    console.log(`[Polymarket Proxy] Fetching: ${url.toString()}`);

    // Use native fetch (Node 18+) or net.fetch
    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": "BonzAI/1.0",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Polymarket Proxy] HTTP ${response.status}: ${errorText}`);
      return {
        success: false,
        error: `HTTP ${response.status}: ${response.statusText}`,
        status: response.status,
      };
    }

    const data = await response.json();
    return { success: true, data };
  } catch (error) {
    console.error(`[Polymarket Proxy] Error:`, error.message);
    return { success: false, error: error.message };
  }
});

/**
 * Batch fetch for efficiency (multiple requests in parallel)
 */
ipcMain.handle("polymarket:batch", async (_event, requests) => {
  if (!Array.isArray(requests)) {
    return [{ success: false, error: "requests must be an array" }];
  }

  const results = await Promise.all(
    requests.map(async ({ endpoint, params }) => {
      try {
        const baseUrl = POLYMARKET_ENDPOINTS[endpoint] || endpoint;
        const url = new URL(baseUrl);

        if (params && typeof params === "object") {
          Object.entries(params).forEach(([key, val]) => {
            if (val !== undefined && val !== null) {
              url.searchParams.append(key, String(val));
            }
          });
        }

        const response = await fetch(url.toString(), {
          method: "GET",
          headers: {
            Accept: "application/json",
            "User-Agent": "BonzAI/1.0",
          },
        });

        if (!response.ok) {
          return {
            success: false,
            error: `HTTP ${response.status}`,
            status: response.status,
          };
        }

        const data = await response.json();
        return { success: true, data };
      } catch (e) {
        return { success: false, error: e.message };
      }
    })
  );

  return results;
});

/**
 * Generic external API proxy for any URL
 * Use this for APIs not in the predefined endpoints
 */
ipcMain.handle("proxy:fetch", async (_event, { url, options = {} }) => {
  try {
    const response = await fetch(url, {
      method: options.method || "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": "BonzAI/1.0",
        ...(options.headers || {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    if (!response.ok) {
      return {
        success: false,
        error: `HTTP ${response.status}: ${response.statusText}`,
        status: response.status,
      };
    }

    const contentType = response.headers.get("content-type");
    let data;

    if (contentType && contentType.includes("application/json")) {
      data = await response.json();
    } else {
      data = await response.text();
    }

    return { success: true, data };
  } catch (error) {
    console.error(`[Proxy] Error fetching ${url}:`, error.message);
    return { success: false, error: error.message };
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Llama model wiring
// ─────────────────────────────────────────────────────────────────────────────
let modelContext = undefined;
let modelSession = undefined;

ipcMain.handle("model-check", checkModel);
ipcMain.handle("model-download", downloadModel);
ipcMain.handle("model-delete", deleteModel);
ipcMain.handle("model-load", loadModel);
ipcMain.handle("model-chat", chat);

// ─────────────────────────────────────────────────────────────────────────────
// Window creation
// ─────────────────────────────────────────────────────────────────────────────
const createWindow = async () => {
  // Get screen dimensions for full-size window
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  // Get app version for title
  const appVersion = app.getVersion();
  const appTitle = `BonzAI v${appVersion}`;

  mainWindow = new BrowserWindow({
    width,
    height,
    x: 0,
    y: 0,
    show: false, // Don't show until ready to prevent resize flicker
    title: appTitle,
    resizable: false, // Prevent corner drag resize
    maximizable: true, // Allow maximize button / double-click title bar
    minimizable: true, // Allow minimize to dock
    fullscreenable: true, // Allow green button fullscreen on macOS
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      devTools: !app.isPackaged, // Disable DevTools in production
    },
  });

  // Set title explicitly (in case HTML overrides it)
  mainWindow.setTitle(appTitle);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https:")) shell.openExternal(url);
    return { action: "deny" };
  });

  // Show window when ready (already at full size, no resize flicker)
  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  if (VITE_DEV_SERVER_URL) {
    await mainWindow.loadURL(VITE_DEV_SERVER_URL);
  } else {
    await mainWindow.loadFile(
      path.join(__dirname, "../renderer/main_window/index.html")
    );
  }

  return mainWindow;
};

// ─────────────────────────────────────────────────────────────────────────────
// App lifecycle
// ─────────────────────────────────────────────────────────────────────────────
app.on("ready", async () => {
  const flaskURL = `http://127.0.0.1:${PY_SERVER_PORT}`;
  startPythonSubprocess();

  // ─────────────────────────────────────────────────────────────────────────────
  // WalletConnect WebSocket Origin Fix for Production Electron
  // The WalletConnect relay server rejects connections with file:// or null origins
  // This intercepts WebSocket handshakes and sets a valid Origin header
  // IMPORTANT: https://bonzai.sh must be added as allowed origin in WalletConnect Cloud
  // ─────────────────────────────────────────────────────────────────────────────
  session.defaultSession.webRequest.onBeforeSendHeaders(
    {
      urls: [
        "wss://*.walletconnect.com/*",
        "wss://*.walletconnect.org/*",
        "wss://relay.walletconnect.com/*",
        "wss://relay.walletconnect.org/*",
        "https://*.walletconnect.com/*",
        "https://verify.walletconnect.com/*",
      ],
    },
    (details, callback) => {
      // Set Origin to a valid domain that's configured in WalletConnect Cloud
      details.requestHeaders["Origin"] = "https://bonzai.sh";
      callback({ requestHeaders: details.requestHeaders });
    }
  );

  try {
    await checkPythonServer(flaskURL);
    console.log("Python server is running!");
    await createWindow();
  } catch (error) {
    console.error("Failed to start Python server:", error);
    app.quit();
  }
});

ipcMain.handle("start-server", startPythonSubprocess);
ipcMain.handle("stop-server", killPythonSubprocess);
ipcMain.handle("restart-server", restartServerManually);
ipcMain.handle("system-information", systemInformation);

// Quit on all windows closed (non-mac)
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    killPythonSubprocess().then(() => app.quit());
  }
});

app.on("activate", () => {
  if (subpy == null) startPythonSubprocess();
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// ─────────────────────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────────────────────
function getLocalIP() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === "IPv4" && !net.internal) return net.address;
    }
  }
  return "127.0.0.1";
}

async function systemInformation() {
  const ram = await si.mem(); // bytes: { total, free, available, ... }
  const gfx = await si.graphics(); // includes controllers[].vram in MB
  const ip = getLocalIP();
  console.log(
    `Flask API should be accessible at: http://${ip}:${PY_SERVER_PORT}`
  );

  const controller = gfx.controllers?.[0];

  return {
    // existing
    ram: ram.total,
    ramAvailable: ram.available,
    gpu: controller?.model || "Unknown",
    vram: controller?.vram || 0,
    ip,
  };
}

// Ensure models dir exists on first run (now uses unified MODEL_DIR)
const modelDir = store.get("models");
if (!modelDir || !modelDir.includes("bonzai-models")) {
  // Migrate to new unified model directory
  store.set("models", MODEL_DIR);
}

// ─────────────────────────────────────────────────────────────────────────────
// Model management
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Normalize model filename to lowercase for .gguf and .safetensors files
 */
function normalizeModelFilename(filename) {
  if (!filename) return filename;
  const ext = path.extname(filename).toLowerCase();
  if (ext === ".gguf" || ext === ".safetensors") {
    return filename.toLowerCase();
  }
  return filename;
}

/**
 * Migrate existing model files to lowercase on startup
 * Only affects .gguf and .safetensors files in MODEL_DIR root
 */
function migrateModelFilesToLowercase() {
  try {
    const files = fs.readdirSync(MODEL_DIR);
    for (const file of files) {
      const ext = path.extname(file).toLowerCase();
      if (ext === ".gguf" || ext === ".safetensors") {
        const lowercaseFile = file.toLowerCase();
        if (file !== lowercaseFile) {
          const oldPath = path.join(MODEL_DIR, file);
          const newPath = path.join(MODEL_DIR, lowercaseFile);
          // Check if target already exists (avoid overwriting)
          if (!fs.existsSync(newPath)) {
            fs.renameSync(oldPath, newPath);
            console.log(`[Model Migration] Renamed: ${file} → ${lowercaseFile}`);
          } else {
            console.warn(`[Model Migration] Skipped ${file}: target ${lowercaseFile} already exists`);
          }
        }
      }
    }
  } catch (err) {
    console.error("[Model Migration] Error during migration:", err.message);
  }
}

// Run migration on startup
migrateModelFilesToLowercase();

async function downloadModel(_event, url, filename) {
  const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
  if (!win) {
    console.error("Download failed: No window available");
    return { error: "No window available for download" };
  }
  // Normalize filename to lowercase
  const normalizedFilename = normalizeModelFilename(filename);
  try {
    const dl = await download(win, url, {
      filename: normalizedFilename,
      directory: MODEL_DIR,
      showBadge: false,
      onProgress: (p) => {
        const pct = p.percent;
        win.setProgressBar(pct);
        win.webContents.send("download-progress", { filename: normalizedFilename, percent: pct });
      },
    });
    win.setProgressBar(-1);
    return { savedPath: dl.getSavePath() };
  } catch (error) {
    console.error("Download failed:", error);
    win?.setProgressBar(-1);
    return { error: error.message || "Download failed" };
  }
}

function deleteModel(_event, modelname) {
  // Normalize filename to lowercase
  const normalizedName = normalizeModelFilename(modelname);
  const modelPath = path.join(MODEL_DIR, normalizedName);
  try {
    unlink(modelPath, (err) => {
      if (err) throw err;
      console.log("Model deleted:", modelPath);
    });
    return true;
  } catch (e) {
    console.error("Delete failed:", e);
    return false;
  }
}

function computeMaxContextForModel(currentModel, sysInfo) {
  const params = currentModel.parameters || 0;

  const ramBytes = sysInfo.ramAvailable || sysInfo.ram || 0;
  const ramGB = ramBytes / 1024 ** 3;

  const vramMB = sysInfo.vram || 0;
  const vramGB = vramMB / 1024;

  const modelMaxCtx = currentModel.context || 4096;

  const isMac = process.platform === "darwin";
  const isUnified = isMac && vramMB === 0; // typical for Apple Silicon

  let memBudgetGB;

  if (isUnified) {
    // Apple unified memory: CPU+GPU share the same pool
    // Keep ~30% headroom for the OS, other apps, and fragmentation
    memBudgetGB = ramGB * 0.7;
  } else if (vramGB > 0) {
    // Discrete GPU case: KV cache + weights mostly limited by VRAM,
    // but we also need RAM for the app + overhead.
    // Be conservative and assume we can safely use ~80% of VRAM,
    // and at most what RAM allows.
    memBudgetGB = Math.min(ramGB * 0.8, vramGB * 0.8);
  } else {
    // Pure CPU, no GPU offload
    memBudgetGB = ramGB * 0.8;
  }

  let baseCtx;

  // Use memBudgetGB *and* params together
  if (params <= 4_000_000_000) {
    // 1–4B class
    if (memBudgetGB < 4) baseCtx = 4096;
    else if (memBudgetGB < 8) baseCtx = 8192;
    else if (memBudgetGB < 16) baseCtx = 16384;
    else baseCtx = 32768;
  } else if (params <= 8_000_000_000) {
    // 7–8B class (8B Q4 uses ~4-5GB, plenty of room for KV cache)
    if (memBudgetGB < 8) baseCtx = 4096;
    else if (memBudgetGB < 12) baseCtx = 8192;
    else if (memBudgetGB < 20) baseCtx = 16384;
    else baseCtx = 32768;
  } else if (params <= 20_000_000_000) {
    // 13–20B class (14B Q4 uses ~8-9GB, KV cache ~0.2GB per 1K ctx at fp16)
    if (memBudgetGB < 12) baseCtx = 2048;
    else if (memBudgetGB < 16) baseCtx = 4096;
    else if (memBudgetGB < 20) baseCtx = 8192;
    else if (memBudgetGB < 28) baseCtx = 16384;
    else baseCtx = 32768;
  } else {
    // 30B+ monsters (DeepSeek 32B, Qwen3 Coder 30B, etc.)
    // These need ~16-20GB for weights, so need more headroom
    if (memBudgetGB < 24) baseCtx = 2048;
    else if (memBudgetGB < 32) baseCtx = 4096;
    else if (memBudgetGB < 48) baseCtx = 8192;
    else if (memBudgetGB < 80) baseCtx = 16384;
    else baseCtx = 32768;
  }

  const chosen = Math.min(modelMaxCtx, baseCtx);

  console.log(
    `[CTX] RAM=${ramGB.toFixed(1)}GB, memBudget=${memBudgetGB.toFixed(
      1
    )}GB, VRAM=${vramGB.toFixed(1)}GB, params=${params}, baseCtx=${baseCtx}, modelMaxCtx=${modelMaxCtx}, chosen=${chosen}, unified=${isUnified}`
  );

  return chosen;
}

async function loadModel(_event, currentModel) {
  if (!llama) {
    throw new Error("LLM engine not initialized. Please restart the application.");
  }
  // Normalize filename to lowercase
  const normalizedFilename = normalizeModelFilename(currentModel.filename);
  const modelPath = path.join(MODEL_DIR, normalizedFilename);
  console.log("Model path:", modelPath);

  const model = await llama.loadModel({ modelPath });

  const sysInfo = await systemInformation();
  const desiredCtx = computeMaxContextForModel(currentModel, sysInfo);
  console.log("Model context:", desiredCtx);

  modelContext = await model.createContext({ contextSize: desiredCtx });
  modelSession = new LlamaChatSession({
    contextSequence: modelContext.getSequence(),
  });

  return true;
}

function checkModel(_event, modelname) {
  // Normalize filename to lowercase
  const normalizedName = normalizeModelFilename(modelname);
  const modelPath = path.join(MODEL_DIR, normalizedName);
  if (!fs.existsSync(modelPath)) {
    console.error("Model file not found:", modelPath);
    return false;
  }
  return true;
}

async function chat(_event, userMessage) {
  if (!modelSession) {
    throw new Error("Model not loaded");
  }
  const assistantMessage = await modelSession.prompt(userMessage);
  return assistantMessage;
}
