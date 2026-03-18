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
import crypto from "crypto";
import { pipeline } from "stream/promises";
import {
  getP2PNode,
  startP2PNode,
  stopP2PNode,
  PROTOCOLS as P2P_PROTOCOLS,
} from "./services/libp2p.service.js";
import {
  createPaymentRequest,
  validatePayment,
  isSelfInference,
  calculatePaymentAmount,
} from "./services/x402.service.js";
import {
  listExamples as studioListExamples,
  saveExample as studioSaveExample,
  deleteExample as studioDeleteExample,
  exportDataset as studioExportDataset,
} from "./scripts/dataset-studio.js";

// ─────────────────────────────────────────────────────────────────────────────
// Globals / paths
// ─────────────────────────────────────────────────────────────────────────────
let llama = null;
let llamaUnifiedMemoryBroken = false; // node-llama-cpp 3.16.x reports unifiedSize=0 on Apple Silicon
try {
  llama = await getLlama({ logLevel: "warn" });
  console.log(`[LLM] Engine initialized — gpu: ${llama.gpu}, gpuOffload: ${llama.supportsGpuOffloading}`);
  try {
    const vramState = await llama._vramOrchestrator?.getMemoryState?.();
    if (vramState) {
      console.log(
        `[LLM] VRAM state — total: ${(vramState.total / 1e9).toFixed(1)}GB, ` +
        `free: ${(vramState.free / 1e9).toFixed(1)}GB, ` +
        `unifiedSize: ${((vramState.unifiedSize || 0) / 1e9).toFixed(1)}GB`
      );
      // Detect broken unified memory reporting: Metal GPU detected but unifiedSize=0
      if (llama.gpu === "metal" && (vramState.unifiedSize || 0) === 0 && vramState.total > 0) {
        llamaUnifiedMemoryBroken = true;
        console.warn("[LLM] Detected broken unifiedSize=0 on Metal — will use gpuLayers override");
      }
    }
  } catch (e) {
    console.warn("[LLM] Could not read VRAM state:", e.message);
  }
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
    await startPythonSubprocess();
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

const killPort = async (port = PY_SERVER_PORT) => {
  try {
    if (process.platform === "win32") {
      await new Promise((resolve) => {
        child_process.exec(
          `for /f "tokens=5" %a in ('netstat -aon ^| find ":${port}" ^| find "LISTENING"') do taskkill /f /pid %a`,
          { stdio: "ignore" },
          () => resolve()
        );
      });
    } else {
      // Get PIDs first, then kill if any exist
      const result = await new Promise((resolve) => {
        child_process.exec(`lsof -ti:${port} 2>/dev/null || true`, { encoding: "utf8" }, (err, stdout) => {
          resolve(stdout || "");
        });
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
        // Wait for port to be fully released by the OS
        await waitForPortFree(port);
      } else {
        console.log(`[killPort] No process found on port ${port}`);
      }
    }
  } catch (e) {
    console.warn(`[killPort] Error: ${e.message}`);
  }
};

// Poll until no process holds the port (max ~3s)
const waitForPortFree = async (port, timeoutMs = 3000) => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const still = await new Promise((resolve) => {
      child_process.exec(`lsof -ti:${port} 2>/dev/null || true`, { encoding: "utf8" }, (_e, out) => {
        resolve((out || "").trim());
      });
    });
    if (!still) {
      console.log(`[killPort] Port ${port} is free`);
      return;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  console.warn(`[killPort] Port ${port} still occupied after ${timeoutMs}ms`);
};

const startPythonSubprocess = async () => {
  // Detach old process handlers BEFORE killing port to prevent its close
  // handler from triggering a self-healing restart that races with this spawn
  if (subpy) {
    const oldProc = subpy;
    subpy = null;
    oldProc.removeAllListeners("close");
    oldProc.removeAllListeners("error");
  }
  await killPort(PY_SERVER_PORT);
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
    // Pass JWT secret so tokens survive server restarts
    BONZAI_JWT_SECRET: JWT_SECRET,
  };

  // Log detailed spawn info
  console.log(`[Spawn] Command: ${launch.cmd}`);
  console.log(`[Spawn] Args: ${JSON.stringify(launch.args)}`);
  console.log(`[Spawn] CWD: ${launch.cwd}`);
  console.log(`[Spawn] TMPDIR: ${tmpDir}`);
  console.log(`[Spawn] BONZAI_MODEL_DIR: ${MODEL_DIR}`);
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

  // ─────────────────────────────────────────────────────────────────────────────
  // macOS quarantine fix: When users download and install a signed/notarized DMG,
  // macOS adds com.apple.quarantine to all files. While the main app's quarantine
  // is cleared on first launch, nested executables launched as subprocesses retain
  // their quarantine and are silently blocked. We must clear it explicitly.
  // ─────────────────────────────────────────────────────────────────────────────
  if (process.platform === "darwin" && app.isPackaged) {
    try {
      // Clear quarantine from the diffuser binary and its containing directory
      child_process.execSync(`xattr -rd com.apple.quarantine "${launch.cmd}"`, {
        stdio: "ignore",
      });
      console.log(`[Spawn] Cleared quarantine attribute from binary`);

      // Also clear from the runtime directory (for onedir mode with _internal/)
      child_process.execSync(`xattr -rd com.apple.quarantine "${launch.cwd}"`, {
        stdio: "ignore",
      });
      console.log(`[Spawn] Cleared quarantine from runtime directory`);
    } catch (e) {
      // Ignore errors - attribute may not exist, or we may lack permissions
      console.log(`[Spawn] Quarantine clear: ${e.message || "no attribute"}`);
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

  // Forward server logs to renderer console (throttled to max 2/sec)
  let _logBuffer = [];
  let _logFlushTimer = null;
  const flushLogs = () => {
    _logFlushTimer = null;
    if (_logBuffer.length === 0) return;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("server-log", { batch: _logBuffer });
    }
    _logBuffer = [];
  };
  const forwardLog = (data, type = "log") => {
    const text = data.toString().trim();
    if (!text) return;
    _logBuffer.push({ type, text });
    if (!_logFlushTimer) {
      _logFlushTimer = setTimeout(flushLogs, 500);
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
      const controller = new AbortController();
      const fetchTimeout = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(fetchTimeout);
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
  { scheme: "local-video", privileges: { bypassCSP: true, stream: true, supportFetchAPI: true, corsEnabled: true } },
]);

app.whenReady().then(() => {
  protocol.handle("app", (req) => {
    const { pathname } = new URL(req.url);
    return net.fetch(pathToFileURL(pathname).toString());
  });

  // Serve local video files safely via local-video:// protocol
  // Usage: local-video:///path/to/video.mp4
  protocol.handle("local-video", (req) => {
    const { pathname } = new URL(req.url);
    const decoded = decodeURIComponent(pathname);
    // Only allow video file extensions
    const ext = path.extname(decoded).toLowerCase();
    const allowed = [".mp4", ".webm", ".mov", ".avi", ".mkv", ".ogv", ".m4v"];
    if (!allowed.includes(ext)) {
      return new Response("Forbidden", { status: 403 });
    }
    return net.fetch(pathToFileURL(decoded).toString());
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

// ─────────────────────────────────────────────────────────────────────────────
// JWT Secret - persisted so tokens survive server restarts
// ─────────────────────────────────────────────────────────────────────────────
function getOrCreateJwtSecret() {
  let secret = store.get("jwtSecret");
  if (!secret) {
    secret = crypto.randomBytes(32).toString("hex");
    store.set("jwtSecret", secret);
    console.log("[Auth] Generated new JWT secret");
  }
  return secret;
}

const JWT_SECRET = getOrCreateJwtSecret();

// ─────────────────────────────────────────────────────────────────────────────
// Transaction confirmation dialog (P0 Security)
// Shows native Electron dialog for agent wallet transactions above threshold
// ─────────────────────────────────────────────────────────────────────────────
const TX_CONFIRM_THRESHOLD_ETH = 0.0005; // ~$1 — anything above requires user approval

ipcMain.handle("confirm-transaction", async (_event, details) => {
  const { companionName, recipientAddress, amountEth, chainName, context } = details;

  // Auto-approve transactions below threshold
  const amount = parseFloat(amountEth) || 0;
  if (amount <= TX_CONFIRM_THRESHOLD_ETH) {
    return { approved: true, autoApproved: true };
  }

  // Show native dialog
  const win = mainWindow || BrowserWindow.getFocusedWindow();
  const result = await dialog.showMessageBox(win, {
    type: "question",
    title: "Confirm Agent Transaction",
    message: `${companionName || "Companion"} wants to send ${amountEth} ETH`,
    detail: [
      `Recipient: ${recipientAddress}`,
      `Chain: ${chainName || "Base"}`,
      `Amount: ${amountEth} ETH`,
      context ? `Context: ${context}` : "",
      "",
      "Do you approve this transaction?",
    ]
      .filter(Boolean)
      .join("\n"),
    buttons: ["Approve", "Reject"],
    defaultId: 1, // Default to Reject
    cancelId: 1,
    noLink: true,
  });

  return { approved: result.response === 0, autoApproved: false };
});

// ─────────────────────────────────────────────────────────────────────────────
// Privy Server Wallet IPC Handlers
// All Privy API calls go through main process to keep App Secret secure.
// The PRIVY_APP_SECRET env var is never exposed to the renderer.
// ─────────────────────────────────────────────────────────────────────────────

const PRIVY_API_BASE = "https://api.privy.io/v1";

function getPrivyHeaders() {
  const appId = process.env.VITE_PRIVY_APP_ID;
  const appSecret = process.env.PRIVY_APP_SECRET;
  if (!appId || !appSecret) {
    throw new Error("Privy credentials not configured (VITE_PRIVY_APP_ID + PRIVY_APP_SECRET)");
  }
  const basicAuth = Buffer.from(`${appId}:${appSecret}`).toString("base64");
  return {
    "Content-Type": "application/json",
    "Authorization": `Basic ${basicAuth}`,
    "privy-app-id": appId,
  };
}

async function privyFetch(endpoint, options = {}) {
  const url = `${PRIVY_API_BASE}${endpoint}`;
  const headers = getPrivyHeaders();
  const response = await fetch(url, { ...options, headers: { ...headers, ...options.headers } });
  const data = await response.json();
  if (!response.ok) {
    const msg = data?.message || data?.error || `Privy API error ${response.status}`;
    throw new Error(msg);
  }
  return data;
}

ipcMain.handle("privy:create-server-wallet", async (_event, { companionId }) => {
  try {
    const data = await privyFetch("/wallets", {
      method: "POST",
      body: JSON.stringify({
        chain_type: "ethereum",
        // Tag with companion ID for traceability
        idempotency_key: `bonzai-agent-${companionId}-${Date.now()}`,
      }),
    });
    return { walletId: data.id, address: data.address };
  } catch (err) {
    console.error("[Privy] Create wallet failed:", err.message);
    return { error: err.message };
  }
});

ipcMain.handle("privy:send-transaction", async (_event, { walletId, tx }) => {
  try {
    const data = await privyFetch(`/wallets/${walletId}/rpc`, {
      method: "POST",
      body: JSON.stringify({
        method: tx.method || "eth_sendTransaction",
        caip2: tx.caip2 || "eip155:8453",
        params: tx.params,
      }),
    });
    return { hash: data.data?.hash || data.hash || data.result };
  } catch (err) {
    console.error("[Privy] Send transaction failed:", err.message);
    return { error: err.message };
  }
});

ipcMain.handle("privy:sign-typed-data", async (_event, { walletId, typedData }) => {
  try {
    const data = await privyFetch(`/wallets/${walletId}/rpc`, {
      method: "POST",
      body: JSON.stringify({
        method: typedData.method || "eth_signTypedData_v4",
        caip2: typedData.caip2 || "eip155:8453",
        params: {
          typed_data: {
            domain: typedData.params?.domain || typedData.domain,
            types: typedData.params?.types || typedData.types,
            message: typedData.params?.message || typedData.message,
          },
        },
      }),
    });
    return { signature: data.data?.signature || data.signature || data.result };
  } catch (err) {
    console.error("[Privy] Sign typed data failed:", err.message);
    return { error: err.message };
  }
});

ipcMain.handle("privy:get-wallet", async (_event, walletId) => {
  try {
    return await privyFetch(`/wallets/${walletId}`);
  } catch (err) {
    console.error("[Privy] Get wallet failed:", err.message);
    return { error: err.message };
  }
});

ipcMain.handle("privy:set-policy", async (_event, { walletId, policy }) => {
  try {
    return await privyFetch(`/wallets/${walletId}/policy`, {
      method: "PUT",
      body: JSON.stringify(policy),
    });
  } catch (err) {
    console.error("[Privy] Set policy failed:", err.message);
    return { error: err.message };
  }
});

ipcMain.handle("store-get", (_event, key, def) => store.get(key, def));
ipcMain.handle("store-set", (_event, key, value) => {
  store.set(key, value);
  return true;
});
ipcMain.handle("store-delete", (_event, key) => {
  store.delete(key);
  return true;
});

/**
 * Check if user has at least the required auth level.
 * Auth state is synced from the renderer's auth.service.js via electron store.
 * @param {number} minLevel - Minimum level required (1-6)
 */
function requireAuthLevel(minLevel) {
  const isAuth = store.get("auth.isAuthenticated", false);
  const levelValue = store.get("auth.levelValue", 0);
  const tokenExpiry = store.get("auth.tokenExpiry", 0);

  if (!isAuth || Date.now() > tokenExpiry) {
    throw new Error("Authentication required. Please connect your wallet and sign in.");
  }
  if (levelValue < minLevel) {
    throw new Error(`Level ${minLevel} access required. Please hold enough BONZAI tokens or unlock with ETH.`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// P2P Network (libp2p) - Distributed Inference
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Start the P2P node for distributed inference
 * @param {Object} options Configuration options
 * @param {number} options.listenPort Port to listen on (default: 4002)
 * @param {boolean} options.enableRelay Enable relay server for other providers
 * @param {string[]} options.bootstrapNodes Initial peers to connect to
 */
ipcMain.handle("p2p-start", async (_event, options = {}) => {
  try {
    console.log("[P2P] Starting libp2p node...");
    const peerId = await startP2PNode(options);

    // Register inference handler that routes to local servers
    const node = getP2PNode();
    const localPeerId = node.getPeerId();

    node.onInferenceRequest(async (request, remotePeer) => {
      console.log(`[P2P] Inference request from ${remotePeer}:`, request.pipeline);

      // Check if this is self-inference (consumer === provider)
      // Self-inference is FREE - no payment required
      if (isSelfInference(remotePeer, localPeerId)) {
        console.log(`[P2P] Self-inference detected, processing for free`);
        try {
          const result = await routeInferenceRequest(request);
          return { ok: true, result, selfInference: true };
        } catch (err) {
          return { ok: false, error: "inference_failed", detail: err.message };
        }
      }

      // Get provider settings
      const providerId = store.get("p2p.providerId", null);
      const pricePerToken = store.get("p2p.pricePerToken", "1000000000000"); // 0.000001 ETH per 1000 tokens

      // Check if this is a paid request (x402)
      if (!request.payment) {
        // Calculate required amount based on request
        const requiredAmount = calculatePaymentAmount(request, pricePerToken);

        // Return 402 Payment Required with x402 payment request
        const paymentRequest = createPaymentRequest({
          provider: providerId,
          amount: requiredAmount,
          service: request.pipeline,
        });

        return {
          ok: false,
          error: "payment_required",
          status: 402,
          payment: paymentRequest,
        };
      }

      // Validate the x402 payment signature
      const validation = await validatePayment(request.payment, {
        expectedProviderId: providerId,
        minAmount: calculatePaymentAmount(request, pricePerToken),
        pipeline: request.pipeline,
      });

      if (!validation.valid) {
        console.log(`[P2P] Payment validation failed: ${validation.error}`);
        return {
          ok: false,
          error: "payment_invalid",
          detail: validation.error,
          status: 402,
        };
      }

      console.log(`[P2P] Payment validated from ${validation.consumer}, amount: ${validation.amount}`);

      // Payment valid - process the inference request
      try {
        const result = await routeInferenceRequest(request);
        return {
          ok: true,
          result,
          payment: {
            consumer: validation.consumer,
            amount: validation.amount,
          },
        };
      } catch (err) {
        return { ok: false, error: "inference_failed", detail: err.message };
      }
    });

    // Register health handler
    node.onHealthRequest(async (request, remotePeer) => {
      const pipelines = store.get("p2p.pipelines", []);
      return {
        ok: true,
        peerId: node.getPeerId(),
        pipelines,
        version: app.getVersion(),
        uptime: process.uptime(),
      };
    });

    return {
      ok: true,
      peerId,
      multiaddrs: node.getMultiaddrs(),
    };
  } catch (err) {
    console.error("[P2P] Failed to start:", err);
    return { ok: false, error: err.message };
  }
});

/**
 * Stop the P2P node
 */
ipcMain.handle("p2p-stop", async () => {
  try {
    await stopP2PNode();
    return { ok: true };
  } catch (err) {
    console.error("[P2P] Failed to stop:", err);
    return { ok: false, error: err.message };
  }
});

/**
 * Get P2P node status
 */
ipcMain.handle("p2p-status", async () => {
  const node = getP2PNode();
  if (!node.isStarted) {
    return { ok: true, started: false };
  }

  return {
    ok: true,
    started: true,
    peerId: node.getPeerId(),
    multiaddrs: node.getMultiaddrs(),
    connectedPeers: node.getConnectedPeersCount(),
    relayConnections: node.getRelayConnectionsCount(),
    natStatus: node.getNatStatus(),
    isUsingRelay: node.isUsingRelay(),
  };
});

/**
 * Dial a remote peer
 */
ipcMain.handle("p2p-dial", async (_event, peerIdOrAddr) => {
  try {
    const node = getP2PNode();
    if (!node.isStarted) {
      return { ok: false, error: "Node not started" };
    }

    await node.dial(peerIdOrAddr);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

/**
 * Send inference request to a remote provider
 */
ipcMain.handle("p2p-inference", async (_event, { peerId, request }) => {
  try {
    const node = getP2PNode();
    if (!node.isStarted) {
      return { ok: false, error: "Node not started" };
    }

    const response = await node.sendInferenceRequest(peerId, request);
    return response;
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

/**
 * Check health of a remote peer
 */
ipcMain.handle("p2p-health", async (_event, peerId) => {
  try {
    const node = getP2PNode();
    if (!node.isStarted) {
      return { ok: false, error: "Node not started" };
    }

    const health = await node.checkPeerHealth(peerId);
    return health;
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

/**
 * Get local peer ID (for self-inference detection)
 */
ipcMain.handle("p2p-local-peer-id", async () => {
  const node = getP2PNode();
  if (!node.isStarted) {
    return { ok: false, error: "Node not started" };
  }
  return { ok: true, peerId: node.getPeerId() };
});

/**
 * Route inference request to local servers (OpenClaw or Flask)
 *
 * Supports all pipelines from flagship.js MODEL_REQUIREMENTS:
 * - LLM models (21 models) via OpenClaw on port 3002
 * - Image/Audio/Video/3D/Vision via Flask on port 65000
 *
 * @private
 */
async function routeInferenceRequest(request) {
  const { pipeline, params, model } = request;

  // OpenClaw port for LLM inference
  const OPENCLAW_PORT = process.env.OPENCLAW_API_PORT || 3002;
  // Flask port for diffusion/media inference
  const FLASK_PORT = process.env.BONZAI_SERVER_PORT || 65000;

  // Determine which server to route to based on pipeline
  const isLLMPipeline = pipeline.startsWith("llm_") || pipeline === "llm";
  const baseUrl = isLLMPipeline
    ? `http://127.0.0.1:${OPENCLAW_PORT}`
    : `http://127.0.0.1:${FLASK_PORT}`;

  // Map pipeline to endpoint and prepare params
  let endpoint;
  let requestParams = { ...params };

  if (isLLMPipeline) {
    // LLM inference via OpenClaw (OpenAI-compatible API)
    endpoint = "/v1/chat/completions";
    // If a specific model was requested, include it
    if (model) {
      requestParams.model = model;
    }
  } else {
    // Map Flask pipelines to endpoints
    switch (pipeline) {
      // Image pipelines
      case "image_turbo":
        endpoint = "/image/turbo";
        break;
      case "image_quality":
      case "image_advanced":
        endpoint = "/image/quality";
        break;
      case "image_standard":
        endpoint = "/image/standard";
        break;

      // Audio pipelines
      case "audio":
        endpoint = "/audio/tts";
        break;
      case "audio_turbo":
        endpoint = "/audio/turbo";
        break;
      case "audio_quality":
        endpoint = "/audio/quality/persona";
        break;

      // Music pipeline (ACE-Step)
      case "music":
        endpoint = "/audio/music";
        break;

      // Video pipeline (LTX-2)
      case "video_fast":
        endpoint = "/video";
        break;

      // Vision pipeline (Qwen3.5-0.8B 4-bit MLX)
      case "vision":
      case "qwen35_vision":
        endpoint = "/vision/analyze";
        break;

      // OCR pipeline (GLM-OCR 4-bit MLX)
      case "ocr":
      case "glm_ocr":
        endpoint = "/vision/ocr";
        break;

      default:
        throw new Error(`Unknown pipeline: ${pipeline}`);
    }
  }

  console.log(`[P2P] Routing ${pipeline} to ${baseUrl}${endpoint}`);

  // Make the request
  const response = await fetch(`${baseUrl}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestParams),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Inference failed (${response.status}): ${error}`);
  }

  return response.json();
}

// ─────────────────────────────────────────────────────────────────────────────
// App version
// ─────────────────────────────────────────────────────────────────────────────
ipcMain.handle("get-app-version", () => app.getVersion());

// ─────────────────────────────────────────────────────────────────────────────
// Model directory management
// ─────────────────────────────────────────────────────────────────────────────
ipcMain.handle("get-model-dir", () => MODEL_DIR);

// Helper: calculate directory size recursively (async for non-blocking)
async function calculateDirSize(dirPath) {
  let total = 0;
  try {
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
    // Process entries in parallel for speed
    const sizes = await Promise.all(
      entries.map(async (entry) => {
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
          return calculateDirSize(fullPath);
        } else if (entry.isFile()) {
          try {
            const stat = await fs.promises.stat(fullPath);
            return stat.size;
          } catch {
            return 0;
          }
        }
        return 0;
      })
    );
    total = sizes.reduce((sum, size) => sum + size, 0);
  } catch (e) {
    console.warn(`[calculateDirSize] Error reading ${dirPath}: ${e.message}`);
  }
  return total;
}

// Helper: collect all files recursively with relative paths (async)
async function collectFiles(dirPath, basePath = dirPath) {
  const results = [];
  try {
    await fs.promises.access(dirPath);
  } catch {
    return results;
  }
  try {
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        const subResults = await collectFiles(fullPath, basePath);
        results.push(...subResults);
      } else if (entry.isFile()) {
        try {
          const stat = await fs.promises.stat(fullPath);
          results.push({
            absolutePath: fullPath,
            relativePath: path.relative(basePath, fullPath),
            size: stat.size,
          });
        } catch {
          // Skip files that can't be stat'd
        }
      }
    }
  } catch (e) {
    console.warn(`[collectFiles] Error reading ${dirPath}: ${e.message}`);
  }
  return results;
}

// Helper: copy directory with stream-based progress (fully async)
async function copyDirWithProgress(srcDir, destDir, totalSize, progressFn) {
  const files = await collectFiles(srcDir);
  let copiedBytes = 0;

  for (const file of files) {
    const destPath = path.join(destDir, file.relativePath);
    const destDirPath = path.dirname(destPath);
    await fs.promises.mkdir(destDirPath, { recursive: true });

    // Skip files that already exist at dest with matching size (idempotent)
    try {
      const destStat = await fs.promises.stat(destPath);
      if (destStat.size === file.size) {
        copiedBytes += file.size;
        progressFn(copiedBytes, totalSize, file.relativePath);
        continue;
      }
    } catch {
      // File doesn't exist, will copy
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

ipcMain.handle("download-video-to-temp", async (_event, url) => {
  // Download a remote video to a temp file and return the local path
  // This bypasses CORS restrictions for direct video URLs (.mp4, .webm, etc.)
  const ext = path.extname(new URL(url).pathname).toLowerCase() || ".mp4";
  const allowed = [".mp4", ".webm", ".mov", ".avi", ".mkv", ".ogv", ".m4v"];
  if (!allowed.includes(ext)) {
    throw new Error(`Unsupported video format: ${ext}`);
  }

  const tempDir = path.join(app.getPath("temp"), "bonzai-videos");
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
  const tempPath = path.join(tempDir, `video-${Date.now()}${ext}`);

  const response = await net.fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);

  const fileStream = fs.createWriteStream(tempPath);
  const reader = response.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      fileStream.write(Buffer.from(value));
    }
  } finally {
    fileStream.end();
  }

  // Wait for file to be fully written
  await new Promise((resolve) => fileStream.on("finish", resolve));
  return tempPath;
});

ipcMain.handle("select-video-file", async () => {
  const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    title: "Select Video File",
    filters: [
      { name: "Video Files", extensions: ["mp4", "webm", "mov", "avi", "mkv", "ogv"] },
    ],
    properties: ["openFile"],
  });
  if (canceled || !filePaths.length) return null;
  return filePaths[0];
});

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

    // Also update roleplaySessions (companion chat history)
    try {
      const roleplaySessions = store.get("roleplaySessions", {});
      if (roleplaySessions && typeof roleplaySessions === "object") {
        let updated = false;
        const pathFields = ["image", "audio", "video", "backgroundImage"];

        const updatePath = (obj, field) => {
          if (obj[field] && typeof obj[field] === "string" && obj[field].startsWith(oldDirNormalized)) {
            obj[field] = obj[field].replace(oldDirNormalized, newDirNormalized);
            return true;
          }
          return false;
        };

        for (const sessionKey in roleplaySessions) {
          const session = roleplaySessions[sessionKey];
          if (!session) continue;

          // Update companion.image
          if (session.companion) {
            if (updatePath(session.companion, "image")) updated = true;
          }

          // Update scenario.image
          if (session.scenario) {
            if (updatePath(session.scenario, "image")) updated = true;
          }

          // Update session backgroundImage
          if (updatePath(session, "backgroundImage")) updated = true;

          // Update history messages
          if (Array.isArray(session.history)) {
            for (const msg of session.history) {
              for (const field of pathFields) {
                if (updatePath(msg, field)) updated = true;
              }
            }
          }

          // Update backgroundHistory
          if (Array.isArray(session.backgroundHistory)) {
            for (const entry of session.backgroundHistory) {
              if (updatePath(entry, "image")) updated = true;
            }
          }
        }

        if (updated) {
          store.set("roleplaySessions", roleplaySessions);
          console.log(`[Model Dir] Updated paths in roleplaySessions`);
        }
      }
    } catch (e) {
      console.warn(`[Model Dir] Failed to update roleplaySessions:`, e.message);
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

  // Also update roleplaySessions (companion chat history)
  try {
    const roleplaySessions = store.get("roleplaySessions", {});
    if (roleplaySessions && typeof roleplaySessions === "object") {
      let updated = false;
      const pathFields = ["image", "audio", "video", "backgroundImage"];

      const updatePath = (obj, field) => {
        if (obj[field] && typeof obj[field] === "string" && obj[field].startsWith(oldDirNormalized)) {
          obj[field] = obj[field].replace(oldDirNormalized, newDirNormalized);
          totalUpdated++;
          return true;
        }
        return false;
      };

      for (const sessionKey in roleplaySessions) {
        const session = roleplaySessions[sessionKey];
        if (!session) continue;

        // Update companion.image
        if (session.companion) {
          if (updatePath(session.companion, "image")) updated = true;
        }

        // Update scenario.image
        if (session.scenario) {
          if (updatePath(session.scenario, "image")) updated = true;
        }

        // Update session backgroundImage
        if (updatePath(session, "backgroundImage")) updated = true;

        // Update history messages
        if (Array.isArray(session.history)) {
          for (const msg of session.history) {
            for (const field of pathFields) {
              if (updatePath(msg, field)) updated = true;
            }
          }
        }

        // Update backgroundHistory
        if (Array.isArray(session.backgroundHistory)) {
          for (const entry of session.backgroundHistory) {
            if (updatePath(entry, "image")) updated = true;
          }
        }
      }

      if (updated) {
        store.set("roleplaySessions", roleplaySessions);
        console.log(`[Fix Paths] Updated paths in roleplaySessions`);
      }
    }
  } catch (e) {
    console.warn(`[Fix Paths] Failed to update roleplaySessions:`, e.message);
  }

  return { success: true, updatedPaths: totalUpdated };
});

// Force migrate all history paths to current MODEL_DIR
// This automatically detects paths with bonzai-models or files/ and updates them
ipcMain.handle("force-migrate-history", () => {
  const currentModelDir = path.resolve(MODEL_DIR);
  const currentFilesDir = path.join(currentModelDir, "files");
  let totalUpdated = 0;

  // Helper to detect and fix any path that looks like a bonzai model path
  const fixPath = (pathStr) => {
    if (!pathStr || typeof pathStr !== "string") return { changed: false, path: pathStr };

    // Common patterns for bonzai model directories
    const patterns = [
      /\/Users\/[^/]+\/bonzai-models\/files\//,
      /\/home\/[^/]+\/bonzai-models\/files\//,
      /bonzai-models\/files\//,
    ];

    for (const pattern of patterns) {
      if (pattern.test(pathStr)) {
        // Extract the filename portion after files/
        const match = pathStr.match(/files\/(.+)$/);
        if (match) {
          const newPath = path.join(currentFilesDir, match[1]);
          if (newPath !== pathStr) {
            return { changed: true, path: newPath };
          }
        }
      }
    }

    return { changed: false, path: pathStr };
  };

  // Fix inference histories
  const historyKeys = ["audioInferences", "imageInferences", "videoInferences", "objectInferences"];
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
              if (data[field]) {
                const result = fixPath(data[field]);
                if (result.changed) {
                  data[field] = result.path;
                  updated = true;
                  totalUpdated++;
                }
              }
            }
          }
          return item;
        });
        if (updated) {
          store.set(key, updatedHistory);
          console.log(`[Force Migrate] Updated paths in ${key}`);
        }
      }
    } catch (e) {
      console.warn(`[Force Migrate] Failed to update ${key}:`, e.message);
    }
  }

  // Fix roleplay sessions (companion history)
  try {
    const roleplaySessions = store.get("roleplaySessions", {});
    if (roleplaySessions && typeof roleplaySessions === "object") {
      let updated = false;
      const pathFields = ["image", "audio", "video", "backgroundImage"];

      for (const sessionKey in roleplaySessions) {
        const session = roleplaySessions[sessionKey];
        if (!session) continue;

        // Update companion.image
        if (session.companion?.image) {
          const result = fixPath(session.companion.image);
          if (result.changed) {
            session.companion.image = result.path;
            updated = true;
            totalUpdated++;
          }
        }

        // Update scenario.image
        if (session.scenario?.image) {
          const result = fixPath(session.scenario.image);
          if (result.changed) {
            session.scenario.image = result.path;
            updated = true;
            totalUpdated++;
          }
        }

        // Update session backgroundImage
        if (session.backgroundImage) {
          const result = fixPath(session.backgroundImage);
          if (result.changed) {
            session.backgroundImage = result.path;
            updated = true;
            totalUpdated++;
          }
        }

        // Update history messages
        if (Array.isArray(session.history)) {
          for (const msg of session.history) {
            for (const field of pathFields) {
              if (msg[field]) {
                const result = fixPath(msg[field]);
                if (result.changed) {
                  msg[field] = result.path;
                  updated = true;
                  totalUpdated++;
                }
              }
            }
          }
        }

        // Update backgroundHistory
        if (Array.isArray(session.backgroundHistory)) {
          for (const entry of session.backgroundHistory) {
            if (entry.image) {
              const result = fixPath(entry.image);
              if (result.changed) {
                entry.image = result.path;
                updated = true;
                totalUpdated++;
              }
            }
          }
        }
      }

      if (updated) {
        store.set("roleplaySessions", roleplaySessions);
        console.log(`[Force Migrate] Updated paths in roleplaySessions`);
      }
    }
  } catch (e) {
    console.warn(`[Force Migrate] Failed to update roleplaySessions:`, e.message);
  }

  console.log(`[Force Migrate] Complete. Updated ${totalUpdated} paths to ${currentFilesDir}`);
  return { success: true, updatedPaths: totalUpdated, newFilesDir: currentFilesDir };
});

// File existence check for media validation
ipcMain.handle("file-exists", (_event, filePath) => {
  try {
    return fs.existsSync(filePath);
  } catch {
    return false;
  }
});

// Get home directory for file paths
ipcMain.handle("get-home-dir", () => os.homedir());

// Read file as base64 (for NFT minting of audio/video files)
ipcMain.handle("read-file-as-base64", async (_event, filePath) => {
  try {
    const data = await fs.promises.readFile(filePath);
    return data.toString("base64");
  } catch (e) {
    console.error("[Main] Failed to read file as base64:", e.message);
    throw e;
  }
});

// Save base64 data to file (for OpenClaw/WhatsApp media delivery)
ipcMain.handle("save-base64-to-file", async (_event, filePath, base64Data) => {
  try {
    // Ensure directory exists
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Remove data URL prefix if present
    let data = base64Data;
    if (data.includes(",")) {
      data = data.split(",")[1];
    }

    // Write base64 data as binary
    const buffer = Buffer.from(data, "base64");
    fs.writeFileSync(filePath, buffer);

    return { success: true, path: filePath };
  } catch (error) {
    console.error("[save-base64-to-file] Error:", error);
    return { success: false, error: error.message };
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Irys / Arweave Upload (runs in Node.js — no browser polyfill issues)
// ─────────────────────────────────────────────────────────────────────────────
let irysNode = null;

ipcMain.handle("irys-init", async (_event, { privateKey }) => {
  try {
    const Irys = (await import("@irys/sdk")).default;
    irysNode = new Irys({
      url: "https://node2.irys.xyz",
      token: "ethereum",
      key: privateKey,
    });
    await irysNode.ready();
    console.log(`[Irys] Connected — wallet: ${irysNode.address}`);
    let balance = "0";
    try {
      const bal = await irysNode.getLoadedBalance();
      balance = irysNode.utils.fromAtomic(bal);
    } catch (e) {
      console.warn("[Irys] Could not fetch balance:", e.message);
    }
    return { ok: true, address: irysNode.address, balance };
  } catch (e) {
    console.error("[Irys] Init failed:", e.message);
    return { ok: false, error: e.message };
  }
});

ipcMain.handle("irys-upload", async (_event, { data, contentType, tags }) => {
  if (!irysNode) throw new Error("Irys not initialized — call irys-init first");
  const buf = Buffer.from(data);
  const receipt = await irysNode.upload(buf, { tags });
  console.log(`[Irys] Uploaded: ${receipt.id} (${buf.length} bytes)`);
  return {
    id: receipt.id,
    timestamp: receipt.timestamp,
    signature: receipt.signature,
  };
});

ipcMain.handle("irys-upload-json", async (_event, { json, tags }) => {
  if (!irysNode) throw new Error("Irys not initialized — call irys-init first");
  const buf = Buffer.from(JSON.stringify(json, null, 2), "utf-8");
  const allTags = [{ name: "Content-Type", value: "application/json" }, ...(tags || [])];
  const receipt = await irysNode.upload(buf, { tags: allTags });
  console.log(`[Irys] Uploaded JSON: ${receipt.id}`);
  return {
    id: receipt.id,
    timestamp: receipt.timestamp,
    signature: receipt.signature,
  };
});

ipcMain.handle("irys-balance", async () => {
  if (!irysNode) throw new Error("Irys not initialized");
  const bal = await irysNode.getLoadedBalance();
  return irysNode.utils.fromAtomic(bal);
});

ipcMain.handle("irys-fund", async (_event, { amount }) => {
  if (!irysNode) throw new Error("Irys not initialized");
  const atomicAmount = irysNode.utils.toAtomic(amount);
  const response = await irysNode.fund(atomicAmount);
  console.log(`[Irys] Funded ${amount} ETH. TX: ${response.id}`);
  return { id: response.id };
});

ipcMain.handle("irys-price", async (_event, { bytes }) => {
  if (!irysNode) throw new Error("Irys not initialized");
  const price = await irysNode.getPrice(bytes);
  return irysNode.utils.fromAtomic(price);
});

ipcMain.handle("irys-disconnect", () => {
  irysNode = null;
  return { ok: true };
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

// ─────────────────────────────────────────────────────────────────────────────
// Hermes Agent Integration Config
// ─────────────────────────────────────────────────────────────────────────────
const HERMES_CONFIG_PATH = path.join(os.homedir(), ".hermes", "config.yaml");
const HERMES_SKILLS_DIR = path.join(os.homedir(), ".hermes", "skills");
const HERMES_ENV_PATH = path.join(os.homedir(), ".hermes", ".env");
const HERMES_BONZAI_SKILL_DIR = path.join(HERMES_SKILLS_DIR, "ai", "bonzai");

ipcMain.handle("hermes-is-installed", async () => {
  const hermesDir = path.join(os.homedir(), ".hermes");
  return fs.existsSync(hermesDir);
});

ipcMain.handle("hermes-get-enabled", async () => {
  try {
    // Check if bonzai skill is installed in Hermes skills directory
    const skillPath = path.join(HERMES_BONZAI_SKILL_DIR, "SKILL.md");
    return fs.existsSync(skillPath);
  } catch {
    return false;
  }
});

ipcMain.handle("hermes-set-enabled", async (_event, enabled) => {
  try {
    if (enabled) {
      // 1. Install BonzAI skill into Hermes skills directory
      if (!fs.existsSync(HERMES_BONZAI_SKILL_DIR)) {
        fs.mkdirSync(HERMES_BONZAI_SKILL_DIR, { recursive: true });
      }

      // Copy SKILL.md from our hermes/ directory
      const sourceSkill = path.join(__dirname, "..", "hermes", "SKILL.md");
      const destSkill = path.join(HERMES_BONZAI_SKILL_DIR, "SKILL.md");
      if (fs.existsSync(sourceSkill)) {
        fs.copyFileSync(sourceSkill, destSkill);
      }

      // 2. Add BonzAI as custom OpenAI-compatible endpoint in .env
      let envContent = "";
      if (fs.existsSync(HERMES_ENV_PATH)) {
        envContent = fs.readFileSync(HERMES_ENV_PATH, "utf8");
      }

      // Add/update BONZAI endpoint variables if not present
      if (!envContent.includes("BONZAI_BASE_URL")) {
        const bonzaiEnv = [
          "",
          "# BonzAI Decentralized AI - Local inference endpoint",
          `BONZAI_BASE_URL=http://127.0.0.1:${OPENCLAW_API_PORT}/v1`,
          "BONZAI_API_KEY=bonzai-local",
        ].join("\n");
        envContent += bonzaiEnv + "\n";
        fs.writeFileSync(HERMES_ENV_PATH, envContent);
      }

      console.log("[Hermes] Integration enabled — skill installed and env configured");
    } else {
      // Remove bonzai skill directory
      if (fs.existsSync(HERMES_BONZAI_SKILL_DIR)) {
        fs.rmSync(HERMES_BONZAI_SKILL_DIR, { recursive: true });
      }

      // Remove BonzAI env vars from .env
      if (fs.existsSync(HERMES_ENV_PATH)) {
        let envContent = fs.readFileSync(HERMES_ENV_PATH, "utf8");
        envContent = envContent
          .split("\n")
          .filter(line =>
            !line.includes("BONZAI_BASE_URL") &&
            !line.includes("BONZAI_API_KEY") &&
            !line.includes("# BonzAI Decentralized AI")
          )
          .join("\n");
        fs.writeFileSync(HERMES_ENV_PATH, envContent);
      }

      console.log("[Hermes] Integration disabled — skill removed");
    }

    return { success: true };
  } catch (error) {
    console.error("[Hermes] Failed to update config:", error);
    return { success: false, error: error.message };
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

// ─────────────────────────────────────────────────────────────────────────────
// Social Platform Integration (Instagram, TikTok, X)
// OAuth flows, API proxy, media upload for autonomous companion posting
// ─────────────────────────────────────────────────────────────────────────────

const SOCIAL_OAUTH_CONFIG = {
  instagram: {
    authUrl: 'https://www.facebook.com/v21.0/dialog/oauth',
    tokenUrl: 'https://graph.facebook.com/v21.0/oauth/access_token',
    redirectUri: 'bonzai://social/callback/instagram',
    scopes: ['instagram_basic', 'instagram_content_publish', 'instagram_manage_insights', 'pages_show_list', 'pages_read_engagement'],
  },
  tiktok: {
    authUrl: 'https://www.tiktok.com/v2/auth/authorize/',
    tokenUrl: 'https://open.tiktokapis.com/v2/oauth/token/',
    redirectUri: 'bonzai://social/callback/tiktok',
    scopes: ['user.info.basic', 'video.publish', 'video.upload'],
  },
  x: {
    authUrl: 'https://twitter.com/i/oauth2/authorize',
    tokenUrl: 'https://api.twitter.com/2/oauth2/token',
    redirectUri: 'bonzai://social/callback/x',
    scopes: ['tweet.read', 'tweet.write', 'users.read', 'offline.access', 'media.write'],
    usePKCE: true,
  },
};

// In-memory credential store (persisted via Electron Store)
const SOCIAL_CREDS_KEY = 'bonzai-social-credentials';

function getSocialCredentials(platform, companionId) {
  const all = store.get(SOCIAL_CREDS_KEY, {});
  return all[`${platform}:${companionId}`] || null;
}

function setSocialCredentials(platform, companionId, tokens) {
  const all = store.get(SOCIAL_CREDS_KEY, {});
  all[`${platform}:${companionId}`] = {
    ...tokens,
    updatedAt: Date.now(),
  };
  store.set(SOCIAL_CREDS_KEY, all);
}

/**
 * Start OAuth flow for a social platform.
 * Opens a BrowserWindow popup for user to authorize.
 */
ipcMain.handle("social:oauth-start", async (_event, { platform, companionId }) => {
  const config = SOCIAL_OAUTH_CONFIG[platform];
  if (!config) return { success: false, error: `Unknown platform: ${platform}` };

  // Get client ID from store (user configures in settings)
  const clientId = store.get(`social-${platform}-client-id`, '');
  if (!clientId) {
    return { success: false, error: `No client ID configured for ${platform}. Set it in Social Settings.` };
  }

  const state = crypto.randomBytes(16).toString('hex');
  let codeVerifier = null;
  let codeChallenge = null;

  // PKCE for X (Twitter)
  if (config.usePKCE) {
    codeVerifier = crypto.randomBytes(32).toString('base64url');
    const hash = crypto.createHash('sha256').update(codeVerifier).digest();
    codeChallenge = hash.toString('base64url');
  }

  // Build auth URL
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    scope: config.scopes.join(platform === 'tiktok' ? ',' : ' '),
    state,
  });

  if (codeChallenge) {
    params.set('code_challenge', codeChallenge);
    params.set('code_challenge_method', 'S256');
  }

  const authUrl = `${config.authUrl}?${params.toString()}`;

  return new Promise((resolve) => {
    const authWindow = new BrowserWindow({
      width: 600,
      height: 750,
      parent: mainWindow,
      modal: true,
      webPreferences: { nodeIntegration: false, contextIsolation: true },
    });

    authWindow.loadURL(authUrl);

    // Listen for redirect
    const handleRedirect = async (redirectUrl) => {
      try {
        const url = new URL(redirectUrl);
        if (!redirectUrl.startsWith(config.redirectUri)) return;

        const code = url.searchParams.get('code');
        const returnedState = url.searchParams.get('state');

        if (returnedState !== state) {
          resolve({ success: false, error: 'OAuth state mismatch' });
          authWindow.close();
          return;
        }

        if (!code) {
          const error = url.searchParams.get('error') || 'No authorization code received';
          resolve({ success: false, error });
          authWindow.close();
          return;
        }

        // Exchange code for tokens
        const clientSecret = store.get(`social-${platform}-client-secret`, '');
        const tokenBody = {
          client_id: clientId,
          code,
          redirect_uri: config.redirectUri,
          grant_type: 'authorization_code',
        };

        if (clientSecret) tokenBody.client_secret = clientSecret;
        if (codeVerifier) tokenBody.code_verifier = codeVerifier;

        const tokenRes = await fetch(config.tokenUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams(tokenBody).toString(),
        });

        const tokens = await tokenRes.json();

        if (tokens.error) {
          resolve({ success: false, error: tokens.error_description || tokens.error });
          authWindow.close();
          return;
        }

        // Calculate expiry
        const expiresIn = tokens.expires_in || 7200;
        tokens.expires_at = Date.now() + expiresIn * 1000;

        // Store credentials
        setSocialCredentials(platform, companionId, tokens);

        resolve({ success: true, tokens });
        authWindow.close();
      } catch (e) {
        resolve({ success: false, error: e.message });
        authWindow.close();
      }
    };

    // Intercept navigation for custom scheme redirect
    authWindow.webContents.on('will-navigate', (_e, url) => handleRedirect(url));
    authWindow.webContents.on('will-redirect', (_e, url) => handleRedirect(url));

    // Handle custom protocol redirect (bonzai://)
    authWindow.webContents.on('did-fail-load', (_e, _code, _desc, url) => {
      if (url && url.startsWith('bonzai://')) handleRedirect(url);
    });

    authWindow.on('closed', () => {
      resolve({ success: false, error: 'OAuth window closed by user' });
    });
  });
});

/**
 * Get stored social credentials for a platform/companion.
 */
ipcMain.handle("social:get-credentials", async (_event, { platform, companionId }) => {
  return getSocialCredentials(platform, companionId);
});

/**
 * Refresh OAuth token for a platform.
 */
ipcMain.handle("social:refresh-token", async (_event, { platform, companionId }) => {
  const config = SOCIAL_OAUTH_CONFIG[platform];
  const creds = getSocialCredentials(platform, companionId);

  if (!creds?.refresh_token) {
    return { success: false, error: 'No refresh token available' };
  }

  const clientId = store.get(`social-${platform}-client-id`, '');
  const clientSecret = store.get(`social-${platform}-client-secret`, '');

  try {
    const body = {
      client_id: clientId,
      grant_type: 'refresh_token',
      refresh_token: creds.refresh_token,
    };
    if (clientSecret) body.client_secret = clientSecret;

    const res = await fetch(config.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(body).toString(),
    });

    const tokens = await res.json();

    if (tokens.error) {
      return { success: false, error: tokens.error_description || tokens.error };
    }

    tokens.expires_at = Date.now() + (tokens.expires_in || 7200) * 1000;
    // Preserve refresh token if not returned (some platforms don't return it on refresh)
    if (!tokens.refresh_token) tokens.refresh_token = creds.refresh_token;

    setSocialCredentials(platform, companionId, tokens);
    return { success: true, tokens };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

/**
 * Generic social API call through main process (CORS bypass).
 */
ipcMain.handle("social:api-call", async (_event, { platform, url, method, headers, body, formData }) => {
  try {
    const fetchOpts = {
      method: method || 'GET',
      headers: {
        'User-Agent': 'BonzAI/1.0',
        ...headers,
      },
    };

    if (body && typeof body === 'string') {
      fetchOpts.body = body;
    } else if (body) {
      fetchOpts.headers['Content-Type'] = fetchOpts.headers['Content-Type'] || 'application/json';
      fetchOpts.body = JSON.stringify(body);
    }

    const response = await fetch(url, fetchOpts);
    const contentType = response.headers.get('content-type');
    let data;

    if (contentType && contentType.includes('application/json')) {
      data = await response.json();
    } else {
      data = await response.text();
    }

    return { ...data, status: response.status };
  } catch (e) {
    console.error(`[Social API] Error calling ${url}:`, e.message);
    return { error: e.message, status: 0 };
  }
});

/**
 * Upload media for social platforms (binary data via multipart/form-data).
 * Handles Buffer conversion from renderer's Uint8Array.
 */
ipcMain.handle("social:media-upload", async (_event, { platform, url, accessToken, file, fields }) => {
  try {
    // Special case: temporary hosting for Instagram (requires publicly accessible URL)
    if (url === '__temp_host__') {
      // For now, save to a temp file and serve via local HTTP
      // In production, upload to a CDN or use the app's own hosting
      const tempDir = path.join(os.tmpdir(), 'bonzai-social-media');
      if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

      const ext = (file.contentType || 'image/jpeg').split('/')[1] || 'bin';
      const filename = `${crypto.randomBytes(8).toString('hex')}.${ext}`;
      const filePath = path.join(tempDir, filename);

      fs.writeFileSync(filePath, Buffer.from(file.buffer));

      // Return local file path — the adapter will need to handle this
      // For Instagram, the image needs to be accessible via URL
      // This is a placeholder; real implementation needs a hosting solution
      return { success: true, url: `file://${filePath}`, localPath: filePath };
    }

    // Standard upload: construct multipart form
    const { FormData, Blob } = await import('node-fetch');

    // Use native fetch with FormData
    const formDataObj = new FormData();

    if (fields) {
      for (const [key, value] of Object.entries(fields)) {
        formDataObj.append(key, String(value));
      }
    }

    if (file) {
      const buffer = Buffer.from(file.buffer);
      const blob = new Blob([buffer], { type: file.contentType || 'application/octet-stream' });
      formDataObj.append('file', blob, file.name || 'media.bin');
    }

    const fetchHeaders = {};
    if (accessToken) fetchHeaders['Authorization'] = `Bearer ${accessToken}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: fetchHeaders,
      body: formDataObj,
    });

    const data = await response.json();
    return { success: response.ok, ...data };
  } catch (e) {
    console.error(`[Social Media Upload] Error:`, e.message);
    return { success: false, error: e.message };
  }
});

/**
 * Disconnect a social platform for a companion.
 */
ipcMain.handle("social:disconnect", async (_event, { platform, companionId }) => {
  const all = store.get(SOCIAL_CREDS_KEY, {});
  delete all[`${platform}:${companionId}`];
  store.set(SOCIAL_CREDS_KEY, all);
  return { success: true };
});

/**
 * Get all connected platforms for a companion.
 */
ipcMain.handle("social:get-connected", async (_event, { companionId }) => {
  const all = store.get(SOCIAL_CREDS_KEY, {});
  const connected = {};
  for (const platform of ['instagram', 'tiktok', 'x']) {
    const creds = all[`${platform}:${companionId}`];
    if (creds?.access_token) {
      connected[platform] = {
        connected: true,
        expiresAt: creds.expires_at,
        isExpired: creds.expires_at && Date.now() >= creds.expires_at,
      };
    }
  }
  return connected;
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

    const contentType = response.headers.get("content-type");
    let data;

    if (contentType && contentType.includes("application/json")) {
      data = await response.json();
    } else {
      data = await response.text();
    }

    if (!response.ok) {
      // Include response body in error for better debugging
      const errorMessage = data?.error || data?.message || `HTTP ${response.status}: ${response.statusText}`;
      console.error(`[Proxy] Error from ${url}:`, { status: response.status, data });
      return {
        success: false,
        error: errorMessage,
        status: response.status,
        data, // Include full response for detailed error handling
      };
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
let alwaysLoadedEnabled = false; // When true, LLM stays in memory (still allows hot-swap)

// DEPRECATED: MiniCPM-V vision model is now handled server-side via diffuser.py
// These constants are kept for backwards compatibility only
const MINICPM_V_MODEL = {
  filename: "minicpm-v-4_5-q4_k_m.gguf",
  mmproj: "mmproj-model-f16.gguf",
};

// Query current loaded model and always-loaded setting
ipcMain.handle("model-get-loaded", () => {
  if (!currentLoadedModel) return null;
  return {
    filename: currentLoadedModel.filename,
    modelname: currentLoadedModel.modelname || resolveModelName(currentLoadedModel.filename),
    parameters: currentLoadedModel.parameters,
    context: currentLoadedModel.context,
    isMultimodal: currentLoadedModel.isMultimodal || false,
  };
});
ipcMain.handle("model-get-always-loaded", () => alwaysLoadedEnabled);
ipcMain.handle("model-set-always-loaded", (_event, enabled) => {
  alwaysLoadedEnabled = !!enabled;
  console.log(`[LLM] Always-loaded: ${alwaysLoadedEnabled}`);
  return alwaysLoadedEnabled;
});

ipcMain.handle("model-check", checkModel);
ipcMain.handle("model-download", downloadModel);
ipcMain.handle("model-delete", deleteModel);
ipcMain.handle("model-load", loadModel);
ipcMain.handle("model-unload", unloadModel);
ipcMain.handle("model-chat", chat);
ipcMain.handle("model-chat-stream", chatStream);
ipcMain.handle("model-chat-vision", chatWithVision);
ipcMain.handle("model-reset-chat", () => {
  if (modelSession) {
    modelSession.resetChatHistory();
    console.log("[LLM] Chat history reset");
    return true;
  }
  return false;
});
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
    resizable: true, // Allow window to be resized freely
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
  // Auto-migrate history paths to current MODEL_DIR on startup
  // This ensures companion images/audio work after MODEL_DIR changes
  // ─────────────────────────────────────────────────────────────────────────────
  try {
    const migrationVersion = store.get("historyMigrationVersion", 0);
    if (migrationVersion >= 1) {
      console.log("[Startup] History path migration already completed, skipping.");
    } else {
    const currentFilesDir = path.join(path.resolve(MODEL_DIR), "files");
    const historyKeys = ["audioInferences", "imageInferences", "videoInferences", "objectInferences"];
    let totalUpdated = 0;

    const fixPath = (pathStr) => {
      if (!pathStr || typeof pathStr !== "string") return { changed: false, path: pathStr };
      const patterns = [/\/Users\/[^/]+\/bonzai-models\/files\//, /\/home\/[^/]+\/bonzai-models\/files\//, /bonzai-models\/files\//];
      for (const pattern of patterns) {
        if (pattern.test(pathStr)) {
          const match = pathStr.match(/files\/(.+)$/);
          if (match) {
            const newPath = path.join(currentFilesDir, match[1]);
            if (newPath !== pathStr) return { changed: true, path: newPath };
          }
        }
      }
      return { changed: false, path: pathStr };
    };

    // Fix inference histories
    for (const key of historyKeys) {
      const history = store.get(key, []);
      if (Array.isArray(history) && history.length > 0) {
        let updated = false;
        const updatedHistory = history.map((inference) => {
          const item = JSON.parse(JSON.stringify(inference));
          if (item?.answer?.data) {
            for (const field of ["audio_path", "video_path", "image_path", "path", "output_path", "object_path"]) {
              if (item.answer.data[field]) {
                const result = fixPath(item.answer.data[field]);
                if (result.changed) { item.answer.data[field] = result.path; updated = true; totalUpdated++; }
              }
            }
          }
          return item;
        });
        if (updated) store.set(key, updatedHistory);
      }
    }

    // Fix roleplay sessions
    const roleplaySessions = store.get("roleplaySessions", {});
    if (roleplaySessions && typeof roleplaySessions === "object") {
      let updated = false;
      for (const sessionKey in roleplaySessions) {
        const session = roleplaySessions[sessionKey];
        if (!session) continue;
        if (session.companion?.image) { const r = fixPath(session.companion.image); if (r.changed) { session.companion.image = r.path; updated = true; totalUpdated++; } }
        if (session.scenario?.image) { const r = fixPath(session.scenario.image); if (r.changed) { session.scenario.image = r.path; updated = true; totalUpdated++; } }
        if (session.backgroundImage) { const r = fixPath(session.backgroundImage); if (r.changed) { session.backgroundImage = r.path; updated = true; totalUpdated++; } }
        if (Array.isArray(session.history)) {
          for (const msg of session.history) {
            for (const field of ["image", "audio", "video", "backgroundImage"]) {
              if (msg[field]) { const r = fixPath(msg[field]); if (r.changed) { msg[field] = r.path; updated = true; totalUpdated++; } }
            }
          }
        }
        if (Array.isArray(session.backgroundHistory)) {
          for (const entry of session.backgroundHistory) {
            if (entry.image) { const r = fixPath(entry.image); if (r.changed) { entry.image = r.path; updated = true; totalUpdated++; } }
          }
        }
      }
      if (updated) store.set("roleplaySessions", roleplaySessions);
    }

    if (totalUpdated > 0) {
      console.log(`[Startup] Migrated ${totalUpdated} history paths to ${currentFilesDir}`);
    }
    store.set("historyMigrationVersion", 1);
    } // end else (migration not yet done)
  } catch (e) {
    console.warn(`[Startup] History path migration failed:`, e.message);
  }

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
  await startPythonSubprocess();

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

// ─────────────────────────────────────────────────────────────────────────────
// Dataset Studio (scraping, curation, augmentation, export)
// ─────────────────────────────────────────────────────────────────────────────

ipcMain.handle("synth-examples-list", async () => {
  try {
    return { ok: true, examples: studioListExamples() };
  } catch (e) {
    return { ok: false, error: e.message, examples: [] };
  }
});

ipcMain.handle("synth-example-save", async (_event, example) => {
  try {
    const saved = studioSaveExample(example);
    return { ok: true, example: saved };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle("synth-example-delete", async (_event, id) => {
  try {
    studioDeleteExample(id);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// Qwen 2.5 Coder 7B config for auto-loading in Dataset Studio describe
// Code-specialized 7B dense model, Q5 quantization for higher fidelity output.
const DATASET_STUDIO_MODEL_CONFIG = {
  filename: "qwen2.5-coder-7b-instruct-q5_k_m.gguf",
  url: "https://huggingface.co/Qwen/Qwen2.5-Coder-7B-Instruct-GGUF/resolve/main/qwen2.5-coder-7b-instruct-q5_k_m.gguf",
  filesizeBytes: 5.48e9,
  parameters: 7000000000,
  context: 131072,
};

ipcMain.handle("synth-describe", async (_event, { mode, tier, html, css, js, text }) => {
  // Game tier definitions (duplicated — main process can't import ES modules from dataset-studio)
  const GAME_TIERS = [
    { id: 1,  name: "Primitives",           desc: "Scene setup, camera, renderer, basic meshes, lighting" },
    { id: 2,  name: "Materials & Shaders",  desc: "PBR materials, custom ShaderMaterial, GLSL, post-processing" },
    { id: 3,  name: "Geometry & Terrain",   desc: "Procedural geometry, heightmaps, infinite terrain, LOD" },
    { id: 4,  name: "Models & Assets",      desc: "GLTF/GLB loading, Blender workflow, animations, textures" },
    { id: 5,  name: "Physics",              desc: "Cannon-es/Rapier integration, collision, rigid bodies, vehicles" },
    { id: 6,  name: "Controls & Input",     desc: "FPS/orbit/pointer-lock, keyboard, gamepad, mobile touch" },
    { id: 7,  name: "Animation & Particles",desc: "Skeletal animation, tweens (GSAP), particle systems, trails" },
    { id: 8,  name: "Game Systems",         desc: "State machines, entity component, inventory, health, scoring" },
    { id: 9,  name: "UI & Audio",           desc: "HUD overlays, menus, spatial audio, CSS3D" },
    { id: 10, name: "Full Games",           desc: "Complete mini-games combining 3+ tiers above" },
  ];

  try {
    // Build content from mode-specific fields
    let content = "";
    let promptText = "";

    const isCodeMode = mode !== "text";

    if (!isCodeMode) {
      content = (text || "").trim();
      if (!content) throw new Error("No text content to describe.");
      promptText = [
        "You are generating a detailed instruction for a LoRA finetuning dataset.",
        "Given the following text content, write a thorough description covering:",
        "- The theme, subject matter, and key topics",
        "- The writing style, tone, and structure",
        "- The purpose and intended audience",
        "- Notable patterns, techniques, or conventions used",
        "",
        "Write a detailed, specific instruction that, paired with this content, would make an excellent training example for a LLAMA LoRA finetune.",
        "Do NOT use markdown formatting (no #, **, `, etc.). Write plain text only.",
        "",
        "CONTENT:",
        content,
      ].join("\n");
    } else {
      // game mode
      const parts = [];
      if (html && html.trim()) parts.push(`HTML:\n${html.trim()}`);
      if (css && css.trim()) parts.push(`CSS:\n${css.trim()}`);
      if (js && js.trim()) parts.push(`JS:\n${js.trim()}`);
      content = parts.join("\n\n");
      if (!content) throw new Error("No code content to describe.");

      // Build tier context for the prompt
      const tierObj = GAME_TIERS.find((t) => t.id === (tier || 1)) || GAME_TIERS[0];
      const tierContext = `This code belongs to Tier ${tierObj.id} (${tierObj.name}): ${tierObj.desc}.`;

      promptText = [
        "You are generating a detailed instruction for a Three.js game development LoRA finetuning dataset.",
        tierContext,
        "Given the following code, write a thorough description covering:",
        "- The purpose and what the code creates or accomplishes",
        "- The visual or interactive output (if applicable)",
        "- Key techniques, libraries, APIs, and patterns used",
        "- The structure and how the HTML, CSS, and JS work together",
        "- Any notable algorithms, animations, or behaviors",
        "",
        "Write a detailed, specific instruction that, paired with this code, would make an excellent training example for a LLAMA LoRA finetune focused on Three.js game development.",
        "Do NOT use markdown formatting (no #, **, `, etc.). Write plain text only.",
        "Do NOT list libraries separately. Focus only on describing the code.",
        "",
        "CODE:",
        content,
      ].join("\n");
    }

    // Auto-load Qwen 2.5 Coder 7B if needed
    const prevModel = currentLoadedModel ? { ...currentLoadedModel } : null;
    const isDescribeModelLoaded = currentLoadedModel?.filename?.toLowerCase().includes("qwen2.5-coder-7b");
    console.log("[synth-describe] Current model:", currentLoadedModel?.filename || "none", "Qwen Coder 7B loaded:", isDescribeModelLoaded);

    if (!isDescribeModelLoaded) {
      // Aggressively free memory before loading the describe model
      console.log("[synth-describe] Clearing memory before model load...");

      // 1. Unload any existing LLM model
      if (loadedModel || modelContext || modelSession) {
        await unloadModel();
      }

      // 2. Tell Flask server to unload all GPU pipelines
      try {
        await fetch(`http://127.0.0.1:${PY_SERVER_PORT}/memory/clear`, { method: "POST" });
        console.log("[synth-describe] Flask pipelines cleared");
      } catch (e) {
        console.warn("[synth-describe] Flask memory clear skipped:", e.message);
      }

      // 3. Force garbage collection and let memory settle
      if (global.gc) global.gc();
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Check if model is downloaded
      const modelFilename = normalizeModelFilename(DATASET_STUDIO_MODEL_CONFIG.filename);
      const modelPath = path.join(MODEL_DIR, modelFilename);
      console.log("[synth-describe] Qwen Coder 7B path:", modelPath, "exists:", fs.existsSync(modelPath));
      if (!fs.existsSync(modelPath)) {
        console.log("[synth-describe] Downloading Qwen 2.5 Coder 7B...");
        await downloadModel(null, DATASET_STUDIO_MODEL_CONFIG.url, DATASET_STUDIO_MODEL_CONFIG.filename);
      }
      // Load Qwen 2.5 Coder 7B with context metadata
      console.log("[synth-describe] Loading Qwen 2.5 Coder 7B...");
      await loadModel(null, DATASET_STUDIO_MODEL_CONFIG);
      console.log("[synth-describe] Qwen 2.5 Coder 7B loaded successfully");
    }

    // Reset chat history so the full context window is available for the code.
    // Without this, accumulated history from prior conversations fills the
    // context and the model never sees the code content.
    modelSession.resetChatHistory();
    console.log("[synth-describe] Prompting with", promptText.length, "chars");

    const result = await modelSession.prompt(promptText, {
      maxTokens: 1024,
      temperature: 0.2,
      repeatPenalty: {
        lastTokens: 256,
        penalty: 1.3,
        frequencyPenalty: 0.1,
      },
    });
    const rawOutput = result.trim();

    // Strip any markdown formatting the LLM may have added
    let description = rawOutput
      .replace(/^#{1,6}\s+/gm, "")          // # headings
      .replace(/\*\*([^*]+)\*\*/g, "$1")     // **bold**
      .replace(/\*([^*]+)\*/g, "$1")         // *italic*
      .replace(/`([^`]+)`/g, "$1")           // `inline code`
      .replace(/^```[\s\S]*?^```/gm, "")     // ```code blocks```
      .trim();
    let libraries = [];
    if (isCodeMode) {
      // Strip any trailing JSON array the LLM may have appended to the description
      const lines = description.split("\n");
      for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i].trim();
        if (line.startsWith("[") && line.endsWith("]")) {
          try {
            const parsed = JSON.parse(line);
            if (Array.isArray(parsed)) {
              // Remove the JSON line from description (we extract libs from code instead)
              description = lines.slice(0, i).join("\n").trim();
              break;
            }
          } catch { /* not valid JSON, keep as-is */ }
        }
        // Stop searching after 5 lines from the end
        if (lines.length - 1 - i >= 5) break;
      }

      // ── Programmatic library extraction from actual code ──
      // This is deterministic and doesn't depend on LLM output format.
      const allCode = [html || "", css || "", js || ""].join("\n");

      // 1. <script src="..."> tags (CDN / local references)
      const scriptSrcRegex = /<script[^>]+src=["']([^"']+)["']/gi;
      let match;
      while ((match = scriptSrcRegex.exec(allCode)) !== null) {
        const src = match[1];
        const filename = src.split("/").pop().split("?")[0];
        if (filename && filename.endsWith(".js")) {
          libraries.push(filename);
        }
      }

      // 2. ES module imports: import ... from 'library'
      const importRegex = /import\s+(?:[\s\S]*?\s+from\s+)?['"]([^'"./][^'"]*)['"]/g;
      while ((match = importRegex.exec(allCode)) !== null) {
        libraries.push(match[1].split("/")[0]); // "@scope/pkg" → "@scope"... handled below
      }

      // 3. CommonJS requires: require('library')
      const requireRegex = /require\s*\(\s*['"]([^'"./][^'"]*)['"]\s*\)/g;
      while ((match = requireRegex.exec(allCode)) !== null) {
        libraries.push(match[1].split("/")[0]);
      }

      // 4. Known globals — detect libraries by their runtime API usage.
      //    Each entry: canonical name → regex patterns that indicate usage.
      const KNOWN_GLOBALS = {
        "three.js":       [/\bTHREE\./],
        "gsap":           [/\bgsap\b/, /\bTweenMax\b/, /\bTimelineMax\b/, /\bTweenLite\b/, /\bTimelineLite\b/],
        "cannon-es":      [/\bCANNON\./],
        "rapier":         [/\bRAPIER\b/],
        "ammo.js":        [/\bAmmo\b\s*\(/],
        "xstate":         [/\bcreateMachine\s*\(/, /\binterpret\s*\(.*createMachine/],
        "simplex-noise":  [/\bSimplexNoise\b/, /\bsimplex[_-]?noise\b/i],
        "dat.gui":        [/\bnew\s+dat\.GUI\b/],
        "lil-gui":        [/\bnew\s+GUI\b.*lil-gui/i, /\blil-gui\b/i],
        "stats.js":       [/\bnew\s+Stats\s*\(/],
        "howler.js":      [/\bnew\s+Howl\s*\(/, /\bHowler\b/],
        "tone.js":        [/\bTone\./],
        "matter.js":      [/\bMatter\./],
        "planck.js":      [/\bplanck\./],
        "p2.js":          [/\bp2\./],
        "pixi.js":        [/\bPIXI\./],
        "babylon.js":     [/\bBABYLON\./],
        "socket.io":      [/\bio\s*\(\s*['"]/, /\bsocket\.io\b/i],
        "tween.js":       [/\bnew\s+TWEEN\.Tween\b/, /\bTWEEN\.update\b/],
        "d3":             [/\bd3\.\w+\s*\(/],
        "chart.js":       [/\bnew\s+Chart\s*\(/],
        "anime.js":       [/\banime\s*\(/],
        "box2d":          [/\bb2\.\w+/, /\bBox2D\b/],
        "oimo.js":        [/\bOIMO\./],
      };
      for (const [libName, patterns] of Object.entries(KNOWN_GLOBALS)) {
        if (patterns.some((re) => re.test(allCode))) {
          libraries.push(libName);
        }
      }

      // ── Normalize and deduplicate ──
      const LIBRARY_ALIASES = {
        "three.min.js": "three.js",       "three.module.js": "three.js",
        "three.module.min.js": "three.js", "three.r*.js": "three.js",
        "cannon.min.js": "cannon-es",     "cannon-es.min.js": "cannon-es",
        "cannon-es.js": "cannon-es",      "cannon.js": "cannon-es",
        "gsap.min.js": "gsap",            "rapier.min.js": "rapier",
        "rapier3d.min.js": "rapier",      "ammo.wasm.js": "ammo.js",
        "stats.min.js": "stats.js",       "dat.gui.min.js": "dat.gui",
        "lil-gui.min.js": "lil-gui",      "tween.min.js": "tween.js",
        "tweenmax.min.js": "gsap",        "howler.min.js": "howler.js",
        "tone.min.js": "tone.js",         "socket.io.min.js": "socket.io",
        "pixi.min.js": "pixi.js",         "babylon.min.js": "babylon.js",
        "p2.min.js": "p2.js",             "planck.min.js": "planck.js",
        "matter.min.js": "matter.js",     "anime.min.js": "anime.js",
        "d3.min.js": "d3",                "chart.min.js": "chart.js",
        "oimo.min.js": "oimo.js",
      };

      libraries = libraries.map((lib) => {
        const lower = lib.toLowerCase().trim();
        return LIBRARY_ALIASES[lower] || lower.replace(/\.min\.js$/, ".js");
      });

      const seen = new Set();
      libraries = libraries.filter((lib) => {
        const key = lib.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      console.log("[synth-describe] Detected libraries:", libraries);
    }

    // Restore previous model if one was loaded before
    if (prevModel && !isDescribeModelLoaded) {
      try {
        console.log("[synth-describe] Restoring previous model:", prevModel.filename);
        await loadModel(null, prevModel);
      } catch (restoreErr) {
        console.warn("[synth-describe] Could not restore previous model:", restoreErr.message);
      }
    }

    return { ok: true, description, libraries };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle("synth-export", async (_event, { name }) => {
  try {
    const result = studioExportDataset(name);
    return result;
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// Kill the Python server before the app exits (prevents orphaned processes on port 65000)
app.on("before-quit", async (e) => {
  if (subpy && subpy.pid) {
    e.preventDefault();
    console.log("[before-quit] Killing Python server before exit...");
    await killPythonSubprocess();
    app.quit();
  }
});

// Quit on all windows closed (non-mac)
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
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
  // For MoE models, activeParameters drives KV-cache sizing (only active params
  // contribute to attention). Total parameters drives weight-memory estimation
  // (all expert weights are loaded).
  const isMoE = !!(currentModel.isMoE || currentModel.activeParameters);
  const activeParams = currentModel.activeParameters || currentModel.parameters || 0;
  const totalParams = currentModel.parameters || 0;

  const ramBytes = sysInfo.ramAvailable || sysInfo.ram || 0;
  const ramGB = ramBytes / 1024 ** 3;

  const vramMB = sysInfo.vram || 0;
  const vramGB = vramMB / 1024;

  const modelMaxCtx = currentModel.context || 4096;

  const isMac = process.platform === "darwin";
  const isUnified = isMac && vramMB === 0; // typical for Apple Silicon

  // 1. Memory budget — how much RAM/VRAM we can safely use
  let memBudgetGB;
  if (isUnified) {
    memBudgetGB = ramGB * 0.7; // 30% headroom for OS + apps
  } else if (vramGB > 0) {
    memBudgetGB = Math.min(ramGB * 0.8, vramGB * 0.8);
  } else {
    memBudgetGB = ramGB * 0.8; // CPU-only
  }

  // 2. Estimate model weight memory
  //    Use actual file size when available (most accurate). Otherwise heuristic:
  //    Dense Q4_K_M ≈ 0.55 bytes/param (totalParams).
  //    MoE models: experts share weights, real file sizes are much smaller
  //    than totalParams * 0.55 would suggest. Use 0.38 bytes/param for MoE
  //    (calibrated: Qwen3.5-35B-A3B Q2=0.37, 122B-A10B Q2=0.38).
  let modelWeightGB;
  if (currentModel.filesizeBytes && currentModel.filesizeBytes > 0) {
    modelWeightGB = currentModel.filesizeBytes / 1e9;
  } else {
    const bytesPerParam = isMoE ? 0.38 : 0.55;
    const weightParams = totalParams || activeParams;
    modelWeightGB = (weightParams * bytesPerParam) / 1e9;
  }

  // 3. Reserve for GPU compute scratch buffers
  //    Metal (unified memory) needs ~2GB for compute graphs and intermediate
  //    tensors; discrete GPUs with separate VRAM need less host-side reserve.
  //    MoE models need extra for expert routing/gating buffers.
  const computeReserveGB = isUnified ? (isMoE ? 2.5 : 2.0) : 1.5;

  // 4. Available memory for KV cache
  const availableForKvGB = Math.max(0, memBudgetGB - modelWeightGB - computeReserveGB);

  // 5. Estimate KV cache bytes per token (fp16 K+V)
  //    Depends on num_layers × num_kv_heads × head_dim — which scales with
  //    active parameter count. MoE attention layers are shared (not per-expert),
  //    so their KV cache is ~50% of an equivalently-sized dense model.
  //    Calibrated against known architectures:
  //      1.5B dense → ~50KB   3.8B dense → ~96KB   8B dense → ~130KB
  //      14B  dense → ~200KB  32B  dense → ~400KB
  const kvScale = isMoE ? 0.5 : 1.0;
  let kvBytesPerToken;
  if (activeParams <= 2_000_000_000)       kvBytesPerToken = 80_000;
  else if (activeParams <= 5_000_000_000)  kvBytesPerToken = 120_000;
  else if (activeParams <= 10_000_000_000) kvBytesPerToken = 200_000;
  else if (activeParams <= 20_000_000_000) kvBytesPerToken = 320_000;
  else                                     kvBytesPerToken = 500_000;
  kvBytesPerToken = Math.round(kvBytesPerToken * kvScale);

  // 6. Compute max context, snap down to nearest standard size
  //    Apply 15% safety margin — createContext() can succeed but inference
  //    SIGSEGVs when Metal runtime allocations exceed what's actually free.
  const STANDARD_SIZES = [131072, 65536, 32768, 16384, 8192, 4096, 2048, 1024, 512];
  let baseCtx = 512;
  if (availableForKvGB > 0) {
    const safeKvGB = availableForKvGB * 0.85;
    const maxTokens = Math.floor((safeKvGB * 1e9) / kvBytesPerToken);
    for (const size of STANDARD_SIZES) {
      if (maxTokens >= size) {
        baseCtx = size;
        break;
      }
    }
  }

  const chosen = Math.min(modelMaxCtx, baseCtx);

  console.log(
    `[CTX] RAM=${ramGB.toFixed(1)}GB, memBudget=${memBudgetGB.toFixed(1)}GB, VRAM=${vramGB.toFixed(1)}GB, ` +
    `params=${activeParams}${isMoE ? ` (MoE, total=${totalParams})` : ""}, ` +
    `weightEst=${modelWeightGB.toFixed(1)}GB, kvEst=${(kvBytesPerToken / 1024).toFixed(0)}KB/tok, ` +
    `availForKV=${availableForKvGB.toFixed(1)}GB, baseCtx=${baseCtx}, modelMaxCtx=${modelMaxCtx}, ` +
    `chosen=${chosen}, unified=${isUnified}`
  );

  return chosen;
}

// Model specs lookup table for enriching incomplete metadata.
// Keyed by filename substring — matched against the model filename to fill in
// missing parameters/context values that are required for accurate context sizing.
const MODEL_SPECS = {
  "meta-llama-3.1-8b-instruct":    { parameters: 8e9, context: 131072 },
  "llama-3-3-8b":                   { parameters: 8e9, context: 131072 },
  "llama-2-7b-chat":               { parameters: 7e9, context: 4096 },
  "mythomax-l2-13b":               { parameters: 13e9, context: 4096 },
  "mistral-7b-instruct":           { parameters: 7e9, context: 32768 },
  "codestral-22b":                  { parameters: 22e9, context: 32768 },
  "deepseek-r1-distill-qwen-1.5b": { parameters: 1.5e9, context: 131072 },
  "deepseek-r1-distill-qwen-7b":   { parameters: 7e9, context: 131072 },
  "deepseek-r1-distill-qwen-32b":  { parameters: 32e9, context: 131072 },
  "gemma-3-1b-it":                  { parameters: 1e9, context: 32768 },
  "gpt-oss-20b":                    { parameters: 20e9, context: 131072 },
  "nousresearch_hermes-4-14b":      { parameters: 14e9, context: 131072 },
  "phi-3-mini-4k-instruct":         { parameters: 3.8e9, context: 4096 },
  "phi-4-mini-instruct":            { parameters: 3.8e9, context: 128000 },
  "qwen2.5-coder-7b-instruct":      { parameters: 7e9, context: 131072 },
  "yi-coder-9b-chat":               { parameters: 9e9, context: 131072 },
  "glm-4.7-flash-q2_k_xl":  { parameters: 30e9, activeParameters: 3e9, isMoE: true, context: 200000 },
  "glm-4.7-flash-ud-q4_k_xl": { parameters: 30e9, activeParameters: 3e9, isMoE: true, context: 200000 },
  "glm-4.7-flash-ud-q8_k_xl": { parameters: 30e9, activeParameters: 3e9, isMoE: true, context: 200000 },
  "qwen3-coder-next":        { parameters: 80e9, activeParameters: 3e9, isMoE: true, context: 131072 },
  "nanbeige4.1-3b":                 { parameters: 3e9, context: 32768 },
  "qwen3.5-9b":                     { parameters: 9e9, context: 262144 },
  "qwen3.5-27b":                    { parameters: 27e9, activeParameters: 8e9, context: 262144 },
  "qwen3.5-35b-a3b":                { parameters: 35e9, activeParameters: 3e9, isMoE: true, context: 262144 },
  "qwen3.5-122b-a10b":              { parameters: 122e9, activeParameters: 10e9, isMoE: true, context: 262144 },
  "qwen3.5-397b-a17b":              { parameters: 397e9, activeParameters: 17e9, isMoE: true, context: 262144 },
  "kimi-k2.5":                      { parameters: 1000e9, activeParameters: 32e9, isMoE: true, context: 256000 },
  "minimax-m2.5":                   { parameters: 229e9, activeParameters: 10e9, isMoE: true, context: 205000 },
  "devstral-small-2-24b":           { parameters: 24e9, context: 256000 },
  "ministral-3-3b":                 { parameters: 3e9, context: 256000 },
  "ministral-3-8b":                 { parameters: 8e9, context: 256000 },
};

// Display name lookup — filename substring → human-readable model name
const MODEL_NAMES = {
  "codestral-22b":                  "Codestral 22B",
  "deepseek-r1-distill-qwen-1.5b": "DeepSeek R1 1.5B",
  "deepseek-r1-distill-qwen-7b":   "DeepSeek R1 7B",
  "deepseek-r1-distill-qwen-32b":  "DeepSeek R1 32B",
  "gemma-3-1b-it":                  "Gemma 3 1B",
  "gemma-3-12b-it":                 "Gemma 3 12B",
  "gpt-oss-20b":                    "GPT-OSS 20B",
  "nousresearch_hermes-4-14b":      "Hermes 4 14B",
  "llama-2-7b-chat":               "LLaMA 2 7B",
  "meta-llama-3.1-8b-instruct":    "LLaMA 3.1 8B",
  "mistral-7b-instruct":           "Mistral 7B",
  "mythomax-l2-13b":               "MythoMax L2 13B",
  "phi-3-mini-4k-instruct":        "Phi-3 Mini 3.8B",
  "phi-4-mini-instruct":           "Phi-4 Mini 3.8B",
  "yi-coder-9b-chat":              "Yi-Coder 9B",
  "yi1.5-coder-9b":                "Yi-Coder 1.5 9B",
  "glm-4.7-flash-ud-q2":           "GLM 4.7 Flash Q2",
  "glm-4.7-flash-ud-q4":           "GLM 4.7 Flash Q4",
  "glm-4.7-flash-ud-q8":           "GLM 4.7 Flash Q8",
  "qwen3-coder-next":              "Qwen 3 Coder Next 80B",
  "qwen3.5-27b-ud-q2":             "Qwen 3.5 27B",
  "qwen3.5-27b-ud-q4":             "Qwen 3.5 27B Q4",
  "qwen3.5-27b-ud-q8":             "Qwen 3.5 27B Q8",
  "qwen3.5-9b":                    "Qwen 3.5 9B Q4",
  "qwen3.5-0.8b":                   "Qwen 3.5 0.8B",
  "qwen3.5-4b":                    "Qwen 3.5 4B",
  "qwen3.5-35b-a3b-ud-iq3":        "Qwen 3.5 35B A3B IQ3",
  "qwen3.5-35b-a3b-ud-q2":         "Qwen 3.5 35B A3B",
  "qwen3.5-35b-a3b-ud-q4":         "Qwen 3.5 35B A3B Q4",
  "qwen3.5-35b-a3b-ud-q8":         "Qwen 3.5 35B A3B Q8",
  "qwen3.5-122b-a10b-ud-q2":       "Qwen 3.5 122B A10B",
  "qwen3.5-122b-a10b-ud-q4":       "Qwen 3.5 122B A10B Q4",
  "qwen3.5-397b-a17b-ud-q2":       "Qwen 3.5 397B A17B",
  "qwen3.5-397b-a17b-ud-q4":       "Qwen 3.5 397B A17B Q4",
  "kimi-k2.5":                     "Kimi K2.5 Q4",
  "minimax-m2.5":                  "MiniMax M2.5 Q4",
  "devstral-small-2-24b":          "Devstral 24B",
  "ministral-3-3b":                "Ministral 3B",
  "ministral-3-8b":                "Ministral 8B",
  "nanbeige4.1-3b":                "Nanbeige 4.1 3B",
  "qwen2.5-coder-7b":              "Qwen Coder 7B",
};

function resolveModelName(filename) {
  if (!filename) return "Unknown";
  const lower = filename.toLowerCase();
  for (const [key, name] of Object.entries(MODEL_NAMES)) {
    if (lower.includes(key)) return name;
  }
  // Fallback: strip extension and quantization suffix
  return filename.replace(/\.gguf$/i, "").replace(/-q\d.*$/i, "");
}

async function loadModel(_event, currentModel) {
  if (!llama) {
    throw new Error("LLM engine not initialized. Please restart the application.");
  }

  // Normalize string model keys to object form (e.g. from openclaw passing "llm_llama_3_1_8b")
  if (typeof currentModel === "string") {
    currentModel = { filename: currentModel };
  }

  // Skip if the same model is already loaded (prevents HMR reload loops)
  // Pass forceReload: true to bypass this guard (e.g. to recalculate context with current RAM)
  const requestedFilename = (currentModel.filename || "").toLowerCase();
  if (currentLoadedModel && modelSession && requestedFilename === (currentLoadedModel.filename || "").toLowerCase() && !currentModel.forceReload) {
    console.log(`[LLM] Model already loaded: ${requestedFilename}, skipping reload`);
    return true;
  }

  // Enrich model metadata from MODEL_SPECS if parameters/context are missing or invalid.
  // This catches call sites that pass incomplete metadata (e.g. parameters: {}, or no parameters at all).
  if (!currentModel.parameters || typeof currentModel.parameters !== "number") {
    const filename = (currentModel.filename || "").toLowerCase();
    for (const [key, specs] of Object.entries(MODEL_SPECS)) {
      if (filename.includes(key)) {
        console.log(`[LLM] Enriched model specs from MODEL_SPECS for "${key}"`);
        if (!currentModel.parameters || typeof currentModel.parameters !== "number") {
          currentModel.parameters = specs.parameters;
        }
        if (!currentModel.context || typeof currentModel.context !== "number") {
          currentModel.context = specs.context;
        }
        if (specs.activeParameters) currentModel.activeParameters = specs.activeParameters;
        if (specs.isMoE) currentModel.isMoE = specs.isMoE;
        break;
      }
    }
  }

  // Cleanup any existing model before loading a new one
  // This is critical to free GPU memory, especially for large models like GLM
  if (loadedModel || modelContext || modelSession) {
    console.log("[LLM] Cleaning up existing model before loading new one...");
    await unloadModel(null, { force: true });
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
  // Workaround: node-llama-cpp 3.16.x reports unifiedSize=0 on Apple Silicon Metal,
  // causing its VRAM budget to reject models that actually fit in unified memory.
  // Our own computeMaxContextForModel heuristic handles unified memory correctly.
  if (llamaUnifiedMemoryBroken) {
    loadOptions.ignoreMemorySafetyChecks = true;
  }

  const model = await llama.loadModel(loadOptions);
  loadedModel = model; // Store reference for proper disposal

  const sysInfo = await systemInformation();
  const heuristicCtx = computeMaxContextForModel(currentModel, sysInfo);
  const modelMaxCtx = currentModel.context || 4096;
  console.log("Model context: heuristic=%d, modelMax=%d", heuristicCtx, modelMaxCtx);

  // Standard context sizes to try, from largest to smallest.
  // Start from the heuristic (memory-safe estimate), NOT the model's native max.
  // createContext() can succeed at sizes that crash during inference because it
  // only validates KV-cache allocation, not the compute buffers Metal needs.
  const STANDARD_CONTEXT_SIZES = [
    262144, 200000, 131072, 100000, 65536, 32768, 16384, 8192, 4096, 2048, 1024, 512,
  ];
  const contextSizesToTry = [heuristicCtx];
  for (const size of STANDARD_CONTEXT_SIZES) {
    if (size < heuristicCtx && !contextSizesToTry.includes(size)) {
      contextSizesToTry.push(size);
    }
  }

  // When unified memory reporting is broken, our own heuristic is more reliable
  // than node-llama-cpp's internal check, so bypass its safety checks.
  const contextOpts = llamaUnifiedMemoryBroken ? { ignoreMemorySafetyChecks: true } : {};
  // Flash attention improves throughput on standard transformer attention.
  // Some hybrid architectures (e.g. Qwen 3.5 DeltaNet) may not benefit or may
  // perform worse — caller can pass flashAttention: false to opt out.
  if (currentModel.flashAttention !== false) {
    contextOpts.flashAttention = true;
  }
  contextOpts.batchSize = 2048;
  console.log(`[LLM] Context options: flashAttention=${!!contextOpts.flashAttention}, batchSize=2048`);

  let lastError = null;
  for (const contextSize of contextSizesToTry) {
    try {
      console.log(`Trying context size: ${contextSize} (flashAttention: true, batchSize: 2048)`);
      modelContext = await model.createContext({ contextSize, ...contextOpts });
      console.log(`Successfully created context with size: ${contextSize} (flashAttention: ${!!contextOpts.flashAttention}, batchSize: ${contextOpts.batchSize || 'default'})`);
      break;
    } catch (err) {
      console.log(`Context size ${contextSize} failed: ${err.message}`);
      lastError = err;
      // Continue to try smaller size
    }
  }

  // Fallback: retry without flash attention if all attempts failed
  if (!modelContext && contextOpts.flashAttention) {
    console.log("[LLM] Retrying without flash attention...");
    delete contextOpts.flashAttention;
    for (const contextSize of contextSizesToTry) {
      try {
        console.log(`Trying context size: ${contextSize} (no flash attention)`);
        modelContext = await model.createContext({ contextSize, ...contextOpts });
        console.log(`Successfully created context with size: ${contextSize} (no flash attention)`);
        break;
      } catch (err) {
        console.log(`Context size ${contextSize} failed: ${err.message}`);
        lastError = err;
      }
    }
  }

  if (!modelContext) {
    throw lastError || new Error("Failed to create model context");
  }

  // Detect model type and use appropriate chat wrapper
  const lowerFilename = normalizedFilename.toLowerCase();
  const isMythoMax = lowerFilename.includes('mythomax');
  const isAlpacaModel = isMythoMax || lowerFilename.includes('alpaca');
  let sessionOptions = {
    contextSequence: modelContext.getSequence(),
  };

  if (isAlpacaModel) {
    console.log("[LLM] Using Alpaca chat template for model:", normalizedFilename);
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

  // Notify renderer of model change
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("model-changed", {
      filename: currentModel.filename,
      modelname: currentModel.modelname || resolveModelName(currentModel.filename),
      parameters: currentModel.parameters,
      context: currentModel.context,
      isMultimodal: !!mmprojPath,
    });
  }

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

async function chat(_event, input) {
  if (!modelSession) {
    throw new Error("Model not loaded");
  }

  // Support both legacy string input and new object format
  let userMessage, maxTokens, temperature, thoughtTokens;
  if (typeof input === 'string') {
    userMessage = input;
    maxTokens = 2048; // Default
    temperature = undefined;
    thoughtTokens = undefined;
  } else {
    userMessage = input.message;
    maxTokens = input.maxTokens || 2048;
    temperature = input.temperature;
    thoughtTokens = input.thoughtTokens;
  }

  const returnMetadata = typeof input === 'object' && input.returnMetadata;

  let tokenCount = 0;
  let firstTokenTime = null;
  const promptOpts = { maxTokens, seed: Math.floor(Math.random() * 2147483647) };
  if (temperature !== undefined) promptOpts.temperature = temperature;
  // Budget-level thinking control: cap thinking tokens (0 = no thinking)
  if (thoughtTokens !== undefined) {
    promptOpts.budgets = { thoughtTokens };
  }
  // Count output tokens and measure from first token (excludes prefill)
  if (returnMetadata) {
    promptOpts.onToken = (tokens) => {
      if (!firstTokenTime) firstTokenTime = Date.now();
      tokenCount += Array.isArray(tokens) ? tokens.length : 1;
    };
  }

  const startTime = Date.now();
  const assistantMessage = await modelSession.prompt(userMessage, promptOpts);
  // Generation time = first token → last token (excludes prompt prefill)
  const generationMs = firstTokenTime ? Date.now() - firstTokenTime : Date.now() - startTime;
  const prefillMs = firstTokenTime ? firstTokenTime - startTime : 0;

  if (returnMetadata) {
    return { text: assistantMessage, tokenCount, elapsedMs: generationMs, prefillMs };
  }
  return assistantMessage;
}

async function chatStream(event, input) {
  if (!modelSession) {
    throw new Error("Model not loaded");
  }

  let userMessage, maxTokens, temperature, thoughtTokens;
  if (typeof input === 'string') {
    userMessage = input;
    maxTokens = 2048;
    temperature = undefined;
    thoughtTokens = undefined;
  } else {
    userMessage = input.message;
    maxTokens = input.maxTokens || 2048;
    temperature = input.temperature;
    thoughtTokens = input.thoughtTokens;
  }

  const promptOpts = {
    maxTokens,
    seed: Math.floor(Math.random() * 2147483647),
    onTextChunk(chunk) {
      // Send each token/chunk to the renderer
      const win = BrowserWindow.fromWebContents(event.sender);
      if (win && !win.isDestroyed()) {
        event.sender.send("chat-token", chunk);
      }
    },
  };
  if (temperature !== undefined) promptOpts.temperature = temperature;
  if (thoughtTokens !== undefined) {
    promptOpts.budgets = { thoughtTokens };
  }

  const assistantMessage = await modelSession.prompt(userMessage, promptOpts);
  return assistantMessage;
}

async function unloadModel(_event, { force } = {}) {
  // "Always loaded" guard: skip unload unless forced (hot-swap) or user-initiated
  if (!force && alwaysLoadedEnabled && loadedModel) {
    console.log("[LLM] Skipping unload — always-loaded is enabled. Use force=true to hot-swap.");
    return false;
  }
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

  // Notify renderer of model unload
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("model-changed", null);
  }

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

    if (pendingWebhookRequests.size > 50) {
      reject(new Error("Webhook queue full (>50 pending requests)"));
      return;
    }

    const requestId = ++webhookRequestId;
    // 5 minute timeout for generation
    const timeout = setTimeout(() => {
      pendingWebhookRequests.delete(requestId);
      reject(new Error("Webhook request timed out after 5 minutes"));
    }, 5 * 60 * 1000);

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
      let bodyTooLarge = false;
      req.on("data", (chunk) => {
        body += chunk;
        if (body.length > 10 * 1024 * 1024) { bodyTooLarge = true; req.destroy(); }
      });
      req.on("end", async () => {
        if (bodyTooLarge) { res.writeHead(413); res.end("Request body too large"); return; }
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
    // Skills REST API (for OpenClaw skill discovery and execution)
    // ═══════════════════════════════════════════════════════════════════════

    if (req.method === "GET" && url.pathname === "/api/skills") {
      try {
        const category = url.searchParams.get("category");
        const result = await forwardToRenderer({ type: "get-skills", category });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result || []));
      } catch (error) {
        res.writeHead(503, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Renderer not available", skills: [] }));
      }
      return;
    }

    if (req.method === "GET" && url.pathname.startsWith("/api/skills/")) {
      const id = url.pathname.split("/")[3];
      if (id && id !== "execute") {
        try {
          const result = await forwardToRenderer({ type: "get-skill", id });
          if (result) {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify(result));
          } else {
            res.writeHead(404, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Skill not found" }));
          }
        } catch (error) {
          res.writeHead(503, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Renderer not available" }));
        }
        return;
      }
    }

    if (req.method === "POST" && url.pathname.match(/^\/api\/skills\/[^/]+\/execute$/)) {
      const skillId = url.pathname.split("/")[3];
      let body = "";
      let bodyTooLarge = false;
      req.on("data", (chunk) => {
        body += chunk;
        if (body.length > 10 * 1024 * 1024) { bodyTooLarge = true; req.destroy(); }
      });
      req.on("end", async () => {
        if (bodyTooLarge) { res.writeHead(413); res.end("Request body too large"); return; }
        try {
          const inputs = JSON.parse(body || "{}");
          const result = await forwardToRenderer({
            type: "execute-skill",
            skillId,
            inputs,
          });
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(result));
        } catch (error) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: error.message }));
        }
      });
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
      // Auth removed — all LLM generation is free
      if (false) {
      }

      console.log(`[OpenAI API] Incoming request headers:`, JSON.stringify(req.headers));
      let body = "";
      let bodyTooLarge = false;
      req.on("data", (chunk) => {
        body += chunk;
        if (body.length > 10 * 1024 * 1024) { bodyTooLarge = true; req.destroy(); }
      });
      req.on("end", async () => {
        if (bodyTooLarge) { res.writeHead(413); res.end("Request body too large"); return; }
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
      let bodyTooLarge = false;
      req.on("data", (chunk) => {
        body += chunk;
        if (body.length > 10 * 1024 * 1024) { bodyTooLarge = true; req.destroy(); }
      });
      req.on("end", async () => {
        if (bodyTooLarge) { res.writeHead(413); res.end("Request body too large"); return; }
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
      let bodyTooLarge = false;
      req.on("data", (chunk) => {
        body += chunk;
        if (body.length > 10 * 1024 * 1024) { bodyTooLarge = true; req.destroy(); }
      });
      req.on("end", async () => {
        if (bodyTooLarge) { res.writeHead(413); res.end("Request body too large"); return; }
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
          let bodyTooLarge = false;
          req.on("data", (chunk) => {
            body += chunk;
            if (body.length > 10 * 1024 * 1024) { bodyTooLarge = true; req.destroy(); }
          });
          req.on("end", async () => {
            if (bodyTooLarge) { res.writeHead(413); res.end("Request body too large"); return; }
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

  // Disable server timeouts for long-running generation requests
  // Default Node.js timeout is 2 minutes which is not enough for video/music generation
  openclawServer.timeout = 0; // No timeout
  openclawServer.keepAliveTimeout = 0; // No keep-alive timeout
  openclawServer.headersTimeout = 0; // No headers timeout

  openclawServer.listen(OPENCLAW_API_PORT, () => {
    console.log(`[OpenClaw API] Server running on http://localhost:${OPENCLAW_API_PORT}`);
    console.log(`[OpenClaw API] Timeouts disabled for long-running generation requests`);
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
