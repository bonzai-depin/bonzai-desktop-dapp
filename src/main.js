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
import { getLlama, LlamaChatSession, TemplateChatWrapper } from "node-llama-cpp";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { download } from "electron-dl";
import { unlink } from "node:fs";
import child_process from "child_process";
import http from "http";
import { pipeline } from "stream/promises";

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
// Can be overridden by user via settings
let MODEL_DIR = path.join(os.homedir(), "bonzai-models");
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

  setTimeout(async () => {
    console.log(`[Self-Healing] Attempting restart...`);
    startPythonSubprocess();
    // Wait for server to be ready and send "ready" notification
    try {
      await checkPythonServer(`http://127.0.0.1:${PY_SERVER_PORT}`);
      console.log(`[Self-Healing] Server recovered successfully`);
    } catch (e) {
      console.error(`[Self-Healing] Server failed to recover: ${e.message}`);
      // The crash handler will be triggered again if the process exits
    }
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
      // Get PIDs first, then kill if any exist
      const result = child_process.execSync(`lsof -ti:${port} 2>/dev/null || true`, {
        encoding: "utf8",
      });
      const pids = result.trim().split("\n").filter(Boolean);
      if (pids.length > 0) {
        console.log(`[killPort] Found ${pids.length} process(es) on port ${port}: ${pids.join(", ")}`);
        for (const pid of pids) {
          try {
            process.kill(parseInt(pid, 10), "SIGKILL");
            console.log(`[killPort] Killed PID ${pid}`);
          } catch (e) {
            console.warn(`[killPort] Failed to kill PID ${pid}: ${e.message}`);
          }
        }
        // Wait briefly for port to be freed
        child_process.execSync("sleep 0.5");
      } else {
        console.log(`[killPort] No process found on port ${port}`);
      }
    }
  } catch (e) {
    console.warn(`[killPort] Error: ${e.message}`);
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
  console.log(`[Spawn] cwd: ${launch.cwd}`);
  console.log(`[Spawn] Binary exists: ${fs.existsSync(launch.cmd)}`);
  if (app.isPackaged) {
    console.log("[Production] PyInstaller binary may take 1-3 minutes to start on first launch...");
  }
  notifyServerStatus("starting", { message: "Starting server..." });

  // Ensure proper environment for PyInstaller binaries
  // PyInstaller onefile mode extracts to TMPDIR - ensure it's writable
  const homeDir = process.env.HOME || os.homedir();
  const tmpDir = process.env.TMPDIR || path.join(homeDir, ".bonzai-tmp");

  // Create temp directory if it doesn't exist
  if (!fs.existsSync(tmpDir)) {
    try {
      fs.mkdirSync(tmpDir, { recursive: true });
    } catch (e) {
      console.warn(`[Spawn] Could not create temp dir: ${e.message}`);
    }
  }

  const env = {
    ...process.env,
    PYTHONUNBUFFERED: "1",
    PYTHONDONTWRITEBYTECODE: "1",
    // Ensure HOME is set (required for some libraries)
    HOME: homeDir,
    // Ensure TMPDIR is set (PyInstaller extracts here)
    TMPDIR: tmpDir,
    // Add the binary's directory to PATH (helps find co-located libs)
    PATH: `${launch.cwd}:${process.env.PATH || ""}`,
    // Ensure shell is available
    SHELL: process.env.SHELL || "/bin/bash",
    // Locale settings (prevents some encoding issues)
    LANG: process.env.LANG || "en_US.UTF-8",
    LC_ALL: process.env.LC_ALL || "en_US.UTF-8",
    // Pass model directory to Flask server
    BONZAI_MODEL_DIR: MODEL_DIR,
  };

  // Log detailed spawn info
  console.log(`[Spawn] Command: ${launch.cmd}`);
  console.log(`[Spawn] Args: ${JSON.stringify(launch.args)}`);
  console.log(`[Spawn] CWD: ${launch.cwd}`);
  console.log(`[Spawn] TMPDIR: ${tmpDir}`);
  console.log(`[Spawn] Binary exists: ${fs.existsSync(launch.cmd)}`);

  // Check if binary is executable
  try {
    fs.accessSync(launch.cmd, fs.constants.X_OK);
    console.log(`[Spawn] Binary is executable: true`);
  } catch {
    console.warn(`[Spawn] Binary is executable: false - attempting chmod`);
    try {
      fs.chmodSync(launch.cmd, 0o755);
      console.log(`[Spawn] chmod applied successfully`);
    } catch (e) {
      console.error(`[Spawn] chmod failed: ${e.message}`);
    }
  }

  subpy = child_process.spawn(launch.cmd, launch.args, {
    cwd: launch.cwd,
    env,
    stdio: ["pipe", "pipe", "pipe"],
    shell: false,
    detached: false,
  });

  // Close stdin immediately - server doesn't need input
  if (subpy.stdin) {
    subpy.stdin.end();
  }

  console.log(`[Spawn] Process started with PID: ${subpy.pid}`);

  // Monitor for silent hang - if no output after 30s, something is wrong
  let outputReceived = false;
  const hangTimeout = setTimeout(() => {
    if (!outputReceived && subpy && subpy.pid) {
      console.error(`[Spawn] WARNING: No output received after 30 seconds - binary may be hanging`);
      console.error(`[Spawn] Check if ${launch.cmd} runs correctly when executed manually`);
      console.error(`[Spawn] Try running: ${launch.cmd} ${launch.args.join(" ")}`);
    }
  }, 30000);

  // Check if spawn failed immediately
  if (!subpy.pid) {
    console.error("[Spawn] ERROR: Process failed to start - no PID assigned");
    notifyServerStatus("error", { message: "Failed to start server process" });
    return;
  }

  // Track if we've seen any output from the server
  let hasReceivedOutput = false;

  // Forward server logs to renderer console
  const forwardLog = (data, type = "log") => {
    const text = data.toString().trim();
    if (!text) return;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("server-log", { type, text });
    }
  };

  // Mark output as received and clear hang timeout
  const markOutputReceived = () => {
    if (!hasReceivedOutput) {
      hasReceivedOutput = true;
      outputReceived = true; // Clear the hang warning
      clearTimeout(hangTimeout);
      console.log("[Server] First output received - server process is alive");
    }
  };

  subpy.stdout.on("data", (d) => {
    markOutputReceived();
    process.stdout.write(`[Server] ${d}`);
    forwardLog(d, "log");
  });

  subpy.stderr.on("data", (d) => {
    markOutputReceived();
    process.stderr.write(`[Server] ${d}`);
    forwardLog(d, "error");
  });

  subpy.on("close", (code) => {
    clearTimeout(hangTimeout); // Clear hang detection
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
  // Production builds with PyInstaller need longer startup time
  // (extracting bundled libraries, loading ML models, etc.)
  const timeoutMs = app.isPackaged ? 180000 : 30000; // 3 min for prod, 30s for dev
  const startTime = Date.now();
  const deadlineMs = startTime + timeoutMs;
  let lastLogTime = 0;

  while (Date.now() < deadlineMs) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`Python server ready after ${elapsedSec}s`);
        // Server is ready - reset restart counter (stability achieved)
        serverRestartCount = 0;
        restartBackoffMs = 2000;
        notifyServerStatus("ready", { message: "Server is ready." });
        return true;
      }
    } catch {}

    const elapsed = Date.now() - startTime;
    const elapsedSec = Math.floor(elapsed / 1000);

    // Log progress every 5 seconds
    if (!silent && elapsed - lastLogTime >= 5000) {
      const remaining = Math.ceil((deadlineMs - Date.now()) / 1000);
      console.log(`Waiting for Python server… (${elapsedSec}s elapsed, ${remaining}s remaining)`);
      notifyServerStatus("starting", {
        message: `Starting server... (${elapsedSec}s)`,
        elapsed: elapsedSec,
      });
      lastLogTime = elapsed;
    }

    await new Promise((r) => setTimeout(r, 1000));
  }

  const totalWait = Math.floor((Date.now() - startTime) / 1000);
  throw new Error(`The server did not start within ${totalWait}s.`);
};

// Manual restart handler (can be called from renderer when max restarts exceeded)
const restartServerManually = async () => {
  console.log("[Manual Restart] User requested server restart");
  serverRestartCount = 0; // Reset counter for manual restart
  restartBackoffMs = 2000;
  isIntentionalShutdown = true; // Prevent auto-restart from killing
  await killPythonSubprocess();
  // Wait for port to be fully released before starting new process
  await new Promise((r) => setTimeout(r, 1000));
  startPythonSubprocess();
  // Only clear intentional flag after the new process has started
  isIntentionalShutdown = false;
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

// ─────────────────────────────────────────────────────────────────────────────
// Model directory management
// ─────────────────────────────────────────────────────────────────────────────
ipcMain.handle("get-model-dir", () => MODEL_DIR);

// Helper: calculate directory size recursively
async function calculateDirSize(dirPath) {
  let total = 0;
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      total += await calculateDirSize(fullPath);
    } else if (entry.isFile()) {
      total += fs.statSync(fullPath).size;
    }
  }
  return total;
}

// Helper: collect all files recursively with relative paths
function collectFiles(dirPath, basePath = dirPath) {
  const results = [];
  if (!fs.existsSync(dirPath)) return results;
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectFiles(fullPath, basePath));
    } else if (entry.isFile()) {
      results.push({
        absolutePath: fullPath,
        relativePath: path.relative(basePath, fullPath),
        size: fs.statSync(fullPath).size,
      });
    }
  }
  return results;
}

// Helper: copy directory with stream-based progress
async function copyDirWithProgress(srcDir, destDir, totalSize, progressFn) {
  const files = collectFiles(srcDir);
  let copiedBytes = 0;

  for (const file of files) {
    const destPath = path.join(destDir, file.relativePath);
    const destDirPath = path.dirname(destPath);
    fs.mkdirSync(destDirPath, { recursive: true });

    // Skip files that already exist at dest with matching size (idempotent)
    if (fs.existsSync(destPath)) {
      const destStat = fs.statSync(destPath);
      if (destStat.size === file.size) {
        copiedBytes += file.size;
        progressFn(copiedBytes, totalSize, file.relativePath);
        continue;
      }
    }

    // Stream-based copy with progress
    await new Promise((resolve, reject) => {
      const readStream = fs.createReadStream(file.absolutePath);
      const writeStream = fs.createWriteStream(destPath);

      readStream.on("data", (chunk) => {
        copiedBytes += chunk.length;
        progressFn(copiedBytes, totalSize, file.relativePath);
      });

      writeStream.on("finish", resolve);
      writeStream.on("error", reject);
      readStream.on("error", reject);
      readStream.pipe(writeStream);
    });
  }
}

// Send migration progress to all renderer windows
const notifyMigrationProgress = (data) => {
  const windows = BrowserWindow.getAllWindows();
  windows.forEach((win) => {
    if (!win.isDestroyed()) {
      win.webContents.send("migration-progress", data);
    }
  });
};

ipcMain.handle("select-model-dir", async () => {
  const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    title: "Select Model Directory",
    defaultPath: MODEL_DIR,
    properties: ["openDirectory", "createDirectory"],
  });
  if (canceled || !filePaths.length) return null;

  const newDir = filePaths[0];
  const oldDir = MODEL_DIR;

  // Skip migration if same directory
  if (path.resolve(oldDir) === path.resolve(newDir)) {
    return newDir;
  }

  fs.mkdirSync(newDir, { recursive: true });

  // Migrate files from old to new directory
  try {
    notifyMigrationProgress({ phase: "scanning", pct: 0, detail: "Scanning files..." });

    const totalSize = await calculateDirSize(oldDir);
    if (totalSize === 0) {
      notifyMigrationProgress({ phase: "complete", pct: 100, detail: "No files to migrate." });
    } else {
      const totalMB = (totalSize / 1024 / 1024).toFixed(1);
      notifyMigrationProgress({ phase: "copying", pct: 1, detail: `Copying ${totalMB} MB...` });

      await copyDirWithProgress(oldDir, newDir, totalSize, (copiedBytes, total, currentFile) => {
        // Copying phase: 0-90%
        const pct = Math.min(90, Math.round((copiedBytes / total) * 90));
        const copiedMB = (copiedBytes / 1024 / 1024).toFixed(1);
        notifyMigrationProgress({
          phase: "copying",
          pct,
          detail: `${copiedMB} / ${totalMB} MB — ${currentFile}`,
        });
      });

      notifyMigrationProgress({ phase: "verifying", pct: 95, detail: "Verifying..." });
    }

    // Update inference history paths to point to new location
    notifyMigrationProgress({ phase: "updating", pct: 96, detail: "Updating history paths..." });

    const historyKeys = ["audioInferences", "imageInferences", "videoInferences", "objectInferences"];
    const oldDirNormalized = path.resolve(oldDir);
    const newDirNormalized = path.resolve(newDir);

    for (const key of historyKeys) {
      try {
        const history = store.get(key, []);
        if (Array.isArray(history) && history.length > 0) {
          let updated = false;
          const updatedHistory = history.map((inference) => {
            // Deep clone to avoid mutation
            const item = JSON.parse(JSON.stringify(inference));

            // Update paths in answer.data
            if (item?.answer?.data) {
              const data = item.answer.data;
              const pathFields = ["audio_path", "video_path", "image_path", "path", "output_path", "object_path"];

              for (const field of pathFields) {
                if (data[field] && typeof data[field] === "string" && data[field].startsWith(oldDirNormalized)) {
                  data[field] = data[field].replace(oldDirNormalized, newDirNormalized);
                  updated = true;
                }
              }
            }

            return item;
          });

          if (updated) {
            store.set(key, updatedHistory);
            console.log(`[Model Dir] Updated paths in ${key}`);
          }
        }
      } catch (e) {
        console.warn(`[Model Dir] Failed to update ${key}:`, e.message);
      }
    }
  } catch (e) {
    console.error("[Model Dir] Migration failed:", e);
    notifyMigrationProgress({ phase: "error", pct: 0, detail: e.message });
    return { error: `Migration failed: ${e.message}` };
  }

  // Update MODEL_DIR and restart server
  MODEL_DIR = newDir;
  store.set("models", newDir);

  notifyMigrationProgress({ phase: "restarting", pct: 98, detail: "Restarting server..." });

  try {
    await restartServerManually();
  } catch (e) {
    console.warn("[Model Dir] Server restart after dir change failed:", e.message);
  }

  notifyMigrationProgress({ phase: "complete", pct: 100, detail: "Migration complete." });

  return newDir;
});

// Fix history paths - useful for users who already migrated without path updates
ipcMain.handle("fix-history-paths", (_event, oldDir, newDir) => {
  if (!oldDir || !newDir) {
    return { error: "Both oldDir and newDir are required" };
  }

  const historyKeys = ["audioInferences", "imageInferences", "videoInferences", "objectInferences"];
  const oldDirNormalized = path.resolve(oldDir);
  const newDirNormalized = path.resolve(newDir);
  let totalUpdated = 0;

  for (const key of historyKeys) {
    try {
      const history = store.get(key, []);
      if (Array.isArray(history) && history.length > 0) {
        let updated = false;
        const updatedHistory = history.map((inference) => {
          const item = JSON.parse(JSON.stringify(inference));

          if (item?.answer?.data) {
            const data = item.answer.data;
            const pathFields = ["audio_path", "video_path", "image_path", "path", "output_path", "object_path"];

            for (const field of pathFields) {
              if (data[field] && typeof data[field] === "string" && data[field].startsWith(oldDirNormalized)) {
                data[field] = data[field].replace(oldDirNormalized, newDirNormalized);
                updated = true;
                totalUpdated++;
              }
            }
          }

          return item;
        });

        if (updated) {
          store.set(key, updatedHistory);
          console.log(`[Fix Paths] Updated paths in ${key}`);
        }
      }
    } catch (e) {
      console.warn(`[Fix Paths] Failed to update ${key}:`, e.message);
    }
  }

  return { success: true, updatedPaths: totalUpdated };
});

// File existence check for media validation
ipcMain.handle("file-exists", (_event, filePath) => {
  try {
    return fs.existsSync(filePath);
  } catch {
    return false;
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// OpenClaw Integration Config
// ─────────────────────────────────────────────────────────────────────────────
const OPENCLAW_MODELS_PATH = path.join(os.homedir(), ".openclaw", "agents", "main", "agent", "models.json");
const OPENCLAW_CONFIG_PATH = path.join(os.homedir(), ".openclaw", "openclaw.json");

ipcMain.handle("openclaw-get-enabled", async () => {
  try {
    if (fs.existsSync(OPENCLAW_CONFIG_PATH)) {
      const content = fs.readFileSync(OPENCLAW_CONFIG_PATH, "utf8");
      const config = JSON.parse(content);
      // Check if bonzai provider exists
      return !!config.models?.providers?.bonzai;
    }
    return false;
  } catch {
    return false;
  }
});

ipcMain.handle("openclaw-set-enabled", async (_event, enabled) => {
  try {
    // 1. Update models.json with provider definition (where OpenClaw reads providers)
    const modelsDir = path.dirname(OPENCLAW_MODELS_PATH);
    if (!fs.existsSync(modelsDir)) {
      fs.mkdirSync(modelsDir, { recursive: true });
    }

    let modelsConfig = { providers: {} };
    if (fs.existsSync(OPENCLAW_MODELS_PATH)) {
      try {
        const content = fs.readFileSync(OPENCLAW_MODELS_PATH, "utf8");
        modelsConfig = JSON.parse(content);
        if (!modelsConfig.providers) modelsConfig.providers = {};
      } catch {
        modelsConfig = { providers: {} };
      }
    }

    if (enabled) {
      // Add bonzai provider with full model configuration
      modelsConfig.providers.bonzai = {
        baseUrl: `http://127.0.0.1:${OPENCLAW_API_PORT}/v1`,
        apiKey: "bonzai-local",
        api: "openai-completions",
        models: [
          {
            id: "bonzai-sovereign",
            name: "Decentralized AI by BonzAI",
            reasoning: false,
            input: ["text"],
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
            contextWindow: 32768,
            maxTokens: 4096
          }
        ]
      };
    } else {
      delete modelsConfig.providers.bonzai;
    }
    fs.writeFileSync(OPENCLAW_MODELS_PATH, JSON.stringify(modelsConfig, null, 2));

    // 2. Update openclaw.json with default model setting
    let mainConfig = {};
    if (fs.existsSync(OPENCLAW_CONFIG_PATH)) {
      try {
        const content = fs.readFileSync(OPENCLAW_CONFIG_PATH, "utf8");
        mainConfig = JSON.parse(content);
      } catch {
        mainConfig = {};
      }
    }

    if (enabled) {
      // Ensure nested structures exist
      if (!mainConfig.agents) mainConfig.agents = {};
      if (!mainConfig.agents.defaults) mainConfig.agents.defaults = {};
      if (!mainConfig.agents.defaults.model) mainConfig.agents.defaults.model = {};

      // Set BonzAI as primary model with Claude as fallback
      mainConfig.agents.defaults.model.primary = "bonzai/bonzai-sovereign";
      mainConfig.agents.defaults.model.fallbacks = ["anthropic/claude-sonnet-4-5"];
    } else {
      // Restore default to Claude if bonzai was primary
      if (mainConfig.agents?.defaults?.model?.primary === "bonzai/bonzai-sovereign") {
        mainConfig.agents.defaults.model.primary = "anthropic/claude-sonnet-4-5";
        delete mainConfig.agents.defaults.model.fallbacks;
      }
    }
    fs.writeFileSync(OPENCLAW_CONFIG_PATH, JSON.stringify(mainConfig, null, 2));

    console.log(`[OpenClaw] Integration ${enabled ? "enabled" : "disabled"}`);
    return { success: true };
  } catch (error) {
    console.error("[OpenClaw] Failed to update config:", error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle("openclaw-is-installed", async () => {
  // Check if OpenClaw is installed by looking for the config directory
  const openclawDir = path.join(os.homedir(), ".openclaw");
  return fs.existsSync(openclawDir);
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
let loadedModel = undefined; // The actual llama model object (holds GPU memory)
let currentLoadedModel = null; // Track currently loaded model for multimodal support

// DEPRECATED: MiniCPM-V vision model is now handled server-side via diffuser.py
// These constants are kept for backwards compatibility only
const MINICPM_V_MODEL = {
  filename: "minicpm-v-4_5-q4_k_m.gguf",
  mmproj: "mmproj-model-f16.gguf",
};

ipcMain.handle("model-check", checkModel);
ipcMain.handle("model-download", downloadModel);
ipcMain.handle("model-delete", deleteModel);
ipcMain.handle("model-load", loadModel);
ipcMain.handle("model-unload", unloadModel);
ipcMain.handle("model-chat", chat);
ipcMain.handle("model-chat-vision", chatWithVision);
ipcMain.handle("model-check-mmproj", checkMmproj);
ipcMain.handle("model-download-mmproj", downloadMmproj);

// ─────────────────────────────────────────────────────────────────────────────
// Window creation
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Wait for Vite dev server to be ready (with retry/backoff)
 */
async function waitForViteServer(url, maxRetries = 30, initialDelayMs = 200) {
  let delay = initialDelayMs;
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(url, { method: "HEAD" });
      if (response.ok) {
        console.log(`[Vite] Server ready after ${i + 1} attempts`);
        return true;
      }
    } catch {
      // Server not ready yet
    }
    console.log(`[Vite] Waiting for dev server... (attempt ${i + 1}/${maxRetries})`);
    await new Promise((r) => setTimeout(r, delay));
    delay = Math.min(delay * 1.5, 2000); // Exponential backoff, max 2s
  }
  throw new Error(`Vite dev server at ${url} did not become ready`);
}

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

  // Clear reference when window is closed (important for macOS dock click handling)
  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  if (VITE_DEV_SERVER_URL) {
    // Wait for Vite dev server to be ready before loading
    await waitForViteServer(VITE_DEV_SERVER_URL);
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

  // Create window immediately to prevent crash when clicking dock icon
  // The Vue app will show loading state while server starts
  await createWindow();

  // Start Python server in background (Vue app handles loading UI)
  startPythonSubprocess();

  try {
    await checkPythonServer(flaskURL);
    console.log("Python server is running!");
  } catch (error) {
    console.error("Failed to start Python server:", error);
    // Don't quit - notify user and allow retry
    notifyServerStatus("error", {
      message: `Server failed to start: ${error.message}`,
      canRetry: true,
    });
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
  // Show existing window or create new one if none exists
  // Check both that mainWindow exists AND is not destroyed (belt and suspenders)
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
  } else if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
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

// Restore user's model directory from store, or use default
const storedModelDir = store.get("models");
if (storedModelDir && fs.existsSync(storedModelDir)) {
  MODEL_DIR = storedModelDir;
} else {
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
 * Parse multi-part GGUF filename pattern
 * Returns { isMultiPart, baseName, partNum, totalParts } or null
 * Pattern: model-name-00001-of-00003.gguf
 */
function parseMultiPartGGUF(filename) {
  const match = filename.match(/^(.+)-(\d{5})-of-(\d{5})\.gguf$/i);
  if (!match) return null;
  return {
    isMultiPart: true,
    baseName: match[1],
    partNum: parseInt(match[2], 10),
    totalParts: parseInt(match[3], 10),
  };
}

/**
 * Generate all part filenames for a multi-part GGUF
 */
function generateMultiPartFilenames(baseName, totalParts) {
  const parts = [];
  for (let i = 1; i <= totalParts; i++) {
    const partStr = String(i).padStart(5, "0");
    const totalStr = String(totalParts).padStart(5, "0");
    parts.push(`${baseName}-${partStr}-of-${totalStr}.gguf`);
  }
  return parts;
}

/**
 * Generate URL for a specific part given the base URL pattern
 */
function generatePartUrl(baseUrl, partNum, totalParts) {
  // Replace the part number in the URL
  // Pattern: .../model-00001-of-00003.gguf -> .../model-00002-of-00003.gguf
  const partStr = String(partNum).padStart(5, "0");
  return baseUrl.replace(/-\d{5}-of-\d{5}\.gguf/i, `-${partStr}-of-${String(totalParts).padStart(5, "0")}.gguf`);
}

// Track active LLM downloads for UI resume
const activeDownloads = new Map(); // filename -> { url, percent, status }

function getActiveDownloads() {
  return Array.from(activeDownloads.entries()).map(([filename, data]) => ({
    filename,
    ...data,
  }));
}

ipcMain.handle("get-active-downloads", () => getActiveDownloads());

async function downloadModel(_event, url, filename) {
  const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
  if (!win) {
    console.error("Download failed: No window available");
    return { error: "No window available for download" };
  }

  // Check if this is a multi-part GGUF download
  const multiPart = parseMultiPartGGUF(filename);
  if (multiPart && multiPart.totalParts > 1) {
    return downloadMultiPartModel(win, url, filename, multiPart);
  }

  // Single file download
  const normalizedFilename = normalizeModelFilename(filename);

  // Track active download
  activeDownloads.set(normalizedFilename, { url, percent: 0, status: "downloading" });

  try {
    const dl = await download(win, url, {
      filename: normalizedFilename,
      directory: MODEL_DIR,
      showBadge: false,
      onProgress: (p) => {
        const pct = p.percent;
        win.setProgressBar(pct);
        win.webContents.send("download-progress", { filename: normalizedFilename, percent: pct });
        // Update tracking
        activeDownloads.set(normalizedFilename, { url, percent: pct, status: "downloading" });
      },
    });
    win.setProgressBar(-1);
    // Remove from tracking on completion
    activeDownloads.delete(normalizedFilename);
    return { savedPath: dl.getSavePath() };
  } catch (error) {
    console.error("Download failed:", error);
    win?.setProgressBar(-1);
    // Remove from tracking on failure
    activeDownloads.delete(normalizedFilename);
    return { error: error.message || "Download failed" };
  }
}

/**
 * Merge multi-part GGUF files into a single file using stream-based concatenation
 * @param {string[]} partPaths - Array of paths to part files in order
 * @param {string} outputPath - Path for the merged output file
 * @param {Function} onProgress - Progress callback (0-1)
 */
async function mergeGGUFParts(partPaths, outputPath, onProgress) {
  // Calculate total size for progress
  let totalSize = 0;
  for (const partPath of partPaths) {
    totalSize += fs.statSync(partPath).size;
  }

  let bytesWritten = 0;
  const outputStream = fs.createWriteStream(outputPath);

  console.log(`[GGUF Merge] Merging ${partPaths.length} parts (${(totalSize / 1024 / 1024 / 1024).toFixed(2)} GB) -> ${path.basename(outputPath)}`);

  for (let i = 0; i < partPaths.length; i++) {
    const partPath = partPaths[i];
    const partSize = fs.statSync(partPath).size;

    console.log(`[GGUF Merge] Processing part ${i + 1}/${partPaths.length}: ${path.basename(partPath)}`);

    await new Promise((resolve, reject) => {
      const readStream = fs.createReadStream(partPath);

      readStream.on("data", (chunk) => {
        bytesWritten += chunk.length;
        if (onProgress) {
          onProgress(bytesWritten / totalSize);
        }
      });

      readStream.on("end", resolve);
      readStream.on("error", reject);

      readStream.pipe(outputStream, { end: false });
    });
  }

  outputStream.end();

  // Wait for output stream to finish
  await new Promise((resolve, reject) => {
    outputStream.on("finish", resolve);
    outputStream.on("error", reject);
  });

  console.log(`[GGUF Merge] Merge complete: ${path.basename(outputPath)}`);
  return outputPath;
}

/**
 * Download multi-part GGUF model files and merge into single file
 */
async function downloadMultiPartModel(win, baseUrl, filename, multiPart) {
  const { baseName, totalParts } = multiPart;
  const partFilenames = generateMultiPartFilenames(baseName, totalParts);
  const downloadedPaths = [];

  // Final merged filename (without part numbers)
  const mergedFilename = normalizeModelFilename(`${baseName}.gguf`);
  const mergedPath = path.join(MODEL_DIR, mergedFilename);

  // Check if already merged
  if (fs.existsSync(mergedPath)) {
    console.log(`[Multi-Part Download] Merged file already exists: ${mergedFilename}`);
    return { savedPath: mergedPath, isMultiPart: true, merged: true };
  }

  console.log(`[Multi-Part Download] Starting download of ${totalParts} parts for ${baseName}`);

  try {
    // Phase 1: Download all parts (80% of progress)
    for (let i = 0; i < totalParts; i++) {
      const partNum = i + 1;
      const partFilename = normalizeModelFilename(partFilenames[i]);
      const partUrl = generatePartUrl(baseUrl, partNum, totalParts);
      const partPath = path.join(MODEL_DIR, partFilename);

      // Skip if part already exists
      if (fs.existsSync(partPath)) {
        console.log(`[Multi-Part Download] Part ${partNum}/${totalParts} already exists, skipping`);
        downloadedPaths.push(partPath);
        win.webContents.send("download-progress", {
          filename: mergedFilename,
          percent: (partNum / totalParts) * 0.8,
          part: partNum,
          totalParts,
          phase: "downloading",
          status: "skipped",
        });
        continue;
      }

      console.log(`[Multi-Part Download] Downloading part ${partNum}/${totalParts}: ${partFilename}`);

      const dl = await download(win, partUrl, {
        filename: partFilename,
        directory: MODEL_DIR,
        showBadge: false,
        onProgress: (p) => {
          // Download phase is 0-80% of total progress
          const overallPct = ((i + p.percent) / totalParts) * 0.8;
          win.setProgressBar(overallPct);
          win.webContents.send("download-progress", {
            filename: mergedFilename,
            percent: overallPct,
            part: partNum,
            totalParts,
            partPercent: p.percent,
            phase: "downloading",
          });
        },
      });

      downloadedPaths.push(dl.getSavePath());
      console.log(`[Multi-Part Download] Completed part ${partNum}/${totalParts}`);
    }

    // Phase 2: Merge parts (80-100% of progress)
    console.log(`[Multi-Part Download] All parts downloaded, starting merge...`);
    win.webContents.send("download-progress", {
      filename: mergedFilename,
      percent: 0.8,
      phase: "merging",
      status: "starting",
    });

    await mergeGGUFParts(downloadedPaths, mergedPath, (mergePct) => {
      // Merge phase is 80-100% of total progress
      const overallPct = 0.8 + mergePct * 0.2;
      win.setProgressBar(overallPct);
      win.webContents.send("download-progress", {
        filename: mergedFilename,
        percent: overallPct,
        phase: "merging",
        mergePercent: mergePct,
      });
    });

    // Phase 3: Clean up part files
    console.log(`[Multi-Part Download] Cleaning up ${totalParts} part files...`);
    for (const partPath of downloadedPaths) {
      try {
        fs.unlinkSync(partPath);
        console.log(`[Multi-Part Download] Deleted part: ${path.basename(partPath)}`);
      } catch (e) {
        console.warn(`[Multi-Part Download] Failed to delete part: ${partPath}`, e.message);
      }
    }

    win.setProgressBar(-1);
    console.log(`[Multi-Part Download] Complete: ${mergedFilename}`);

    return {
      savedPath: mergedPath,
      isMultiPart: true,
      merged: true,
      totalParts,
    };
  } catch (error) {
    console.error("[Multi-Part Download] Failed:", error);
    win?.setProgressBar(-1);
    return { error: error.message || "Multi-part download failed" };
  }
}

function deleteModel(_event, modelname) {
  // Normalize filename to lowercase
  const normalizedName = normalizeModelFilename(modelname);

  // Check if this is a multi-part GGUF reference
  const multiPart = parseMultiPartGGUF(normalizedName);
  if (multiPart && multiPart.totalParts > 1) {
    // For multi-part models, delete the merged file
    const mergedFilename = normalizeModelFilename(`${multiPart.baseName}.gguf`);
    const mergedPath = path.join(MODEL_DIR, mergedFilename);

    // Also delete any remaining part files (in case merge was interrupted)
    const partFilenames = generateMultiPartFilenames(multiPart.baseName, multiPart.totalParts);
    for (const partFile of partFilenames) {
      const partPath = path.join(MODEL_DIR, normalizeModelFilename(partFile));
      try {
        if (fs.existsSync(partPath)) {
          fs.unlinkSync(partPath);
          console.log("Model part deleted:", partPath);
        }
      } catch (e) {
        console.warn("Delete part failed:", partPath, e.message);
      }
    }

    // Delete the merged file
    if (fs.existsSync(mergedPath)) {
      try {
        fs.unlinkSync(mergedPath);
        console.log("Merged model deleted:", mergedPath);
        return true;
      } catch (e) {
        console.error("Delete merged file failed:", e);
        return false;
      }
    }
    return true;
  }

  // Single file delete
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
  // For MoE models, use activeParameters for context sizing since that's
  // what matters for compute/memory. Fall back to total parameters.
  const isMoE = currentModel.isMoE || currentModel.activeParameters;
  const params = currentModel.activeParameters || currentModel.parameters || 0;
  const totalParams = currentModel.parameters || 0;

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
  // For MoE models, params = activeParameters (e.g., 3.6B for GLM-4.7-Flash)
  if (params <= 4_000_000_000) {
    // 1–4B class (or MoE with <=4B active params)
    if (memBudgetGB < 4) baseCtx = 4096;
    else if (memBudgetGB < 8) baseCtx = 8192;
    else if (memBudgetGB < 16) baseCtx = 16384;
    else if (memBudgetGB < 24) baseCtx = 65536;
    else baseCtx = 131072;
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
    `[CTX] RAM=${ramGB.toFixed(1)}GB, memBudget=${memBudgetGB.toFixed(1)}GB, VRAM=${vramGB.toFixed(1)}GB, ` +
    `params=${params}${isMoE ? ` (MoE, total=${totalParams})` : ""}, baseCtx=${baseCtx}, modelMaxCtx=${modelMaxCtx}, chosen=${chosen}, unified=${isUnified}`
  );

  return chosen;
}

async function loadModel(_event, currentModel) {
  if (!llama) {
    throw new Error("LLM engine not initialized. Please restart the application.");
  }

  // Cleanup any existing model before loading a new one
  // This is critical to free GPU memory, especially for large models like GLM
  if (loadedModel || modelContext || modelSession) {
    console.log("[LLM] Cleaning up existing model before loading new one...");
    await unloadModel();
  }

  // Normalize filename to lowercase
  const normalizedFilename = normalizeModelFilename(currentModel.filename);

  // Check if this is a multi-part GGUF - use merged filename
  let modelPath;
  const multiPart = parseMultiPartGGUF(normalizedFilename);
  if (multiPart && multiPart.totalParts > 1) {
    const mergedFilename = normalizeModelFilename(`${multiPart.baseName}.gguf`);
    modelPath = path.join(MODEL_DIR, mergedFilename);
    console.log("Multi-part model, using merged file:", modelPath);
  } else {
    modelPath = path.join(MODEL_DIR, normalizedFilename);
    console.log("Model path:", modelPath);
  }

  // Check if this is a multimodal model (has mmproj)
  const isMultimodal = currentModel.isMultimodal || currentModel.mmproj;
  let mmprojPath = null;

  if (isMultimodal && currentModel.mmproj) {
    const normalizedMmproj = normalizeModelFilename(currentModel.mmproj);
    mmprojPath = path.join(MODEL_DIR, normalizedMmproj);
    if (!fs.existsSync(mmprojPath)) {
      console.warn(`Mmproj file not found: ${mmprojPath}. Multimodal features will be disabled.`);
      mmprojPath = null;
    } else {
      console.log("Multimodal model detected, mmproj path:", mmprojPath);
    }
  }

  // Load model with or without mmproj
  const loadOptions = { modelPath };
  if (mmprojPath) {
    loadOptions.mmproj = mmprojPath;
  }

  const model = await llama.loadModel(loadOptions);
  loadedModel = model; // Store reference for proper disposal

  const sysInfo = await systemInformation();
  const desiredCtx = computeMaxContextForModel(currentModel, sysInfo);
  console.log("Model context:", desiredCtx);

  // Try progressively smaller context sizes if memory is insufficient
  const contextSizesToTry = [desiredCtx];
  let ctx = desiredCtx;
  while (ctx > 2048) {
    ctx = Math.floor(ctx / 2);
    if (ctx >= 2048) contextSizesToTry.push(ctx);
  }
  if (!contextSizesToTry.includes(2048)) contextSizesToTry.push(2048);

  let lastError = null;
  for (const contextSize of contextSizesToTry) {
    try {
      console.log(`Trying context size: ${contextSize}`);
      modelContext = await model.createContext({ contextSize });
      console.log(`Successfully created context with size: ${contextSize}`);
      break;
    } catch (err) {
      console.log(`Context size ${contextSize} failed: ${err.message}`);
      lastError = err;
      // Continue to try smaller size
    }
  }

  if (!modelContext) {
    throw lastError || new Error("Failed to create model context");
  }

  // Detect model type and use appropriate chat wrapper
  // MythoMax uses Alpaca format which needs explicit template
  const lowerFilename = normalizedFilename.toLowerCase();
  const isMythoMax = lowerFilename.includes('mythomax');
  const isAlpacaModel = isMythoMax || lowerFilename.includes('alpaca');

  let sessionOptions = {
    contextSequence: modelContext.getSequence(),
  };

  if (isAlpacaModel) {
    console.log("[LLM] Using Alpaca chat template for model:", normalizedFilename);
    // Alpaca-style template for MythoMax and similar models
    sessionOptions.chatWrapper = new TemplateChatWrapper({
      template: "{{systemPrompt}}\n\n{{history}}### Instruction:\n{{completion}}\n\n### Response:\n",
      historyTemplate: {
        system: "{{message}}\n\n",
        user: "### Instruction:\n{{message}}\n\n### Response:\n",
        model: "{{message}}\n\n"
      },
      joinAdjacentMessagesOfTheSameType: false,
    });
  }

  modelSession = new LlamaChatSession(sessionOptions);

  // Store current model info for multimodal checks
  currentLoadedModel = {
    ...currentModel,
    isMultimodal: !!mmprojPath,
  };

  console.log(`Model loaded: ${currentModel.filename}, multimodal: ${!!mmprojPath}`);

  return true;
}

function checkModel(_event, modelname) {
  // Normalize filename to lowercase
  const normalizedName = normalizeModelFilename(modelname);

  // Check if this is a multi-part GGUF reference
  const multiPart = parseMultiPartGGUF(normalizedName);
  if (multiPart && multiPart.totalParts > 1) {
    // For multi-part models, check for the merged file
    const mergedFilename = normalizeModelFilename(`${multiPart.baseName}.gguf`);
    const mergedPath = path.join(MODEL_DIR, mergedFilename);

    if (fs.existsSync(mergedPath)) {
      console.log(`[Multi-Part Check] Merged file exists: ${mergedFilename}`);
      return true;
    }

    // Check if parts exist (download in progress or merge needed)
    const partFilenames = generateMultiPartFilenames(multiPart.baseName, multiPart.totalParts);
    const existingParts = partFilenames.filter((partFile) => {
      const partPath = path.join(MODEL_DIR, normalizeModelFilename(partFile));
      return fs.existsSync(partPath);
    });

    if (existingParts.length === multiPart.totalParts) {
      console.log(`[Multi-Part Check] All parts exist but not merged yet`);
      return false; // Needs merge
    }

    console.error(`[Multi-Part Check] Missing merged file and only ${existingParts.length}/${multiPart.totalParts} parts`);
    return false;
  }

  // Single file check
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

async function unloadModel() {
  if (modelSession) {
    console.log("[LLM] Unloading model session...");
    modelSession = undefined;
  }
  if (modelContext) {
    console.log("[LLM] Disposing model context...");
    await modelContext.dispose();
    modelContext = undefined;
  }
  // CRITICAL: Dispose the actual model object to release GPU memory
  // This is especially important for large models like GLM before running vision
  if (loadedModel) {
    console.log("[LLM] Disposing model to free GPU memory...");
    try {
      await loadedModel.dispose();
    } catch (e) {
      console.warn("[LLM] Model dispose warning:", e.message);
    }
    loadedModel = undefined;
  }
  currentLoadedModel = null;

  // Force garbage collection if available
  if (global.gc) {
    global.gc();
  }

  // Give GPU time to release memory before vision model loads
  await new Promise(resolve => setTimeout(resolve, 500));

  console.log("[LLM] Model unloaded successfully");
  return true;
}

// DEPRECATED: Vision is now handled server-side via diffuser.py /vision/analyze endpoint
// This function is kept for backwards compatibility but will always return an error
async function chatWithVision(_event, { message, imageBase64 }) {
  throw new Error(
    "Vision has been moved to server-side. " +
    "Use the /vision/analyze endpoint on the diffuser server instead. " +
    "This provides better performance and model support via the full HuggingFace transformers library."
  );
}

// DEPRECATED: Vision model is now downloaded via server-side pipeline
// Check if mmproj file exists (kept for backwards compatibility)
function checkMmproj(_event, mmprojFilename) {
  const normalizedName = normalizeModelFilename(mmprojFilename || MINICPM_V_MODEL.mmproj);
  const mmprojPath = path.join(MODEL_DIR, normalizedName);
  return fs.existsSync(mmprojPath);
}

// DEPRECATED: Vision model is now downloaded via server-side pipeline
// This function is kept for backwards compatibility
async function downloadMmproj(event, { url, filename }) {
  console.warn("[Mmproj Download] DEPRECATED: Use server-side pipeline prefetch instead");
  const targetFilename = filename || MINICPM_V_MODEL.mmproj;
  if (!url) {
    throw new Error("URL is required for mmproj download");
  }
  return downloadModel(event, url, targetFilename);
}

// ─────────────────────────────────────────────────────────────────────────────
// OpenClaw API Server
// Forwards webhook requests to the renderer which uses the existing flagship.js
// generation logic. This ensures the same code path for both UI and external chat.
// ─────────────────────────────────────────────────────────────────────────────
const OPENCLAW_API_PORT = parseInt(process.env.OPENCLAW_API_PORT || "3002");
let openclawServer = null;

// Pending webhook requests waiting for renderer response
const pendingWebhookRequests = new Map();
let webhookRequestId = 0;

// IPC handler for renderer to respond to webhook requests
ipcMain.handle("openclaw-webhook-response", (_event, { requestId, result }) => {
  const pending = pendingWebhookRequests.get(requestId);
  if (pending) {
    pending.resolve(result);
    pendingWebhookRequests.delete(requestId);
  }
});

/**
 * Forward webhook to renderer and wait for response
 */
function forwardToRenderer(data) {
  return new Promise((resolve, reject) => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      reject(new Error("Renderer not available"));
      return;
    }

    const requestId = ++webhookRequestId;
    const timeout = setTimeout(() => {
      pendingWebhookRequests.delete(requestId);
      reject(new Error("Webhook request timed out"));
    }, 120000); // 2 minute timeout for generation

    pendingWebhookRequests.set(requestId, {
      resolve: (result) => {
        clearTimeout(timeout);
        resolve(result);
      },
      reject: (error) => {
        clearTimeout(timeout);
        reject(error);
      },
    });

    // Send to renderer
    mainWindow.webContents.send("openclaw-webhook", { requestId, ...data });
  });
}

function startOpenClawAPIServer() {
  openclawServer = http.createServer(async (req, res) => {
    // CORS headers
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url, `http://localhost:${OPENCLAW_API_PORT}`);

    // Health check
    if (url.pathname === "/health") {
      const companions = store.get("companions", []);
      const scenarios = store.get("scenarios", []);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        status: "ok",
        llmLoaded: !!loadedModel,
        modelName: currentLoadedModel?.filename || null,
        flaskPort: PY_SERVER_PORT,
        companions: companions.length,
        scenarios: scenarios.length,
        rendererReady: mainWindow && !mainWindow.isDestroyed(),
      }));
      return;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // OpenClaw Gateway Webhook - Forwards to renderer for processing
    // ═══════════════════════════════════════════════════════════════════════
    if (req.method === "POST" && url.pathname === "/webhook") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", async () => {
        try {
          const data = JSON.parse(body);
          console.log(`[OpenClaw Webhook] ${data.platform}/${data.channelId}: ${data.message}`);

          // Forward to renderer and wait for response
          const result = await forwardToRenderer(data);

          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(result));
        } catch (error) {
          console.error("[OpenClaw Webhook] Error:", error);
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: error.message }));
        }
      });
      return;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Companion & Scenario REST API (forwards to renderer for dynamic data)
    // ═══════════════════════════════════════════════════════════════════════
    if (req.method === "GET" && url.pathname === "/companions") {
      try {
        const result = await forwardToRenderer({ type: "get-companions" });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result));
      } catch (error) {
        res.writeHead(503, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Renderer not available", companions: [] }));
      }
      return;
    }

    if (req.method === "GET" && url.pathname === "/scenarios") {
      try {
        const result = await forwardToRenderer({ type: "get-scenarios" });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result));
      } catch (error) {
        res.writeHead(503, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Renderer not available", scenarios: [] }));
      }
      return;
    }

    if (req.method === "GET" && url.pathname.startsWith("/companion/")) {
      const id = url.pathname.split("/")[2];
      try {
        const result = await forwardToRenderer({ type: "get-companion", id });
        if (result) {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(result));
        } else {
          res.writeHead(404, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Companion not found" }));
        }
      } catch (error) {
        res.writeHead(503, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Renderer not available" }));
      }
      return;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // OpenAI-Compatible API (for OpenClaw and other clients)
    // ═══════════════════════════════════════════════════════════════════════

    // GET /v1/models - List available models
    if (req.method === "GET" && url.pathname === "/v1/models") {
      const modelName = currentLoadedModel?.filename || "bonzai-sovereign";
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        object: "list",
        data: [
          {
            id: "bonzai-sovereign",
            object: "model",
            created: Date.now(),
            owned_by: "bonzai",
          },
          {
            id: modelName,
            object: "model",
            created: Date.now(),
            owned_by: "bonzai",
          }
        ],
      }));
      return;
    }

    // POST /v1/chat/completions - OpenAI-compatible chat endpoint
    if (req.method === "POST" && url.pathname === "/v1/chat/completions") {
      console.log(`[OpenAI API] Incoming request headers:`, JSON.stringify(req.headers));
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", async () => {
        console.log(`[OpenAI API] req.on(end) triggered, body length: ${body.length}`);
        try {
          console.log(`[OpenAI API] Request body preview:`, body.substring(0, 500));

          let parsed;
          try {
            parsed = JSON.parse(body);
            console.log(`[OpenAI API] JSON parsed successfully, keys:`, Object.keys(parsed));
          } catch (parseErr) {
            console.error(`[OpenAI API] JSON parse error:`, parseErr.message);
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: { message: "Invalid JSON", type: "invalid_request_error" } }));
            return;
          }

          const { messages, model, temperature, max_tokens, stream } = parsed;
          console.log(`[OpenAI API] Extracted: model=${model}, messages=${messages?.length}, stream=${stream}`);

          if (!messages || !Array.isArray(messages)) {
            console.log(`[OpenAI API] Invalid messages, returning 400`);
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({
              error: { message: "messages array is required", type: "invalid_request_error" }
            }));
            return;
          }

          console.log(`[OpenAI API] modelSession exists: ${!!modelSession}`);
          if (!modelSession) {
            console.log(`[OpenAI API] No model session, returning 503`);
            res.writeHead(503, { "Content-Type": "application/json" });
            res.end(JSON.stringify({
              error: { message: "No model loaded. Please load a model in BonzAI first.", type: "server_error" }
            }));
            return;
          }

          // Map any model name (bonzai-sovereign, local, etc.) to the currently loaded model
          const actualModel = currentLoadedModel?.filename || "unknown";
          console.log(`[OpenAI API] Request for model "${model}" -> using loaded model "${actualModel}"`);

          // Convert OpenAI messages format to a single prompt
          // Format: system message as context, then conversation history
          let prompt = "";
          for (const msg of messages) {
            if (msg.role === "system") {
              prompt += `${msg.content}\n\n`;
            } else if (msg.role === "user") {
              prompt += `User: ${msg.content}\n`;
            } else if (msg.role === "assistant") {
              prompt += `Assistant: ${msg.content}\n`;
            }
          }
          prompt += "Assistant:";

          const responseId = `chatcmpl-${Date.now()}`;
          console.log(`[OpenAI API] Processing ${messages.length} messages, stream=${!!stream}`);

          if (stream) {
            // Streaming response using Server-Sent Events
            res.writeHead(200, {
              "Content-Type": "text/event-stream",
              "Cache-Control": "no-cache",
              "Connection": "keep-alive",
            });

            // Send immediate initial chunk to establish the stream
            const initialChunk = {
              id: responseId,
              object: "chat.completion.chunk",
              created: Math.floor(Date.now() / 1000),
              model: actualModel,
              choices: [{
                index: 0,
                delta: { role: "assistant", content: "" },
                finish_reason: null,
              }],
            };
            res.write(`data: ${JSON.stringify(initialChunk)}\n\n`);

            // Use true token-by-token streaming from node-llama-cpp
            console.log(`[OpenAI API] Starting streaming response for ${prompt.length} char prompt...`);

            let tokenCount = 0;
            try {
              // Use the prompt method with onTextChunk for true streaming
              await modelSession.prompt(prompt, {
                onTextChunk: (chunk) => {
                  tokenCount++;
                  if (tokenCount === 1) {
                    console.log(`[OpenAI API] First token received, streaming started`);
                  }
                  const chunkData = {
                    id: responseId,
                    object: "chat.completion.chunk",
                    created: Math.floor(Date.now() / 1000),
                    model: actualModel,
                    choices: [{
                      index: 0,
                      delta: { content: chunk },
                      finish_reason: null,
                    }],
                  };
                  res.write(`data: ${JSON.stringify(chunkData)}\n\n`);
                }
              });

              console.log(`[OpenAI API] Streaming complete, ${tokenCount} chunks sent`);

              // Send final chunk
              const finalChunk = {
                id: responseId,
                object: "chat.completion.chunk",
                created: Math.floor(Date.now() / 1000),
                model: actualModel,
                choices: [{
                  index: 0,
                  delta: {},
                  finish_reason: "stop",
                }],
              };
              res.write(`data: ${JSON.stringify(finalChunk)}\n\n`);
              res.write("data: [DONE]\n\n");
              res.end();
            } catch (streamError) {
              console.error(`[OpenAI API] Streaming error:`, streamError);
              if (!res.writableEnded) {
                res.end();
              }
            }
          } else {
            // Non-streaming response
            const response = await modelSession.prompt(prompt);

            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({
              id: responseId,
              object: "chat.completion",
              created: Math.floor(Date.now() / 1000),
              model: actualModel,
              choices: [
                {
                  index: 0,
                  message: {
                    role: "assistant",
                    content: response,
                  },
                  finish_reason: "stop",
                },
              ],
              usage: {
                prompt_tokens: prompt.length,
                completion_tokens: response.length,
                total_tokens: prompt.length + response.length,
              },
            }));
          }
        } catch (error) {
          console.error("[OpenAI API] Chat completions error:", error);
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({
            error: { message: error.message, type: "server_error" }
          }));
        }
      });
      return;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // LLM API (for direct access without roleplay context)
    // ═══════════════════════════════════════════════════════════════════════
    if (req.method === "POST" && url.pathname === "/api/llm/chat") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", async () => {
        try {
          const { prompt } = JSON.parse(body);

          if (!prompt) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "prompt is required" }));
            return;
          }

          if (!modelSession) {
            res.writeHead(503, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "LLM not loaded. Load a model first." }));
            return;
          }

          const response = await modelSession.prompt(prompt);

          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: true, response }));
        } catch (error) {
          console.error("[OpenClaw API] LLM chat error:", error);
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: error.message }));
        }
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/llm/load") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", async () => {
        try {
          const { modelname, filename, url: modelUrl } = JSON.parse(body);
          await loadModel(null, { modelname, filename, url: modelUrl });
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: true, modelName: modelname || filename }));
        } catch (error) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: error.message }));
        }
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/llm/unload") {
      try {
        await unloadModel();
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true }));
      } catch (error) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: error.message }));
      }
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/llm/info") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        loaded: !!loadedModel,
        modelName: currentLoadedModel?.filename || null,
        hasSession: !!modelSession,
      }));
      return;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Flask Proxy (for direct media generation access)
    // ═══════════════════════════════════════════════════════════════════════
    if (url.pathname.startsWith("/api/flask/")) {
      const flaskPath = url.pathname.replace("/api/flask", "");
      const flaskUrl = `http://localhost:${PY_SERVER_PORT}${flaskPath}`;

      try {
        if (req.method === "POST") {
          let body = "";
          req.on("data", (chunk) => (body += chunk));
          req.on("end", async () => {
            const response = await fetch(flaskUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: body,
            });
            const data = await response.json();
            res.writeHead(response.status, { "Content-Type": "application/json" });
            res.end(JSON.stringify(data));
          });
        } else {
          const response = await fetch(flaskUrl);
          const data = await response.json();
          res.writeHead(response.status, { "Content-Type": "application/json" });
          res.end(JSON.stringify(data));
        }
      } catch (error) {
        res.writeHead(502, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: `Flask proxy error: ${error.message}` }));
      }
      return;
    }

    // Not found
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
  });

  openclawServer.listen(OPENCLAW_API_PORT, () => {
    console.log(`[OpenClaw API] Server running on http://localhost:${OPENCLAW_API_PORT}`);
    console.log(`[OpenClaw API] Endpoints:`);
    console.log(`  GET  /v1/models            - List models (OpenAI-compatible)`);
    console.log(`  POST /v1/chat/completions  - Chat completions (OpenAI-compatible)`);
    console.log(`  POST /webhook              - OpenClaw gateway webhook (forwards to renderer)`);
    console.log(`  GET  /companions           - List all companions (from store)`);
    console.log(`  GET  /scenarios            - List all scenarios (from store)`);
    console.log(`  GET  /companion/:id        - Get companion details`);
    console.log(`  POST /api/llm/chat         - Direct LLM chat`);
    console.log(`  POST /api/llm/load         - Load an LLM model`);
    console.log(`  POST /api/llm/unload       - Unload current model`);
    console.log(`  GET  /api/llm/info         - Get LLM status`);
    console.log(`  *    /api/flask/*          - Proxy to Flask server`);
  });
}

// Start OpenClaw API when app is ready
app.on("ready", () => {
  startOpenClawAPIServer();
});
