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
const llama = await getLlama();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let subpy = null;
const PY_SERVER_PORT = 65000;

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
// - packaged (mac onefile): resources/server/python-binary
// - packaged (linux/win onedir): resources/server/python-runtime/<platform>-<arch>/diffuser(.exe)
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

  let launch;
  try {
    launch = resolvePythonLaunch(PY_SERVER_PORT);
  } catch (e) {
    console.error(e.message);
    return;
  }

  console.log(
    `Starting diffuser [${launch.mode}] → ${launch.cmd} ${launch.args.join(" ")}`
  );

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
    subpy = null;
  });
  subpy.on("error", (err) => {
    console.error(`Failed to start Python subprocess: ${err}`);
  });
};

const killPythonSubprocess = () => {
  console.log("Killing diffuser...");
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

const checkPythonServer = async (url) => {
  const deadlineMs = Date.now() + 30000; // 30s
  while (Date.now() < deadlineMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
    } catch {}
    console.log("Waiting for Python server…");
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("Python server did not start within timeout.");
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
try {
  import.meta.resolve("electron-squirrel-startup/package.json");
  app.quit();
} catch {}

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
const createWindow = async (width, height) => {
  const mainWindow = new BrowserWindow({
    width,
    height,
    resizable: false,
    maximizable: false,
    minimizable: false,
    webPreferences: { preload: path.join(__dirname, "preload.js") },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https:")) shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.maximize();

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    await mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    await mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`)
    );
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// App lifecycle
// ─────────────────────────────────────────────────────────────────────────────
app.on("ready", async () => {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  const flaskURL = `http://127.0.0.1:${PY_SERVER_PORT}`;
  startPythonSubprocess();

  try {
    await checkPythonServer(flaskURL);
    console.log("Python server is running!");
    await createWindow(width, height);
  } catch (error) {
    console.error("Failed to start Python server:", error);
    app.quit();
  }
});

ipcMain.handle("start-server", startPythonSubprocess);
ipcMain.handle("stop-server", killPythonSubprocess);
ipcMain.handle("system-information", systemInformation);

// Quit on all windows closed (non-mac)
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    killPythonSubprocess().then(() => app.quit());
  }
});

app.on("activate", () => {
  if (subpy == null) startPythonSubprocess();
  if (BrowserWindow.getAllWindows().length === 0) createWindow(1280, 800);
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

// Ensure models dir exists on first run
const modelDir = store.get("models");
if (!modelDir) {
  const defaultModelDir = app.getPath("userData");
  fs.mkdirSync(defaultModelDir, { recursive: true });
  store.set("models", defaultModelDir);
}

// ─────────────────────────────────────────────────────────────────────────────
// Model management
// ─────────────────────────────────────────────────────────────────────────────
async function downloadModel(_event, url, filename) {
  const win = BrowserWindow.getFocusedWindow();
  try {
    const dl = await download(win, url, {
      filename,
      directory: path.join(app.getPath("userData"), "models"),
      showBadge: false,
      onProgress: (p) => {
        const pct = p.percent;
        win.setProgressBar(pct);
        win.webContents.send("download-progress", { filename, percent: pct });
      },
    });
    win.setProgressBar(-1);
    return { savedPath: dl.getSavePath() };
  } catch (error) {
    console.error("Download failed:", error);
    win?.setProgressBar(-1);
    return false;
  }
}

function deleteModel(_event, modelname) {
  const modelPath = path.join(app.getPath("userData"), "models", modelname);
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
    // 7–8B class
    if (memBudgetGB < 16) baseCtx = 4096;
    else if (memBudgetGB < 24) baseCtx = 8192;
    else if (memBudgetGB < 32) baseCtx = 16384;
    else baseCtx = 32768;
  } else if (params <= 20_000_000_000) {
    // 13–20B class
    if (memBudgetGB < 16) baseCtx = 2048;
    else if (memBudgetGB < 24) baseCtx = 4096;
    else if (memBudgetGB < 32) baseCtx = 8192;
    else baseCtx = 32768;
  } else {
    // 30B+ monsters (DeepSeek 32B, Qwen3 Coder 30B, etc.)
    if (memBudgetGB < 32) baseCtx = 4096;
    else if (memBudgetGB < 64) baseCtx = 8192;
    else if (memBudgetGB < 128) baseCtx = 16384;
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
  const modelPath = path.join(
    app.getPath("userData"),
    "models",
    currentModel.filename
  );
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
  const modelPath = path.join(app.getPath("userData"), "models", modelname);
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
