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
  clipboard,
  safeStorage,
} from "electron";
import Store from "electron-store";
import os from "os";
import fs from "fs";
import si from "systeminformation";
import psTree from "ps-tree";
import * as llamaServer from "./services/llamaServer.manager.js";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { download, CancelError } from "electron-dl";
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
  listExamples as studioListExamples,
  saveExample as studioSaveExample,
  deleteExample as studioDeleteExample,
  exportDataset as studioExportDataset,
} from "./scripts/dataset-studio.js";
import { RobinhoodMcpManager } from "./main/robinhood-mcp.js";
import {
  createCredentialRegistry,
  childEnvSecrets,
} from "./main/credentialRegistry.js";

// ─────────────────────────────────────────────────────────────────────────────
// Globals / paths
// ─────────────────────────────────────────────────────────────────────────────
// LLM runtime is llama-server subprocess (see services/llamaServer.manager.js).
// Per-conversation chat history is held here since the subprocess is stateless
// from call to call. Callers send single-turn inputs; we maintain history.
let chatHistory = []; // { role: "system" | "user" | "assistant", content: string }[]

// React to subprocess exits. We only clear renderer state on UNEXPECTED
// exits (crashes, OOM). Intentional stops — e.g. `unloadModel()` before a
// model switch, or the privacy-pipeline's stop+start restart cycle — keep
// currentLoadedModel intact so `ensureLocalLLMReady()` can restore the
// previous model if a follow-up load fails.
llamaServer.onExit(({ intentional }) => {
  if (intentional) return;
  currentLoadedModel = null;
  chatHistory = [];
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("model-changed", null);
  }
});

ipcMain.handle("clipboard-copy-text", (_event, text) => {
  clipboard.writeText(String(text ?? ""));
  return true;
});

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
      // Wait for Windows to release the socket after taskkill
      await new Promise((resolve) => setTimeout(resolve, 1000));
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
    // Ensure temp dir is set (PyInstaller extracts here)
    TMPDIR: tmpDir,
    ...(process.platform === "win32" && { TEMP: tmpDir, TMP: tmpDir }),
    // Add the binary's directory to PATH (helps find co-located libs)
    PATH: `${launch.cwd}${path.delimiter}${process.env.PATH || ""}`,
    // Ensure shell is available (Windows has no SHELL env)
    ...(process.platform !== "win32" && { SHELL: process.env.SHELL || "/bin/bash" }),
    // Locale settings (prevents some encoding issues)
    LANG: process.env.LANG || "en_US.UTF-8",
    LC_ALL: process.env.LC_ALL || "en_US.UTF-8",
    // Pass model directory to Flask server
    BONZAI_MODEL_DIR: MODEL_DIR,
    // Pass JWT secret so tokens survive server restarts
    BONZAI_JWT_SECRET: JWT_SECRET,
    // Privacy-pipeline UDS path. The bridge listener may not be up yet
    // (it starts on p2p-start, often after the diffuser is already
    // running) — the diffuser's pipeline_transport.default_socket_path()
    // computes the same path from os.getppid() if the env var is absent,
    // so this is a hint, not a hard dependency. Passing it explicitly
    // also covers the case where the user runs two BonzAI instances and
    // the parent-pid heuristic would collide.
    BONZAI_SHARD_SOCKET: process.env.BONZAI_SHARD_SOCKET
      || path.join(os.tmpdir(), `bonzai-shard-${process.pid}.sock`),
    // Per-launch registry secrets for the local Flask service: a scoped
    // session credential and a non-default signing secret. Delivered via
    // environment ONLY — never argv, URLs, logs, or storage. The signing
    // secret overrides diffuser.py's hardcoded "bonzai-secret-key" default
    // via its existing `SECRET_KEY` env read (no Python change here).
    ...childEnvSecrets(credentialRegistry),
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
  // bonzai-blob:// resolves <id>.<ext> to the on-disk content-addressed
  // blob path. Lets <img :src> / <audio :src> / <video :src> reference
  // blob-stored media synchronously without IPC round-trips. Critical
  // for the migrated roleplay sessions which now hold blob refs in
  // place of inline base64 payloads.
  { scheme: "bonzai-blob", privileges: { bypassCSP: true, stream: true, supportFetchAPI: true, corsEnabled: true, secure: true } },
]);

// Register bonzai:// protocol for OAuth callbacks
if (process.defaultApp) {
  app.setAsDefaultProtocolClient("bonzai", process.execPath, [path.resolve(process.argv[1])]);
} else {
  app.setAsDefaultProtocolClient("bonzai");
}

// Handle deep links (macOS: open-url, Windows/Linux: second-instance)
app.on("open-url", (_event, url) => {
  if (url.startsWith("bonzai://auth/callback")) {
    // Forward OAuth callback to renderer for Privy to complete
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("privy-oauth-callback", url);
      mainWindow.focus();
    }
  }
});

app.on("second-instance", (_event, argv) => {
  const url = argv.find(a => a.startsWith("bonzai://"));
  if (url && url.startsWith("bonzai://auth/callback")) {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("privy-oauth-callback", url);
      mainWindow.focus();
    }
  }
});

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

  /**
   * bonzai-blob://<sha256>.<ext>
   *   → resolves to <userData>/blobs/<sha256[0:2]>/<sha256>.<ext>
   *
   * Strict input validation: id must be a 64-char lowercase hex sha256
   * (otherwise reject — keeps anyone who guesses the URL space from
   * directing the protocol at arbitrary file paths). The ext is
   * checked against a whitelist of media types the renderer reads.
   */
  protocol.handle("bonzai-blob", (req) => {
    try {
      const u = new URL(req.url);
      // Some renderers normalize host into the URL.host slot, others
      // put it in pathname. Cover both shapes: bonzai-blob://abc.png OR
      // bonzai-blob:///abc.png
      const target = u.host
        ? `${u.host}${u.pathname}`
        : u.pathname.replace(/^\/+/, "");
      const m = target.match(/^([a-f0-9]{64})\.([a-z0-9]{1,8})$/i);
      if (!m) return new Response("Bad request", { status: 400 });
      const id = m[1].toLowerCase();
      const ext = m[2].toLowerCase();
      const allowed = ["png", "jpg", "jpeg", "webp", "gif",
                       "mp3", "wav", "ogg", "m4a", "flac",
                       "mp4", "webm", "mov", "m4v",
                       "gltf", "glb"];
      if (!allowed.includes(ext)) return new Response("Forbidden", { status: 403 });
      const userData = app.getPath("userData");
      const filePath = path.join(userData, "blobs", id.slice(0, 2), `${id}.${ext}`);
      if (!fs.existsSync(filePath)) return new Response("Not found", { status: 404 });
      return net.fetch(pathToFileURL(filePath).toString());
    } catch (err) {
      console.warn("[bonzai-blob] handler error:", err?.message);
      return new Response("Internal error", { status: 500 });
    }
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
const robinhoodMcp = new RobinhoodMcpManager({
  store,
  safeStorage,
  shell,
  onState: (state) => mainWindow?.webContents.send("robinhood-mcp:state", state),
});

ipcMain.handle("robinhood-mcp:connect", () => robinhoodMcp.connect());
ipcMain.handle("robinhood-mcp:status", () => robinhoodMcp.publicState());
ipcMain.handle("robinhood-mcp:call-tool", (_event, request) => robinhoodMcp.callTool(request));
ipcMain.handle("robinhood-mcp:disconnect", () => robinhoodMcp.disconnect());

const connectorSecretKey = (companyId, connectorId) => `company-connector:${companyId}:${connectorId}`;

const CONNECTOR_HOSTS = Object.freeze({
  stripe: ["api.stripe.com"],
  hubspot: ["api.hubapi.com"],
  quickbooks: ["quickbooks.api.intuit.com", "sandbox-quickbooks.api.intuit.com"],
  sage_accounting: ["api.accounting.sage.com"],
  google_calendar: ["www.googleapis.com"],
  sendgrid: ["api.sendgrid.com"],
  notion: ["api.notion.com"],
  slack: ["slack.com"],
  twilio: ["api.twilio.com"],
});

function shopifyHost(accountIdentifier) {
  const raw = String(accountIdentifier || "").trim().toLowerCase();
  const host = raw.replace(/^https?:\/\//, "").split("/")[0];
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(host)) {
    throw new Error("A valid store.myshopify.com domain is required");
  }
  return host;
}

function connectorHostAllowed(kind, hostname, accountIdentifier) {
  if (kind === "shopify") return hostname === shopifyHost(accountIdentifier);
  return (CONNECTOR_HOSTS[kind] || []).includes(hostname);
}

function readConnectorCredential(companyId, connectorId) {
  const stored = store.get(connectorSecretKey(companyId, connectorId), null);
  if (!stored?.encrypted) throw new Error("Connector credential is unavailable or locked");
  const bytes = Buffer.from(stored.encrypted, "base64");
  const raw = stored.protected ? safeStorage.decryptString(bytes) : bytes.toString("utf8");
  let credential;
  try { credential = JSON.parse(raw); } catch { credential = { accessToken: raw, apiKey: raw, token: raw }; }
  return { stored, credential };
}

async function performConnectorRequest(request) {
  const { companyId, connectorId, connectorKind, accountIdentifier: requestAccount, url, method = "GET", headers = {}, body, idempotencyKey } = request || {};
  const { stored, credential } = readConnectorCredential(companyId, connectorId);
  const kind = stored.kind || connectorKind;
  const accountIdentifier = stored.accountIdentifier || requestAccount;
  if (!kind) throw new Error("Connector kind is unavailable; reconnect this integration");
  const target = new URL(url);
  if (target.protocol !== "https:" || !connectorHostAllowed(kind, target.hostname, accountIdentifier)) {
    throw new Error(`Connector host is not allowed for ${kind}: ${target.hostname}`);
  }

  const token = credential.accessToken || credential.apiKey || credential.token;
  if (!token) throw new Error("Connector credential does not contain an access token or API key");
  const safeHeaders = { ...headers };
  for (const name of Object.keys(safeHeaders)) {
    if (["authorization", "host", "x-shopify-access-token"].includes(name.toLowerCase())) delete safeHeaders[name];
  }
  const authHeaders = kind === "shopify"
    ? { "X-Shopify-Access-Token": token }
    : kind === "twilio"
      ? { Authorization: `Basic ${Buffer.from(`${accountIdentifier}:${token}`).toString("base64")}` }
      : kind === "stripe"
        ? { Authorization: `Basic ${Buffer.from(`${token}:`).toString("base64")}` }
        : { Authorization: `Bearer ${token}` };

  const response = await fetch(target, {
    method,
    headers: {
      Accept: "application/json",
      ...safeHeaders,
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
      ...authHeaders,
    },
    body: body == null ? undefined : body,
  });
  const responseText = await response.text();
  let data;
  try { data = responseText ? JSON.parse(responseText) : {}; } catch { data = { text: responseText }; }
  if (!response.ok) {
    const error = new Error(data?.error?.message || data?.Fault?.Error?.[0]?.Message || data?.message || `Connector request failed (${response.status})`);
    error.status = response.status;
    throw error;
  }
  return { ok: true, status: response.status, data };
}

function connectorValidationRequest(companyId, connectorId, stored) {
  const base = { companyId, connectorId, method: "GET" };
  switch (stored.kind) {
    case "stripe": return { ...base, url: "https://api.stripe.com/v1/account" };
    case "hubspot": return { ...base, url: "https://api.hubapi.com/crm/v3/objects/contacts?limit=1" };
    case "quickbooks": {
      if (!stored.accountIdentifier) throw new Error("QuickBooks Realm ID is required");
      return { ...base, url: `https://quickbooks.api.intuit.com/v3/company/${encodeURIComponent(stored.accountIdentifier)}/companyinfo/${encodeURIComponent(stored.accountIdentifier)}?minorversion=75` };
    }
    case "sage_accounting": return { ...base, url: "https://api.accounting.sage.com/v3.1/businesses" };
    case "google_calendar": return { ...base, url: "https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=1" };
    case "sendgrid": return { ...base, url: "https://api.sendgrid.com/v3/scopes" };
    case "shopify": return { ...base, url: `https://${shopifyHost(stored.accountIdentifier)}/admin/api/2026-07/shop.json` };
    case "notion": return { ...base, url: "https://api.notion.com/v1/users/me", headers: { "Notion-Version": "2022-06-28" } };
    case "slack": return { ...base, url: "https://slack.com/api/auth.test", method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" } };
    case "twilio": {
      if (!stored.accountIdentifier) throw new Error("Twilio Account SID is required");
      return { ...base, url: `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(stored.accountIdentifier)}.json` };
    }
    default: throw new Error(`Unsupported connector: ${stored.kind}`);
  }
}

ipcMain.handle("company-connector:set-secret", (_event, { companyId, connectorId, secret, kind, accountIdentifier }) => {
  if (!companyId || !connectorId || !secret) throw new Error("Connector identity and secret are required");
  if (!kind) throw new Error("Connector kind is required");
  if (!safeStorage.isEncryptionAvailable()) throw new Error("Secure credential storage is unavailable on this device");
  const plain = Buffer.from(String(secret), "utf8");
  const encrypted = safeStorage.encryptString(plain.toString("utf8")).toString("base64");
  store.set(connectorSecretKey(companyId, connectorId), {
    encrypted,
    protected: true,
    kind,
    accountIdentifier: accountIdentifier || "",
    updatedAt: Date.now(),
  });
  return { ok: true };
});
ipcMain.handle("company-connector:delete-secret", (_event, { companyId, connectorId }) => {
  store.delete(connectorSecretKey(companyId, connectorId));
  return { ok: true };
});
ipcMain.handle("company-connector:request", async (_event, request) => {
  return performConnectorRequest(request);
});
ipcMain.handle("company-connector:validate", async (_event, { companyId, connectorId }) => {
  const { stored } = readConnectorCredential(companyId, connectorId);
  const result = await performConnectorRequest(connectorValidationRequest(companyId, connectorId, stored));
  if (stored.kind === "slack" && result.data?.ok === false) throw new Error(result.data.error || "Slack rejected the token");
  return { ok: true, status: result.status };
});

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
// Per-instance credential registry (P1 Security)
//
// Main-process-owned trust primitive. On every application launch we mint
// a fresh scoped local-session credential (>= 128 bits CSPRNG entropy,
// <= 24h lifetime) and a separate non-default Flask signing secret. Both
// are memory-only — never persisted, logged, or sent over IPC — and are
// delivered to local child processes through their environment alone via
// `childEnvSecrets()`. See src/main/credentialRegistry.js for the API.
// ─────────────────────────────────────────────────────────────────────────────
const credentialRegistry = createCredentialRegistry();
credentialRegistry.issue();

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

// Load .env for Privy credentials (Vite only injects VITE_* into renderer, not main process)
function _loadEnvPrivy() {
  if (process.env.VITE_PRIVY_APP_ID && process.env.PRIVY_APP_SECRET) return;
  try {
    const envPath = path.join(process.cwd(), ".env");
    if (fs.existsSync(envPath)) {
      const lines = fs.readFileSync(envPath, "utf8").split("\n");
      for (const line of lines) {
        const match = line.match(/^(VITE_PRIVY_APP_ID|PRIVY_APP_SECRET)\s*=\s*(.+)/);
        if (match) process.env[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
      }
    }
  } catch { /* */ }
}
_loadEnvPrivy();

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

/**
 * Get or create the user's own Privy server wallet.
 * Unlike agent wallets, this is the user's primary wallet for purchases/minting.
 * Uses userId as idempotency key so the same user always gets the same wallet.
 */
// ─────────────────────────────────────────────────────────────────────────────
// NON-CUSTODIAL WALLET BRIDGE (BrowserView → bonzai.sh/wallet)
// User's embedded wallet lives in the browser. Desktop delegates signing
// to a BrowserView that loads bonzai.sh/wallet?mode=embedded.
// ─────────────────────────────────────────────────────────────────────────────

let walletView = null;
let walletViewReady = false;
const pendingSignRequests = new Map(); // id → { resolve, reject }

ipcMain.handle("wallet:open", async (_event, { email }) => {
  try {
    if (walletView && !walletView.isDestroyed()) {
      walletView.focus();
      return { ok: true };
    }

    walletView = new BrowserWindow({
      width: 480,
      height: 700,
      parent: mainWindow,
      modal: false,
      show: true,
      title: "BonzAI Wallet",
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      },
    });

    const walletUrl = app.isPackaged
      ? `https://bonzai.sh/wallet?mode=embedded&email=${encodeURIComponent(email || '')}`
      : `http://localhost:1337/wallet?mode=embedded&email=${encodeURIComponent(email || '')}`;

    walletView.loadURL(walletUrl);

    walletViewReady = false;

    // Listen for postMessage responses via console.log bridge
    walletView.webContents.on("console-message", (_e, _level, message) => {
      try {
        if (message.startsWith("BONZAI:")) {
          const data = JSON.parse(message.slice(7));
          if (data.type === "BONZAI_WALLET_READY") {
            walletViewReady = true;
            console.log("[Wallet] Wallet window ready");
          } else if (data.type === "BONZAI_SIGN_RESPONSE") {
            const pending = pendingSignRequests.get(data.id);
            if (pending) {
              if (data.error) pending.reject(new Error(data.error));
              else pending.resolve(data.result);
              pendingSignRequests.delete(data.id);
            }
          } else if (data.type === "BONZAI_WALLET_ADDRESS") {
            store.set("privy-embedded-wallet-address", data.address);
            console.log("[Wallet] Address received:", data.address);
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send("wallet:address", data.address);
            }
          }
        }
      } catch { /* not a BONZAI message */ }
    });

    walletView.on("closed", () => {
      walletView = null;
      walletViewReady = false;
    });

    return { ok: true };
  } catch (err) {
    console.error("[Wallet] Wallet window open failed:", err.message);
    return { ok: false, error: err.message };
  }
});

ipcMain.handle("wallet:sign-request", async (_event, request) => {
  if (!walletView || walletView.isDestroyed()) {
    throw new Error("Wallet not open. Sign in first.");
  }

  const id = `sign-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  return new Promise((resolve, reject) => {
    pendingSignRequests.set(id, { resolve, reject });

    // Send signing request to wallet page
    walletView.webContents.executeJavaScript(`
      window.postMessage(${JSON.stringify({ type: 'BONZAI_SIGN_REQUEST', id, ...request })}, '*');
    `);

    // Timeout after 2 minutes
    setTimeout(() => {
      if (pendingSignRequests.has(id)) {
        pendingSignRequests.delete(id);
        reject(new Error("Signing request timed out"));
      }
    }, 120000);
  });
});

ipcMain.handle("wallet:get-address", async () => {
  return store.get("privy-embedded-wallet-address", null);
});

ipcMain.handle("wallet:close", async () => {
  if (walletView && !walletView.isDestroyed()) {
    walletView.close();
    walletView = null;
    walletViewReady = false;
  }
  return { ok: true };
});

// ─────────────────────────────────────────────────────────────────────────────
// SESSION SIGNER — Companion wallet access (non-custodial)
//
// The user creates their companion wallet on bonzai.sh/wallet and authorizes
// BonzAI's session signer key. The desktop app uses this key to sign
// companion transactions via the Privy Wallet API — within the user's
// spending policy. BonzAI never owns the wallet.
// ─────────────────────────────────────────────────────────────────────────────

// Generate or load session signer keypair (Ed25519 for Privy authorization signatures)
function _ensureSessionSignerKey() {
  let signerKey = store.get("privy-session-signer-private-key", null);
  let signerPublicKey = store.get("privy-session-signer-public-key", null);

  if (!signerKey || !signerPublicKey) {
    // Generate a new keypair using Node.js crypto
    const crypto = require("crypto");
    const { privateKey, publicKey } = crypto.generateKeyPairSync("ed25519");
    signerKey = privateKey.export({ type: "pkcs8", format: "pem" });
    signerPublicKey = publicKey.export({ type: "spki", format: "der" }).toString("hex");
    store.set("privy-session-signer-private-key", signerKey);
    store.set("privy-session-signer-public-key", signerPublicKey);
    console.log("[Privy] Generated new session signer keypair");
  }

  return { privateKey: signerKey, publicKey: signerPublicKey };
}

// Get the session signer public key (for registering on bonzai.sh/wallet)
ipcMain.handle("privy:get-session-signer-id", async () => {
  const { publicKey } = _ensureSessionSignerKey();
  return { signerId: publicKey };
});

// Sign a companion wallet transaction using the session signer
// This calls the Privy Wallet API with an authorization signature
ipcMain.handle("privy:companion-rpc", async (_event, { walletId, method, caip2, params }) => {
  try {
    const { privateKey } = _ensureSessionSignerKey();
    const appId = process.env.VITE_PRIVY_APP_ID;
    if (!appId) throw new Error("VITE_PRIVY_APP_ID not configured");

    const url = `https://api.privy.io/v1/wallets/${walletId}/rpc`;
    const body = { method, caip2: caip2 || "eip155:8453", params };
    const timestamp = Math.floor(Date.now() / 1000);

    // Generate authorization signature using session signer key
    const crypto = require("crypto");
    const signerKey = crypto.createPrivateKey(privateKey);
    const payload = JSON.stringify({
      version: 1,
      method: "POST",
      url,
      body,
      timestamp,
      headers: { "privy-app-id": appId },
    });
    const signature = crypto.sign(null, Buffer.from(payload), signerKey).toString("base64");

    // Call Privy Wallet API with authorization signature
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "privy-app-id": appId,
        "Authorization": `Bearer ${signature}`,
        "X-Privy-Authorization-Timestamp": String(timestamp),
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data?.message || data?.error || `Privy API error ${response.status}`);
    }

    return {
      hash: data.data?.hash || data.hash || data.result,
      signature: data.data?.signature || data.signature,
      result: data.data || data,
    };
  } catch (err) {
    console.error("[Privy] Companion RPC failed:", err.message);
    return { error: err.message };
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Open Wallet Standard (OWS) IPC Handlers
// Native Rust bindings via NAPI-RS — runs entirely in-process, no server.
// ─────────────────────────────────────────────────────────────────────────────

const OWS_VAULT_PATH = path.join(app.getPath("userData"), "ows-vault");

let _owsCore = null;

function getOWS() {
  if (!_owsCore) {
    try {
      _owsCore = require("@open-wallet-standard/core");
    } catch (err) {
      console.error("[OWS] Failed to load @open-wallet-standard/core:", err.message);
      throw new Error("OWS native bindings not available");
    }
  }
  return _owsCore;
}

// Wallet CRUD
ipcMain.handle("ows:create-wallet", async (_event, { name, passphrase }) => {
  try {
    const ows = getOWS();
    const result = await ows.createWallet({ name, passphrase, vaultPath: OWS_VAULT_PATH });
    return { address: result.address, name: result.name };
  } catch (err) {
    console.error("[OWS] Create wallet failed:", err.message);
    return { error: err.message };
  }
});

ipcMain.handle("ows:list-wallets", async () => {
  try {
    const ows = getOWS();
    return await ows.listWallets({ vaultPath: OWS_VAULT_PATH });
  } catch (err) {
    console.error("[OWS] List wallets failed:", err.message);
    return { error: err.message };
  }
});

ipcMain.handle("ows:get-wallet", async (_event, nameOrId) => {
  try {
    const ows = getOWS();
    return await ows.getWallet({ nameOrId, vaultPath: OWS_VAULT_PATH });
  } catch (err) {
    console.error("[OWS] Get wallet failed:", err.message);
    return { error: err.message };
  }
});

ipcMain.handle("ows:delete-wallet", async (_event, nameOrId) => {
  try {
    const ows = getOWS();
    await ows.deleteWallet({ nameOrId, vaultPath: OWS_VAULT_PATH });
    return { success: true };
  } catch (err) {
    console.error("[OWS] Delete wallet failed:", err.message);
    return { error: err.message };
  }
});

// Signing
ipcMain.handle("ows:sign-message", async (_event, { wallet, message, passphrase }) => {
  try {
    const ows = getOWS();
    const result = await ows.signMessage({ wallet, message, passphrase, vaultPath: OWS_VAULT_PATH });
    return { signature: result.signature };
  } catch (err) {
    console.error("[OWS] Sign message failed:", err.message);
    return { error: err.message };
  }
});

ipcMain.handle("ows:sign-typed-data", async (_event, { wallet, typedDataJson, passphrase }) => {
  try {
    const ows = getOWS();
    const result = await ows.signTypedData({ wallet, typedDataJson, passphrase, vaultPath: OWS_VAULT_PATH });
    return { signature: result.signature };
  } catch (err) {
    console.error("[OWS] Sign typed data failed:", err.message);
    return { error: err.message };
  }
});

ipcMain.handle("ows:sign-transaction", async (_event, { wallet, rawTxHex, passphrase }) => {
  try {
    const ows = getOWS();
    const result = await ows.signTransaction({ wallet, rawTxHex, passphrase, vaultPath: OWS_VAULT_PATH });
    return { signedTx: result.signedTx };
  } catch (err) {
    console.error("[OWS] Sign transaction failed:", err.message);
    return { error: err.message };
  }
});

ipcMain.handle("ows:sign-and-send", async (_event, { wallet, rawTxHex, passphrase, rpcUrl }) => {
  try {
    const ows = getOWS();
    const result = await ows.signAndSend({ wallet, rawTxHex, passphrase, rpcUrl, vaultPath: OWS_VAULT_PATH });
    return { txHash: result.txHash };
  } catch (err) {
    console.error("[OWS] Sign and send failed:", err.message);
    return { error: err.message };
  }
});

// API Key management
ipcMain.handle("ows:create-api-key", async (_event, { name, wallets, policies, passphrase, expiry }) => {
  try {
    const ows = getOWS();
    const result = await ows.createApiKey({ name, wallets, policies, passphrase, expiry, vaultPath: OWS_VAULT_PATH });
    return { id: result.id, token: result.token };
  } catch (err) {
    console.error("[OWS] Create API key failed:", err.message);
    return { error: err.message };
  }
});

ipcMain.handle("ows:list-api-keys", async () => {
  try {
    const ows = getOWS();
    return await ows.listApiKeys({ vaultPath: OWS_VAULT_PATH });
  } catch (err) {
    console.error("[OWS] List API keys failed:", err.message);
    return { error: err.message };
  }
});

ipcMain.handle("ows:revoke-api-key", async (_event, id) => {
  try {
    const ows = getOWS();
    await ows.revokeApiKey({ id, vaultPath: OWS_VAULT_PATH });
    return { success: true };
  } catch (err) {
    console.error("[OWS] Revoke API key failed:", err.message);
    return { error: err.message };
  }
});

// Policy management
ipcMain.handle("ows:create-policy", async (_event, json) => {
  try {
    const ows = getOWS();
    const result = await ows.createPolicy({ ...json, vaultPath: OWS_VAULT_PATH });
    return { id: result.id };
  } catch (err) {
    console.error("[OWS] Create policy failed:", err.message);
    return { error: err.message };
  }
});

ipcMain.handle("ows:list-policies", async () => {
  try {
    const ows = getOWS();
    return await ows.listPolicies({ vaultPath: OWS_VAULT_PATH });
  } catch (err) {
    console.error("[OWS] List policies failed:", err.message);
    return { error: err.message };
  }
});

ipcMain.handle("ows:get-policy", async (_event, id) => {
  try {
    const ows = getOWS();
    return await ows.getPolicy({ id, vaultPath: OWS_VAULT_PATH });
  } catch (err) {
    console.error("[OWS] Get policy failed:", err.message);
    return { error: err.message };
  }
});

ipcMain.handle("ows:delete-policy", async (_event, id) => {
  try {
    const ows = getOWS();
    await ows.deletePolicy({ id, vaultPath: OWS_VAULT_PATH });
    return { success: true };
  } catch (err) {
    console.error("[OWS] Delete policy failed:", err.message);
    return { error: err.message };
  }
});

// Import / Export
ipcMain.handle("ows:export-wallet", async (_event, { name, passphrase }) => {
  try {
    const ows = getOWS();
    return await ows.exportWallet({ name, passphrase, vaultPath: OWS_VAULT_PATH });
  } catch (err) {
    console.error("[OWS] Export wallet failed:", err.message);
    return { error: err.message };
  }
});

ipcMain.handle("ows:import-private-key", async (_event, { name, hexKey, passphrase }) => {
  try {
    const ows = getOWS();
    const result = await ows.importWalletPrivateKey({ name, hexKey, passphrase, vaultPath: OWS_VAULT_PATH });
    return { address: result.address, name: result.name };
  } catch (err) {
    console.error("[OWS] Import private key failed:", err.message);
    return { error: err.message };
  }
});

ipcMain.handle("store-get", (_event, key, def) => store.get(key, def));
ipcMain.handle("store-has", (_event, key) => store.has(key));
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

// Provider concurrency: one consumer request at a time
let _providerBusy = false;

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
    const node = getP2PNode();

    // If already started, just return current state
    if (node?.isStarted) {
      console.log("[P2P] Node already running");
      return {
        ok: true,
        peerId: node.getPeerId(),
        multiaddrs: node.getMultiaddrs(),
      };
    }

    const peerId = await startP2PNode(options);

    // Register inference handler that routes to local servers (only once)
    const startedNode = getP2PNode();
    const localPeerId = startedNode.getPeerId();

    await startedNode.onInferenceRequest(async (request, remotePeer) => {
      // Discovery is always available, but serving compute is an explicit
      // provider capability. Local and consumer modes never execute inbound
      // payloads, even though their node remains visible to the mesh.
      const activeMode = store.get("p2p.networkMode", "local");
      if (activeMode !== "provider") {
        return { ok: false, error: "provider_disabled", detail: "This peer is present but is not serving inference." };
      }

      console.log(`[P2P] Inference request from ${remotePeer}:`, request.pipeline);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("mesh-activity", {
          type: "inference_requested", ts: Date.now(), peerId: remotePeer,
          pipeline: request.pipeline || "inference",
        });
      }

      // Concurrency guard — one consumer at a time
      if (_providerBusy) {
        console.log(`[P2P] Provider busy, rejecting ${remotePeer.slice(0, 12)}`);
        return { ok: false, error: "provider_busy", detail: "Provider is currently serving another consumer. Try again shortly." };
      }

      // Inference is free to consumers. Provider compensation is accounted
      // separately through BonzaiServiceTime and MintPool reward epochs.
      const node = getP2PNode();

      // ── Acquire lock and process ──
      _providerBusy = true;
      try {
        // Hot-swap LLM model if consumer requests a different one
        const isLLM = request.pipeline === "llm" || request.pipeline?.startsWith("llm_");
        if (isLLM && request.params?.model) {
          const requestedModel = request.params.model.toLowerCase();
          const currentFilename = (currentLoadedModel?.filename || "").toLowerCase();

          // Check if the requested model name matches the loaded model
          if (currentFilename && !currentFilename.includes(requestedModel.replace(/\s+/g, '-').toLowerCase())) {
            // Find a matching .gguf file in MODEL_DIR
            const files = fs.readdirSync(MODEL_DIR).filter(f => f.endsWith('.gguf') && !f.includes('-part'));
            const match = files.find(f => {
              const lower = f.toLowerCase();
              // Match by model name: "Qwen 3.5 0.8B" → "qwen3.5-0.8b"
              const normalized = requestedModel.replace(/[\s.]+/g, '').toLowerCase();
              return lower.includes(normalized) || lower.replace(/[-_.]/g, '').includes(normalized);
            });

            if (match) {
              console.log(`[P2P] Hot-swapping model: ${currentFilename} → ${match}`);
              try {
                await loadModel(null, { filename: match, forceReload: true });
                console.log(`[P2P] Model hot-swap complete: ${match}`);
              } catch (err) {
                console.error(`[P2P] Model hot-swap failed: ${err.message}`);
                return { ok: false, error: "model_swap_failed", detail: `Cannot load requested model: ${err.message}` };
              }
            } else {
              console.warn(`[P2P] Requested model "${requestedModel}" not found in ${MODEL_DIR}`);
              return { ok: false, error: "model_not_available", detail: `Model "${requestedModel}" is not downloaded on this provider.` };
            }
          }
        }

        const result = await routeInferenceRequest(request);

        const response = { ok: true, result };
        if (node.isLANPeer(remotePeer)) response.lanInference = true;
        if (remotePeer === localPeerId) response.selfInference = true;
        response.freeInference = true;
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("mesh-activity", {
            type: "inference_completed", ts: Date.now(), peerId: remotePeer,
            pipeline: request.pipeline || "inference",
          });
        }
        return response;
      } catch (err) {
        return { ok: false, error: "inference_failed", detail: err.message };
      } finally {
        _providerBusy = false;
      }
    });

    // Register health handler
    await startedNode.onHealthRequest(async (request, remotePeer) => {
      const pipelines = store.get("p2p.pipelines", []);
      const pricingCurrency = "FREE";
      const FLASK_PORT = process.env.BONZAI_SERVER_PORT || 65000;

      // Scan MODEL_DIR for available LLM models (.gguf files)
      let availableModels = [];
      try {
        const files = fs.readdirSync(MODEL_DIR);
        availableModels = files
          .filter(f => f.endsWith('.gguf') && !f.includes('-part'))
          .map(f => f.toLowerCase());
      } catch { /* */ }

      // Check which Flask pipelines are ready (models downloaded)
      const readyPipelines = [];
      const flaskPipelines = ['image_turbo', 'image_quality', 'image_standard', 'audio_turbo', 'audio_quality', 'music', 'video_fast', 'vision'];
      try {
        const checks = await Promise.all(flaskPipelines.map(async (p) => {
          try {
            const res = await fetch(`http://127.0.0.1:${FLASK_PORT}/pipelines/plan`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ pipeline: p }),
              signal: AbortSignal.timeout(3000),
            });
            if (res.ok) {
              const data = await res.json();
              return data.ok ? p : null;
            }
          } catch { /* */ }
          return null;
        }));
        readyPipelines.push(...checks.filter(Boolean));
      } catch { /* Flask may not be running */ }

      // LLM is ready if any .gguf exists
      if (availableModels.length > 0) readyPipelines.push('llm');

      return {
        ok: true,
        peerId: node.getPeerId(),
        pipelines,
        readyPipelines,
        pricingCurrency,
        free: pricingCurrency === "FREE",
        version: app.getVersion(),
        uptime: process.uptime(),
        availableModels,
        currentModel: currentLoadedModel?.filename || null,
        busy: _providerBusy,
      };
    });

    // Desktop notification when LAN peer discovered
    startedNode._onLANPeerDiscovered = (discoveredPeerId, lanIP) => {
      const { Notification } = require("electron");
      if (Notification.isSupported()) {
        const notification = new Notification({
          title: "BonzAI Mesh",
          body: "A BonzAI peer joined your local mesh. No private content was shared.",
          silent: false,
        });
        notification.show();
      }
      // Forward to renderer for in-app notification
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("lan-peer-discovered", { peerId: discoveredPeerId, lanIP });
      }
    };

    startedNode._onNetworkEvent = (activity) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        // Peer IDs are required for routing but no addresses, prompts, model
        // inputs, wallet data, or generated content cross this UI channel.
        mainWindow.webContents.send("mesh-activity", activity);
      }
    };

    // Start the privacy-pipeline UDS bridge so the local diffuser can
    // open sharded inference sessions when the user picks Consumer +
    // Privacy. Idempotent — safe to call on every p2p-start. Surfacing
    // the socket path via env lets the Python diffuser discover it
    // without an extra IPC roundtrip.
    try {
      const { startConsumerBridge, startProviderBridge } = await import("./main/shardSession.js");
      const sockPath = await startConsumerBridge();
      process.env.BONZAI_SHARD_SOCKET = sockPath;
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("shard-socket-ready", sockPath);
      }

      // Provider role: register inbound libp2p handlers (SHARD_LOAD on
      // /bonzai/v2/pipeline + raw streams on /bonzai/v2/rpc-tunnel)
      // that bridge incoming sessions to the local Flask shard worker.
      // Networkmode-gated so consumers don't unintentionally serve
      // shards. Mode change → next p2p-start picks up the new role.
      const mode = store.get("p2p.networkMode", "local");
      if (mode === "provider") {
        const flaskPort = parseInt(process.env.BONZAI_SERVER_PORT || "65000", 10);
        await startProviderBridge({ flaskPort });
      }
    } catch (err) {
      // Bridge is non-fatal — Consumer + Privacy / Provider modes just
      // won't work until the user resolves the underlying issue (e.g.,
      // stale socket file in /tmp from a prior crash).
      console.warn("[P2P] shard bridge failed to start:", err.message);
    }

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
    try {
      const { stopConsumerBridge, stopProviderBridge } = await import("./main/shardSession.js");
      await stopConsumerBridge();
      await stopProviderBridge();
    } catch (err) {
      console.warn("[P2P] shard bridge stop failed:", err.message);
    }
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
    lanPeers: node.getLANPeers().length,
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

// ─────────────────────────────────────────────────────────────────────────────
// LAN PROVIDER DISCOVERY (mDNS)
// ─────────────────────────────────────────────────────────────────────────────

ipcMain.handle("p2p-lan-peers", async () => {
  const node = getP2PNode();
  if (!node?.isStarted) return { ok: true, peers: [] };

  const lanPeers = node.getLANPeers();
  // Health check each LAN peer to get capabilities, version, and latency
  const enriched = await Promise.all(lanPeers.map(async (peer) => {
    try {
      const start = Date.now();
      const health = await node.checkPeerHealth(peer.peerId);
      const latencyMs = Date.now() - start;
      return { ...peer, ...health, latencyMs, online: true };
    } catch {
      return { ...peer, online: false };
    }
  }));

  return { ok: true, peers: enriched.filter(p => p.online) };
});

// ─────────────────────────────────────────────────────────────────────────────
// PIPELINE PRIVATE INFERENCE (v2)
// ─────────────────────────────────────────────────────────────────────────────

let rpcServerProcess = null;

// Pipeline orchestrator + tunnel imports (lazy to avoid circular deps at startup)
let _pipelineOrchestrator = null;
let _pipelineTunnel = null;
async function getPipelineOrchestrator() {
  if (!_pipelineOrchestrator) _pipelineOrchestrator = await import("./services/pipeline.orchestrator.js");
  return _pipelineOrchestrator;
}
async function getPipelineTunnel() {
  if (!_pipelineTunnel) _pipelineTunnel = await import("./services/pipeline.tunnel.js");
  return _pipelineTunnel;
}

ipcMain.handle("p2p-pipeline-infer", async (event, options) => {
  try {
    // Resolve model path: use provided path, or resolve from currently loaded model
    let resolvedModelPath = options.modelPath;
    if (!resolvedModelPath && currentLoadedModel?.filename) {
      resolvedModelPath = path.join(MODEL_DIR, currentLoadedModel.filename);
    }
    if (!resolvedModelPath) {
      return { ok: false, error: "No model loaded. Load a model first." };
    }

    // Stop llama-server only when starting a new session
    const { getActiveSession } = await getPipelineOrchestrator();
    if (!getActiveSession() && llamaServer.isRunning()) {
      const modelInfo = currentLoadedModel ? { ...currentLoadedModel } : null;
      console.log("[Pipeline] Stopping llama-server for new pipeline session...");
      try { await unloadModel(); } catch (e) {
        console.warn("[Pipeline] Model unload warning:", e.message);
      }
      if (mainWindow && !mainWindow.isDestroyed() && modelInfo) {
        mainWindow.webContents.send("model-changed", { ...modelInfo, pipelineMode: true });
      }
    }

    const { runPipelineInference } = await getPipelineOrchestrator();
    const result = await runPipelineInference({
      modelPath: resolvedModelPath,
      request: options.request || { prompt: options.prompt, maxTokens: options.maxTokens },
      privacyConfig: options.privacyConfig,
      onToken: (chunk) => {
        event.sender.send("pipeline-token", chunk);
      },
      onStatus: (msg) => {
        event.sender.send("pipeline-status", msg);
      },
    });
    return { ok: true, ...result };
  } catch (e) {
    console.error("[Pipeline] Inference error:", e.message);
    return { ok: false, error: e.message };
  }
});

ipcMain.handle("p2p-pipeline-status", async () => {
  const { getActiveSession } = await getPipelineOrchestrator();
  const session = getActiveSession();
  if (!session) return { ok: true, active: false };
  return {
    ok: true,
    active: true,
    sessionId: session.sessionId,
    status: session.status,
    peersUsed: session.peerIds?.length || 0,
    llamaServerPort: session.llamaServerPort,
    elapsed: Date.now() - session.startTime,
    requestCount: session.requestCount || 0,
    tunnelStats: session.tunnels?.map((t) => t.stats()) || [],
    privacyAudit: session.privacyAudit || null,
  };
});

ipcMain.handle("p2p-pipeline-cancel", async () => {
  try {
    const { cancelPipelineSession } = await getPipelineOrchestrator();
    await cancelPipelineSession();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle("p2p-shard-metadata", async (_event, { modelPath }) => {
  try {
    const { readGGUFMetadata } = await getPipelineOrchestrator();
    const meta = readGGUFMetadata(modelPath || MODEL_DIR);
    return { ok: true, ...meta };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// Shard provider mode: spawn local rpc-server and register tunnel handler
ipcMain.handle("p2p-shard-start", async (_event, options = {}) => {
  if (rpcServerProcess && !rpcServerProcess.killed) {
    return { ok: false, error: "rpc-server already running" };
  }

  const rpcPort = options.port || 50052;

  // Find rpc-server binary
  const platform = { darwin: "macos", win32: "windows", linux: "linux" }[process.platform] || process.platform;
  const arch = process.arch;
  const ext = process.platform === "win32" ? ".exe" : "";
  const binName = `rpc-server${ext}`;

  const searchPaths = [
    path.join(process.cwd(), "bin", `${platform}-${arch}`, binName),
    // electron-packager bundles app source under Resources/app/
    process.resourcesPath ? path.join(process.resourcesPath, "app", "bin", `${platform}-${arch}`, binName) : null,
    // electron-forge copies to Resources/server/llama-runtime/
    process.resourcesPath ? path.join(process.resourcesPath, "server", "llama-runtime", `${platform}-${arch}`, binName) : null,
  ].filter(Boolean);

  let binPath = searchPaths.find(p => fs.existsSync(p));
  if (!binPath) {
    return { ok: false, error: `rpc-server binary not found at: ${searchPaths.join(', ')}` };
  }

  // Clear quarantine on macOS
  if (process.platform === "darwin" && app.isPackaged) {
    try {
      child_process.execSync(`xattr -rd com.apple.quarantine "${binPath}"`, { stdio: "ignore" });
    } catch {}
  }

  console.log(`[Pipeline Shard] Starting rpc-server on port ${rpcPort}...`);
  rpcServerProcess = child_process.spawn(binPath, ["-p", String(rpcPort)], {
    stdio: ["ignore", "pipe", "pipe"],
    // rpc-server authenticates the bridge with the session credential
    // only; it does not consume the Flask signing secret, so scope it out
    // and keep SECRET_KEY limited to the diffuser service that reads it.
    env: { ...process.env, ...childEnvSecrets(credentialRegistry, { flask: false }) },
  });

  rpcServerProcess.stdout.on("data", (d) => {
    const line = d.toString().trim();
    if (line) console.log(`[rpc-server] ${line}`);
  });
  rpcServerProcess.stderr.on("data", (d) => {
    const line = d.toString().trim();
    if (line) console.log(`[rpc-server:err] ${line}`);
  });
  rpcServerProcess.on("exit", (code) => {
    console.log(`[Pipeline Shard] rpc-server exited with code ${code}`);
    rpcServerProcess = null;
  });

  // Register libp2p tunnel handler to bridge incoming streams to rpc-server
  const node = getP2PNode();
  if (node?.isStarted) {
    const { registerRPCTunnelHandler } = await getPipelineTunnel();
    await registerRPCTunnelHandler(node, rpcPort);
  }

  return { ok: true, rpcPort };
});

ipcMain.handle("p2p-shard-stop", async () => {
  if (rpcServerProcess && !rpcServerProcess.killed) {
    rpcServerProcess.kill("SIGTERM");
    await new Promise((r) => setTimeout(r, 1000));
    if (rpcServerProcess && !rpcServerProcess.killed) {
      rpcServerProcess.kill("SIGKILL");
    }
    rpcServerProcess = null;
    console.log("[Pipeline Shard] rpc-server stopped");
  }
  return { ok: true };
});

// ─────────────────────────────────────────────────────────────────────────
// SERVICE-TIME LEDGER IPC
// ─────────────────────────────────────────────────────────────────────────
// The renderer's serviceTime.service.js can't read filesystem directly;
// these IPCs expose the NDJSON ledger that shard.py and the consumer
// bridge append to. `read` returns parsed rows, `truncate` removes
// rows whose ts is <= a watermark (used after a successful submission
// tx confirms). Both ops are best-effort idempotent — re-running a
// flush after a partial truncate replays the same rows; the contract
// dedupes via the (provider, epoch) accumulator.

function _serviceTimeLedgerPath() {
  const home = process.env.HOME || process.env.USERPROFILE || os.tmpdir();
  return path.join(home, "bonzai-server", "service_time.ndjson");
}

ipcMain.handle("service-time:read-ledger", async () => {
  const p = _serviceTimeLedgerPath();
  if (!fs.existsSync(p)) return [];
  try {
    const text = fs.readFileSync(p, "utf8");
    const rows = [];
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const row = JSON.parse(trimmed);
        row._raw_size = Buffer.byteLength(trimmed, "utf8") + 1;
        rows.push(row);
      } catch {
        // Skip malformed rows rather than poisoning the whole flush
      }
    }
    return rows;
  } catch (err) {
    console.warn("[service-time] read failed:", err.message);
    return [];
  }
});

ipcMain.handle("service-time:truncate-ledger", async (_event, beforeTs) => {
  const p = _serviceTimeLedgerPath();
  if (!fs.existsSync(p)) return { kept: 0, removed: 0 };
  try {
    const text = fs.readFileSync(p, "utf8");
    const kept = [];
    let removed = 0;
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      let row;
      try { row = JSON.parse(trimmed); } catch { continue; }
      if (typeof beforeTs === "number" && row.ts <= beforeTs) {
        removed++;
        continue;
      }
      kept.push(trimmed);
    }
    // Write atomically: temp file + rename. Avoids a half-truncated
    // ledger if the shard worker appends mid-write.
    const tmp = p + ".tmp";
    fs.writeFileSync(tmp, kept.length ? kept.join("\n") + "\n" : "", "utf8");
    fs.renameSync(tmp, p);
    return { kept: kept.length, removed };
  } catch (err) {
    console.warn("[service-time] truncate failed:", err.message);
    return { kept: 0, removed: 0, error: err.message };
  }
});

// Kill rpc-server on app quit
app.on("before-quit", () => {
  if (rpcServerProcess && !rpcServerProcess.killed) {
    rpcServerProcess.kill("SIGTERM");
  }
  try { llamaServer.stopModel({ force: true }); } catch {}
  // Close the SQLite handle so WAL is checkpointed cleanly before exit.
  try {
    import("./main/db/connection.js").then((m) => m.close());
  } catch {}
});

// Consumer-mode: update the local llama-server's -rpc peer list. Safe to
// call before a model is loaded (becomes the default for the next
// startModel). Callers pass LOCAL TCP endpoints that they have already
// forwarded to remote libp2p shard providers.
ipcMain.handle("llama-set-rpc-peers", async (_event, peers) => {
  try {
    return await llamaServer.updateRpcPeers(peers || []);
  } catch (e) {
    console.warn("[Consumer] Failed to update RPC peers:", e.message);
    return { restarted: false, peers: [], error: e.message };
  }
});
ipcMain.handle("llama-get-rpc-peers", () => llamaServer.getRpcPeers());

// Consolidated runtime status for the Network Settings self-test and any
// other UI that needs to distinguish "OpenClaw gateway running" (the HTTP
// server on :3002, always up) from "LLM runtime running" (the llama-server
// subprocess, only up when a model is loaded).
// Rebroadcast the current model-changed payload. Used by the P2P network
// modal when the user toggles network mode or pipeline mode so the bottom
// bar's "pipeline" tag updates immediately instead of waiting for the next
// load/swap.
ipcMain.handle("broadcast-model-state", () => {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  if (!currentLoadedModel) {
    mainWindow.webContents.send("model-changed", null);
    return true;
  }
  const networkMode = store.get("p2p.networkMode", "local");
  const pipelineEnabled = store.get("p2p.pipeline.enabled", false);
  const pipelineMode = networkMode === "consumer" && pipelineEnabled;
  mainWindow.webContents.send("model-changed", {
    filename: currentLoadedModel.filename,
    modelname: currentLoadedModel.modelname || resolveModelName(currentLoadedModel.filename),
    parameters: currentLoadedModel.parameters,
    context: currentLoadedModel.context,
    isMultimodal: !!currentLoadedModel.isMultimodal,
    model_provenance: currentLoadedModel.model_provenance || currentLoadedModel.provenance || null,
    provenance: currentLoadedModel.provenance || currentLoadedModel.model_provenance || null,
    pipelineMode,
  });
  return true;
});

ipcMain.handle("llama-runtime-status", async () => {
  const running = llamaServer.isRunning();
  const port = llamaServer.getActivePort();
  const rpcPeers = llamaServer.getRpcPeers();
  const spec = llamaServer.getActiveSpec();
  return {
    running,
    port,
    rpcPeers,
    modelName: currentLoadedModel?.filename || null,
    isMultimodal: !!currentLoadedModel?.isMultimodal,
    ctxSize: spec?.ctxSize || null,
    hasSpecDecode: !!spec?.draftPath || spec?.specType === "draft-mtp" || spec?.mtp === true,
  };
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

      // Video quality pipeline (Wan 2.2 i2v) — no dedicated category in
      // BonzaiProviderRegistry yet (enum stops at VISION=10). Eligible
      // providers fall under the same `video_fast` advertisement until the
      // contract gets a VIDEO_QUALITY slot; revisit when ServiceTime is
      // populated in web3.config.js.
      case "video_quality":
        endpoint = "/video/quality";
        break;

      // Cross-platform GGUF vision pipeline.
      case "vision":
      case "qwen35_vision":
        endpoint = "/vision/analyze";
        break;
      case "vision_caption":
        endpoint = "/vision/caption";
        break;

      // OCR uses the same multimodal GGUF with a transcription prompt.
      case "ocr":
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

  if (response.status === 202) {
    // Model not downloaded — Flask wants to prefetch. This is meaningless for remote consumers.
    throw new Error(`Pipeline "${pipeline}" model not downloaded on this provider.`);
  }

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Inference failed (${response.status}): ${error}`);
  }

  return response.json();
}

// ─────────────────────────────────────────────────────────────────────────────
// CONSUMER-SIDE INFERENCE ROUTING
// Routes to local Flask/OpenClaw or to selected remote/LAN provider via P2P
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Unified inference routing for all generation types.
 *
 * Reads network mode from store and routes accordingly:
 * - local / provider → local Flask/OpenClaw
 * - consumer + pipeline + LLM → pipeline orchestrator (parallelism across all selected providers)
 * - consumer (no pipeline, or non-LLM) → random provider from selection, fallback to local
 */
/**
 * Ensure a model session is loaded before signalling `useLocal: true` to the
 * caller. Without this, a cold-start chatStream throws "Model not loaded",
 * which is what the renderer was hitting when the P2P orchestrator unloaded
 * the model or when local mode had never loaded one explicitly.
 *
 * Returns true if a session is ready (or was just brought up), false if no
 * model info is available to reload from.
 */
async function ensureLocalLLMReady() {
  if (llamaServer.isRunning()) return true;
  // Prefer the live currentLoadedModel; fall back to the persisted
  // lastLoadedSpec if the user (or pipeline) called unloadModel and
  // wiped currentLoadedModel. This is what restores the node-llama-cpp
  // era behavior: after a TTS+image generation cycle in RoleplayChat,
  // the next user message respawns the same LLM automatically.
  let spec = currentLoadedModel?.filename ? currentLoadedModel : null;
  if (!spec && lastLoadedSpec?.filename) {
    spec = lastLoadedSpec;
    console.log(`[Inference] Auto-respawning previous model: ${spec.filename}`);
  }
  if (!spec) return false;
  try {
    await loadModel(null, { ...spec });
    return llamaServer.isRunning();
  } catch (e) {
    console.warn("[Inference] Failed to restore local model session:", e.message);
    return false;
  }
}

ipcMain.handle("inference-request", async (event, { pipeline, params }) => {
  try {
    const networkMode = store.get("p2p.networkMode", "local");

    // ── LOCAL or PROVIDER mode: always local ──
    if (networkMode !== "consumer") {
      const isLLM = pipeline === "llm" || pipeline.startsWith("llm_");
      if (isLLM) {
        // LLM: let the component use chatStream directly (streaming + node-llama-cpp).
        // Make sure a model session exists — if the user previously ran in
        // consumer mode, it may have been unloaded.
        const ready = await ensureLocalLLMReady();
        if (!ready) {
          return {
            ok: false,
            useLocal: true,
            error: "No local model loaded. Pick a model in the Chat tab first.",
          };
        }
        return { ok: false, useLocal: true };
      }
      const result = await routeInferenceRequest({ pipeline, params });
      return { ok: true, result, remote: false };
    }

    // ── CONSUMER mode ──
    const pipelineEnabled = store.get("p2p.pipeline.enabled", false);
    const isLLM = pipeline === "llm" || pipeline.startsWith("llm_");

    // Pipeline parallelism (LLM only)
    if (pipelineEnabled && isLLM) {
      try {
        const { runPipelineInference, getActiveSession, cancelPipelineSession } = await getPipelineOrchestrator();

        // Resolve the model path from currentLoadedModel (the canonical
        // source of "what the user picked"). If an active pipeline session
        // exists but references a DIFFERENT model, invalidate it — the user
        // swapped models since the pipeline was started, and reusing the
        // old session would send the new model prompts crafted for the old
        // one. The next inference will kick off a fresh pipeline session
        // for the current model.
        const activeSession = getActiveSession();
        let modelPath = currentLoadedModel?.filename
          ? path.join(MODEL_DIR, currentLoadedModel.filename)
          : activeSession?.modelPath || null;
        if (activeSession && activeSession.modelPath !== modelPath) {
          console.log(`[Inference] Pipeline session model mismatch (${path.basename(activeSession.modelPath)} → ${path.basename(modelPath)}); invalidating session.`);
          await cancelPipelineSession();
        }

        // Stop llama-server only when starting a new session.
        // Subsequent requests reuse the active session — no restart needed.
        if (!activeSession && llamaServer.isRunning()) {
          // Preserve model info before stopping so the bottom bar can show it
          const modelInfo = currentLoadedModel ? { ...currentLoadedModel } : null;
          console.log("[Inference] Stopping llama-server for new pipeline session...");
          try { await unloadModel(); } catch (e) {
            console.warn("[Inference] Model unload warning:", e.message);
          }
          // Notify renderer that pipeline has the model (not "No Active Chat Model")
          if (mainWindow && !mainWindow.isDestroyed() && modelInfo) {
            mainWindow.webContents.send("model-changed", {
              ...modelInfo,
              pipelineMode: true,
            });
          }
        }

        // Read selected providers and pass to orchestrator
        let selectedProvidersList = [];
        const spRaw = store.get("p2p.selectedProviders", null);
        if (spRaw) {
          selectedProvidersList = typeof spRaw === "string" ? JSON.parse(spRaw) : spRaw;
        }

        const privacyConfig = {
          localProportion: store.get("p2p.pipeline.localProportion", 25),
          dpEnabled: store.get("p2p.pipeline.dpEnabled", false),
          epsilon: store.get("p2p.pipeline.epsilon", 8),
          localTest: store.get("p2p.pipeline.localTest", false),
          selectedProviders: Array.isArray(selectedProvidersList) ? selectedProvidersList : [],
        };

        const result = await runPipelineInference({
          modelPath,
          request: params,
          privacyConfig,
          onToken: (chunk) => {
            event.sender.send("pipeline-token", chunk);
          },
          onStatus: (msg) => {
            event.sender.send("pipeline-status", msg);
          },
        });
        return { ok: true, result, remote: true, pipeline: true };
      } catch (err) {
        console.warn(`[Inference] Pipeline failed: ${err.message}, falling back`);
        // Surface actionable errors to the renderer so the user sees a
        // danger notification instead of a silent local fallback.
        const msg = String(err.message || "");
        const isNoProviders = /no shard providers/i.test(msg);
        event.sender.send("pipeline-error", {
          code: isNoProviders ? "no_providers" : "pipeline_failed",
          message: msg,
          fatal: isNoProviders, // fatal = don't even try local fallback
        });
        if (isNoProviders) {
          // Bail early — no viable local model since the pipeline had
          // intentionally stopped the subprocess, and the user needs to
          // resolve the providers issue before retrying.
          return { ok: false, useLocal: false, error: msg, code: "no_providers" };
        }
        // Otherwise: reload model and fall through to provider selection.
        await ensureLocalLLMReady();
      }
    }

    // ── Privacy pipeline (Consumer + Privacy, DiT routes only) ──
    // When the user has enabled privacy AND picked a DiT pipeline, we
    // route through the LOCAL Flask with `pipeline_mode=private` +
    // `peer_id` injected. Local Flask's ShardedDiTPipeline patches the
    // transformer's layer list so the middle blocks ride the libp2p
    // bridge to the chosen provider; head + tail run locally. Free —
    // no per-gen payment plumbing here.
    const SHARDABLE_DIT = new Set([
      "image_quality", "image_advanced",
      "image_turbo",
      "video_fast", "video_quality",
      "audio_quality", "music",
    ]);
    if (pipelineEnabled && !isLLM && SHARDABLE_DIT.has(pipeline)) {
      const node = getP2PNode();
      const providersRaw = store.get("p2p.selectedProviders", null);
      const providers = providersRaw
        ? (typeof providersRaw === "string" ? JSON.parse(providersRaw) : providersRaw)
        : [];
      if (node?.isStarted && Array.isArray(providers) && providers.length > 0) {
        // Path-state machine — selection filters out peers in SKIP /
        // ASSUMED_BAD / DENIED, weights by compute_score, and bumps a
        // peer back to GOOD on success. See pipelinePlanner.service.js.
        const planner = await import("./services/pipelinePlanner.service.js");
        const peer = planner.pickPeer(pipeline, providers);
        if (peer) {
          const enrichedParams = {
            ...params,
            pipeline_mode: "private",
            peer_id: peer.peerId,
          };
          try {
            console.log(`[Inference] Private mode: routing ${pipeline} via peer ${peer.peerId.slice(0, 12)}…`);
            const result = await routeInferenceRequest({ pipeline, params: enrichedParams });
            planner.markSuccess(peer.peerId);
            return { ok: true, result, remote: false, private: true, peerId: peer.peerId };
          } catch (err) {
            // Categorize the error so the planner state machine takes
            // the right transition. Timeouts / TRIM-class are transient
            // (→ SKIP); shardId mismatch / PSN errors are fatal
            // (→ ASSUMED_BAD); UDS hangup means the local bridge died.
            const msg = String(err.message || "");
            let reason = planner.FAILURE_REASON.WORKER_ERROR;
            if (/timeout|deadline/i.test(msg))         reason = planner.FAILURE_REASON.TIMEOUT;
            else if (/trim/i.test(msg))                reason = planner.FAILURE_REASON.NACK_TRIM;
            else if (/no.?bitmap|no_bitmap/i.test(msg)) reason = planner.FAILURE_REASON.NACK_NOBITMAP;
            else if (/psn.?out.?of.?range|psn_oor/i.test(msg)) reason = planner.FAILURE_REASON.NACK_PSN_OOR;
            else if (/uds|socket closed/i.test(msg))   reason = planner.FAILURE_REASON.UDS_DISCONNECT;
            const newState = planner.markFailure(peer.peerId, reason);
            console.warn(`[Inference] Private-mode dispatch failed (${reason} → ${newState}): ${msg}`);
            event.sender.send("pipeline-error", {
              code: "private_failed",
              message: msg,
              peerId: peer.peerId,
              reason,
              newState,
              fatal: false,
            });
            // Fall through to single-provider routing — graceful
            // degradation. Same privacy model as Consumer mode.
          }
        } else {
          console.warn(`[Inference] No GOOD-state peers for private ${pipeline}; falling through`);
        }
      }
    }

    // ── Provider selection (random from selected providers) ──
    const node = getP2PNode();
    const providersRaw = store.get("p2p.selectedProviders", null);

    if (providersRaw && node?.isStarted) {
      const providers = typeof providersRaw === "string" ? JSON.parse(providersRaw) : providersRaw;
      if (Array.isArray(providers) && providers.length > 0) {
        const isLLM = pipeline === "llm" || pipeline.startsWith("llm_");
        const requestedModel = isLLM ? (params?.model || currentLoadedModel?.filename || "").toLowerCase() : null;

        // Filter to providers that can handle this request
        let eligible = providers;
        if (isLLM && requestedModel) {
          // LLM: filter by model availability
          eligible = providers.filter(p => {
            if (!p.availableModels || p.availableModels.length === 0) return true;
            const normalizedReq = requestedModel.replace(/[\s.]+/g, '').toLowerCase();
            return p.availableModels.some(m =>
              m.includes(normalizedReq) || m.replace(/[-_.]/g, '').includes(normalizedReq)
            );
          });
          if (eligible.length === 0) {
            console.warn(`[Inference] No providers have model "${requestedModel}", falling back to local`);
          }
        } else if (!isLLM) {
          // Non-LLM: filter by ready pipeline
          eligible = providers.filter(p => {
            if (!p.readyPipelines || p.readyPipelines.length === 0) return true;
            return p.readyPipelines.includes(pipeline);
          });
          if (eligible.length === 0) {
            console.warn(`[Inference] No providers have pipeline "${pipeline}" ready, falling back to local`);
          }
        }

        // Randomize and try each eligible provider
        const shuffled = [...eligible].sort(() => Math.random() - 0.5);
        // Include model name in request so provider can hot-swap
        const enrichedParams = isLLM && requestedModel ? { ...params, model: requestedModel } : params;

        for (const provider of shuffled) {
          try {
            console.log(`[Inference] Routing ${pipeline} to ${provider.peerId.slice(0, 12)}...`);
            const response = await node.sendInferenceRequest(provider.peerId, { pipeline, params: enrichedParams });
            if (response?.ok) {
              return { ok: true, result: response.result, remote: true, peerId: provider.peerId, free: !!provider.free };
            }
            if (response?.error === "provider_busy") {
              console.log(`[Inference] Provider ${provider.peerId.slice(0, 12)} busy, trying next...`);
              continue;
            }
            console.warn(`[Inference] Provider ${provider.peerId.slice(0, 12)} failed: ${response?.error || 'unknown'}`);
          } catch (err) {
            console.warn(`[Inference] Provider ${provider.peerId.slice(0, 12)} error: ${err.message}`);
          }
        }
        console.warn("[Inference] All providers failed, falling back to local");
      }
    }

    // Fallback to local — all remote providers exhausted or unavailable.
    const isLLMLocal = pipeline === "llm" || pipeline.startsWith("llm_");
    if (isLLMLocal) {
      // Re-hydrate the local model session before signalling useLocal so the
      // follow-up chatStream call doesn't fail with "Model not loaded".
      const ready = await ensureLocalLLMReady();
      if (!ready) {
        return {
          ok: false,
          useLocal: true,
          error: "Remote providers failed and no local model is loaded. Pick one in the Chat tab to fall back.",
        };
      }
      return { ok: false, useLocal: true };
    }
    // Non-LLM: route through Flask directly
    const result = await routeInferenceRequest({ pipeline, params });
    return { ok: true, result, remote: false };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

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
// OpenClaw Integration Config
// ─────────────────────────────────────────────────────────────────────────────
const OPENCLAW_MODELS_PATH = path.join(os.homedir(), ".openclaw", "agents", "main", "agent", "models.json");
const OPENCLAW_CONFIG_PATH = path.join(os.homedir(), ".openclaw", "openclaw.json");

/**
 * Resolve the SKILL.md manifest path for an agent harness.
 * Looks in dev (repo) and packaged (Resources) locations so the toggle
 * works identically in both. Returns an absolute path or null.
 */
function resolveBundledSkillManifest(name) {
  const candidates = [
    path.join(__dirname, "..", name, "SKILL.md"),                       // dev
    path.join(process.resourcesPath || "", name, "SKILL.md"),           // packaged
    path.join(app.getAppPath(), name, "SKILL.md"),                       // packaged asar
    path.join(app.getAppPath(), "..", name, "SKILL.md"),                 // packaged outside asar
  ];
  for (const c of candidates) {
    try { if (c && fs.existsSync(c)) return c; } catch {}
  }
  return null;
}

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

      // Copy SKILL.md from our bundled hermes/ dir. Always overwrite — when
      // the user upgrades BonzAI, their Hermes install should pick up the
      // refreshed manifest automatically on next toggle-on.
      const sourceSkill = resolveBundledSkillManifest("hermes");
      const destSkill = path.join(HERMES_BONZAI_SKILL_DIR, "SKILL.md");
      if (sourceSkill && fs.existsSync(sourceSkill)) {
        fs.copyFileSync(sourceSkill, destSkill);
      } else {
        console.warn("[Hermes] SKILL.md not found in bundled resources — toggle proceeding but skill file not installed");
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

function resolveFfmpegPath() {
  const exe = process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
  const arch = process.arch;
  const platform = process.platform;
  const candidates = [
    process.env.FFMPEG_BIN,
    path.join(app.getAppPath(), "node_modules", "ffmpeg-static-electron-forge", "dist", "bin", platform, arch, exe),
    path.join(app.getAppPath(), "app.asar.unpacked", "node_modules", "ffmpeg-static-electron-forge", "dist", "bin", platform, arch, exe),
    path.join(process.resourcesPath || "", exe),
    path.join(process.resourcesPath || "", "app.asar.unpacked", "node_modules", "ffmpeg-static-electron-forge", "dist", "bin", platform, arch, exe),
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      try {
        fs.chmodSync(candidate, 0o755);
      } catch {}
      return candidate;
    }
  }
  return exe;
}

function sourceExtension(source, fallback) {
  const value = String(source || "");
  const dataMatch = value.match(/^data:([^;,]+)/i);
  if (dataMatch) {
    if (dataMatch[1].includes("png")) return "png";
    if (dataMatch[1].includes("jpeg") || dataMatch[1].includes("jpg")) return "jpg";
    if (dataMatch[1].includes("mpeg")) return "mp3";
    if (dataMatch[1].includes("wav")) return "wav";
    if (dataMatch[1].includes("mp4")) return "mp4";
  }
  try {
    const pathname = value.startsWith("http") ? new URL(value).pathname : value;
    const ext = path.extname(pathname).replace(".", "");
    return ext || fallback;
  } catch {
    return fallback;
  }
}

async function readMediaSource(source) {
  const value = String(source || "");
  if (!value) throw new Error("Missing media source");
  if (value.startsWith("data:")) {
    const b64 = value.split(",")[1] || "";
    return Buffer.from(b64, "base64");
  }
  if (/^https?:\/\//i.test(value)) {
    const response = await fetch(value);
    if (!response.ok) throw new Error(`Failed to fetch media source: ${response.status}`);
    return Buffer.from(await response.arrayBuffer());
  }
  return fs.promises.readFile(value);
}

function formatAssTime(seconds) {
  const safe = Math.max(0, Number(seconds) || 0);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const secs = Math.floor(safe % 60);
  const centis = Math.floor((safe - Math.floor(safe)) * 100);
  return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${String(centis).padStart(2, "0")}`;
}

function escapeAssText(value) {
  return String(value || "")
    .replace(/[{}]/g, "")
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, " ")
    .trim();
}

function splitCaptionLines(script) {
  const words = String(script || "")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .split(/\s+/)
    .map((word) => word.trim())
    .filter(Boolean);
  const lines = [];
  let line = [];
  for (const word of words) {
    line.push(word);
    const endsPhrase = /[.!?;:]$/.test(word);
    if (line.length >= 4 || (line.length >= 2 && endsPhrase)) {
      lines.push(line);
      line = [];
    }
  }
  if (line.length) lines.push(line);
  return lines;
}

function buildKaraokeAss(script, durationSeconds, watermark = "BonzAI") {
  const lines = splitCaptionLines(script);
  const totalWords = Math.max(1, lines.reduce((sum, line) => sum + line.length, 0));
  const totalCentis = Math.max(100, Math.round(Math.max(1, durationSeconds) * 100));
  const leadSeconds = 0.28;
  let cursor = 0;
  const events = lines.map((line) => {
    const lineCentis = Math.max(80, Math.round((line.length / totalWords) * totalCentis));
    const start = Math.max(0, (cursor / 100) - leadSeconds);
    const end = Math.min(durationSeconds, ((cursor + lineCentis + 12) / 100) - leadSeconds);
    const perWord = Math.max(12, Math.round(lineCentis / Math.max(1, line.length)));
    cursor += lineCentis;
    const text = line.map((word) => `{\\k${perWord}}${escapeAssText(word)}`).join(" ");
    return `Dialogue: 0,${formatAssTime(start)},${formatAssTime(end)},Karaoke,,0,0,0,,{\\an2\\pos(540,1450)\\fad(60,90)}${text}`;
  });

  return `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Karaoke,Fira Sans Condensed,76,&H00FFFFFF,&H008A5CFF,&HCC0B0B12,&H88000000,-1,-1,0,0,100,100,0,0,1,6,0,2,96,96,270,1
Style: Watermark,Fira Sans Condensed,36,&H44FFFFFF,&H44FFFFFF,&H99000000,&H66000000,-1,-1,0,0,100,100,0,0,1,2,1,3,80,54,58,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${events.join("\n")}
Dialogue: 1,${formatAssTime(0)},${formatAssTime(durationSeconds)},Watermark,,0,0,0,,${escapeAssText(watermark)}
`;
}

function escapeFilterPath(value) {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\\'");
}

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const ffmpeg = child_process.spawn(resolveFfmpegPath(), args, { windowsHide: true });
    let stderr = "";
    ffmpeg.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    ffmpeg.on("error", reject);
    ffmpeg.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(stderr.slice(-3000) || `ffmpeg exited with code ${code}`));
      }
    });
  });
}

ipcMain.handle("meditation-export-video", async (_event, payload = {}) => {
  const defaultName = payload.defaultName || "bonzai-meditation.mp4";
  const { canceled, filePath } = await dialog.showSaveDialog({
    defaultPath: defaultName,
    filters: [{ name: "Video", extensions: ["mp4"] }],
  });
  if (canceled || !filePath) return { success: false };

  const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "bonzai-meditation-"));
  try {
    const imageExt = sourceExtension(payload.imageSource, "png");
    const audioExt = sourceExtension(payload.audioSource, "wav");
    const imagePath = path.join(tmpDir, `scene.${imageExt}`);
    const audioPath = path.join(tmpDir, `narration.${audioExt}`);
    const assPath = path.join(tmpDir, "karaoke.ass");

    await fs.promises.writeFile(imagePath, await readMediaSource(payload.imageSource));
    await fs.promises.writeFile(audioPath, await readMediaSource(payload.audioSource));

    const durationSeconds = Math.max(1, Math.round(Number(payload.durationSeconds) || 30));
    await fs.promises.writeFile(assPath, buildKaraokeAss(payload.script || "", durationSeconds, payload.watermark || "BonzAI"), "utf8");

    const ass = escapeFilterPath(assPath);
    const frameCount = Math.max(30, durationSeconds * 30);
    const filter = [
      "scale=1080:1920:force_original_aspect_ratio=increase",
      "crop=1080:1920",
      `zoompan=z='1+0.055*on/${frameCount}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frameCount}:s=1080x1920:fps=30`,
      "format=yuv420p",
      `subtitles='${ass}'`,
    ].join(",");

    await runFfmpeg([
      "-y",
      "-loop", "1",
      "-framerate", "30",
      "-t", String(durationSeconds),
      "-i", imagePath,
      "-i", audioPath,
      "-vf", filter,
      "-map", "0:v:0",
      "-map", "1:a:0",
      "-c:v", "libx264",
      "-profile:v", "baseline",
      "-level", "4.0",
      "-pix_fmt", "yuv420p",
      "-preset", "veryfast",
      "-crf", "19",
      "-c:a", "aac",
      "-b:a", "192k",
      "-ar", "48000",
      "-ac", "2",
      "-shortest",
      "-movflags", "+faststart",
      "-brand", "mp42",
      filePath,
    ]);

    return { success: true, path: filePath };
  } catch (e) {
    console.error("[meditation-export-video] Error:", e);
    return { success: false, error: e.message };
  } finally {
    try {
      await fs.promises.rm(tmpDir, { recursive: true, force: true });
    } catch {}
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
// LLM backend is llama-server (see services/llamaServer.manager.js).
// currentLoadedModel holds the metadata of whichever model the subprocess is
// currently serving; it is null when nothing is loaded.
let currentLoadedModel = null;
let alwaysLoadedEnabled = false; // When true, model stays in memory (still allows hot-swap)
let currentSystemPrompt = null;  // Optional system prompt prepended to chat history

/**
 * Spec of the most recently loaded model — preserved across unload
 * cycles so `ensureLocalLLMReady()` can auto-respawn it. The legacy
 * node-llama-cpp era kept the LLM effectively always-available; with
 * llama-server we aggressively unload to share GPU memory with
 * diffusion / TTS pipelines, but we still need the next text turn
 * (e.g. the user typing the next message after a TTS+image cycle in
 * RoleplayChat) to bring the same model back automatically.
 *
 * Hydrated on app boot from electron-store and updated on every
 * successful loadModel(). Never cleared by unloadModel.
 */
let lastLoadedSpec = null;
try {
  // store may not be in scope yet at module evaluation; the actual
  // hydration runs in the app-ready hook below.
} catch {}

// Query current loaded model and always-loaded setting
ipcMain.handle("model-get-loaded", () => {
  if (!currentLoadedModel) return null;
  return {
    filename: currentLoadedModel.filename,
    modelname: currentLoadedModel.modelname || resolveModelName(currentLoadedModel.filename),
    parameters: currentLoadedModel.parameters,
    context: currentLoadedModel.context,
    isMultimodal: currentLoadedModel.isMultimodal || false,
    model_provenance: currentLoadedModel.model_provenance || currentLoadedModel.provenance || null,
    provenance: currentLoadedModel.provenance || currentLoadedModel.model_provenance || null,
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
ipcMain.handle("model-ensure", ensureModel);
ipcMain.handle("model-unload", unloadModel);
ipcMain.handle("model-chat", chat);
ipcMain.handle("model-chat-stream", chatStream);
ipcMain.handle("zhc-chat-stream", chatStreamStateless);
ipcMain.handle("usage:get-lifetime-tokens", getLifetimeTokenUsage);
ipcMain.handle("model-abort-chat-stream", (event) => {
  const aborted = _abortChat(event.sender.id);
  if (!aborted) {
    // Fallback: if no tracked controller, try to stop the llama-server
    // subprocess directly (covers edge cases where stream tracking
    // desynchronised).
    try { llamaServer.stopModel({ force: false }); } catch { /* best-effort abort fallback */ }
  }
  return aborted;
});
ipcMain.handle("model-chat-vision", chatWithVision);
ipcMain.handle("model-reset-chat", () => {
  chatHistory = [];
  console.log("[LLM] Chat history reset");
  return true;
});
ipcMain.handle("model-set-system-prompt", (_event, prompt) => {
  currentSystemPrompt = (prompt && typeof prompt === "string") ? prompt : null;
  chatHistory = [];
  return true;
});
ipcMain.handle("model-check-mmproj", checkMmproj);
ipcMain.handle("model-download-mmproj", downloadMmproj);

/**
 * Multi-instance llama-server pool — used by the Company feature when
 * `execution.llm.mode === "parallel"`. Each company role can be bound
 * to a specific model; the pool keeps several `llama-server` processes
 * alive simultaneously (one per modelKey) up to a memory budget,
 * evicting LRU when it overflows.
 *
 * Pool runs alongside the legacy single-instance `llamaServer.manager`
 * — they don't share processes. The "main" model the user loaded via
 * Chat tab keeps using the legacy manager; the pool only fires when
 * a company explicitly asks for it.
 */
let _pool = null;
async function _getPool() {
  if (_pool) return _pool;
  const poolPath = app.isPackaged
    ? path.join(app.getAppPath(), "src", "services", "llamaServer.pool.js")
    : path.resolve("src/services/llamaServer.pool.js");
  _pool = await import(pathToFileURL(poolPath).href);
  if (_pool?.configure) _pool.configure({ resourcesPath: app.isPackaged ? process.resourcesPath : null });
  return _pool;
}

const BONZAI_VISION_MODEL = Object.freeze({
  key: "bonzai_vision_qwen35_08b",
  filename: "meetara-qwen3.5-0.8b-q4_k_m.gguf",
  mmproj: "meetara-vl-qwen3.5-0.8b.gguf",
});

async function runCrossPlatformVision({ image_base64, image, prompt, max_tokens } = {}) {
  const encoded = image_base64 || image;
  if (!encoded) throw new Error("image_base64 is required");
  const modelPath = path.join(MODEL_DIR, BONZAI_VISION_MODEL.filename);
  const mmprojPath = path.join(MODEL_DIR, BONZAI_VISION_MODEL.mmproj);
  if (!fs.existsSync(modelPath) || !fs.existsSync(mmprojPath)) {
    throw new Error("Cross-platform vision assets are not downloaded");
  }

  const pool = await _getPool();
  const sizeBytes = Math.round(
    (fs.statSync(modelPath).size + fs.statSync(mmprojPath).size) * 1.25,
  );
  pool.registerModelPath(BONZAI_VISION_MODEL.key, modelPath, sizeBytes, {
    ctxSize: 4096,
    context: 4096,
    mmprojPath,
  });
  const dataUrl = String(encoded).startsWith("data:")
    ? String(encoded)
    : `data:image/jpeg;base64,${encoded}`;
  const text = await pool.chat({
    modelKey: BONZAI_VISION_MODEL.key,
    maxTokens: Number(max_tokens) || 512,
    temperature: 0.1,
    messages: [{
      role: "user",
      content: [
        { type: "text", text: prompt || "Describe this image in detail." },
        { type: "image_url", image_url: { url: dataUrl } },
      ],
    }],
  });
  recordLifetimeTokenUsage({
    messages: [{ role: "user", content: [{ type: "text", text: prompt || "Describe this image in detail." }] }],
    output: text,
  });
  return String(text).replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}

ipcMain.handle("pool-configure", async (_event, opts) => {
  const pool = await _getPool();
  pool.configure(opts || {});
  return { ok: true };
});

ipcMain.handle("pool-register-model", async (_event, opts) => {
  const { modelKey, filename, sizeBytes, parameters, activeParameters, isMoE, context, parallelSlots, chatTemplate, specType, specDraftNMax, mtp } = opts || {};
  const pool = await _getPool();
  const modelPath = path.join(MODEL_DIR, filename);
  if (!fs.existsSync(modelPath)) {
    return { ok: false, error: `model file not found: ${modelPath}` };
  }
  // Run the same memory-aware context heuristic the singleton uses so
  // each pool instance respects per-model + per-system memory limits.
  const sysInfo = await systemInformation();
  const heuristicCtx = computeMaxContextForModel(
    { filename, parameters, activeParameters, isMoE, context, mmproj: opts?.mmproj || null },
    sysInfo,
  );
  const ctxSize = Math.min(heuristicCtx || 8192, context || heuristicCtx || 8192);
  pool.registerModelPath(modelKey, modelPath, sizeBytes, {
    ctxSize, parameters, activeParameters, isMoE, context, parallelSlots, chatTemplate, specType, specDraftNMax, mtp,
  });
  return { ok: true, ctxSize };
});

ipcMain.handle("pool-chat", async (_event, opts) => {
  const pool = await _getPool();
  try {
    const text = await pool.chat(opts);
    recordLifetimeTokenUsage({ messages: opts?.messages || [], output: text });
    return { ok: true, text };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle("pool-ensure", async (_event, opts) => {
  const { modelKey, filename, sizeBytes, parameters, activeParameters, isMoE, context, parallelSlots, chatTemplate, specType, specDraftNMax, mtp } = opts || {};
  const pool = await _getPool();
  const modelPath = path.join(MODEL_DIR, filename);
  if (!fs.existsSync(modelPath)) {
    return { ok: false, error: `model file not found: ${modelPath}` };
  }
  const sysInfo = await systemInformation();
  const heuristicCtx = computeMaxContextForModel(
    { filename, parameters, activeParameters, isMoE, context },
    sysInfo,
  );
  const ctxSize = Math.min(heuristicCtx || 8192, context || heuristicCtx || 8192);
  pool.registerModelPath(modelKey, modelPath, sizeBytes, {
    ctxSize, parameters, activeParameters, isMoE, context, parallelSlots, chatTemplate, specType, specDraftNMax, mtp,
  });
  await pool.acquire({ modelKey, modelPath, sizeBytes, ctxSize, parallelSlots, chatTemplate, specType, specDraftNMax, mtp });
  return { ok: true, ctxSize };
});

ipcMain.handle("pool-inventory", async () => {
  try {
    const pool = await _getPool();
    return { ok: true, instances: pool.inventory(), totalBytes: pool.totalBytes(), budgetBytes: pool.budgetBytes() };
  } catch (err) {
    console.error("[Pool] inventory failed:", err);
    return {
      ok: false,
      instances: [],
      totalBytes: 0,
      budgetBytes: 0,
      error: err?.message || "Pool inventory unavailable",
    };
  }
});

ipcMain.handle("pool-shutdown", async () => {
  if (_pool) await _pool.shutdown();
  return { ok: true };
});

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
function isTrustedRendererUrl(url = "") {
  if (!url) return false;
  if (url.startsWith("file://")) return true;
  if (VITE_DEV_SERVER_URL && url.startsWith(VITE_DEV_SERVER_URL)) return true;
  return /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:\/|$)/.test(url);
}

function configureRendererPermissions() {
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback, details = {}) => {
    const requestingUrl = details.requestingUrl || webContents.getURL();
    const mediaTypes = Array.isArray(details.mediaTypes) ? details.mediaTypes : [];
    const isMediaPermission =
      permission === "media" ||
      permission === "microphone" ||
      permission === "audioCapture";
    const isAppMediaRequest =
      mediaTypes.length === 0 ||
      mediaTypes.includes("audio") ||
      mediaTypes.includes("video");
    callback(isTrustedRendererUrl(requestingUrl) && isMediaPermission && isAppMediaRequest);
  });

  session.defaultSession.setPermissionCheckHandler((webContents, permission, requestingOrigin, details = {}) => {
    const requestingUrl = requestingOrigin || details.requestingUrl || webContents.getURL();
    const mediaTypes = Array.isArray(details.mediaTypes) ? details.mediaTypes : [];
    const isMediaPermission =
      permission === "media" ||
      permission === "microphone" ||
      permission === "audioCapture";
    const isAppMediaRequest =
      mediaTypes.length === 0 ||
      mediaTypes.includes("audio") ||
      mediaTypes.includes("video");
    return isTrustedRendererUrl(requestingUrl) && isMediaPermission && isAppMediaRequest;
  });
}

app.on("ready", async () => {
  configureRendererPermissions();

  const flaskURL = `http://127.0.0.1:${PY_SERVER_PORT}`;

  // Hydrate the last-loaded LLM spec so RoleplayChat / Generative Text
  // / ZHC can auto-respawn the user's previous model after a quit +
  // reopen mid-conversation. Treated as best-effort — corrupt JSON
  // just leaves the slot null and the user picks a model normally.
  try {
    const stored = store.get("llm.lastLoadedSpec", null);
    if (stored?.filename) {
      lastLoadedSpec = stored;
      console.log(`[Startup] hydrated lastLoadedSpec: ${stored.filename}`);
    }
  } catch (err) {
    console.warn("[Startup] lastLoadedSpec hydrate failed:", err?.message);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Local data layer — open SQLite, take a launch-time snapshot, run
  // any unapplied migrations. Errors here ABORT the boot intentionally:
  // running on a half-migrated schema risks data corruption.
  // ─────────────────────────────────────────────────────────────────────────────
  try {
    const dbConn = await import("./main/db/connection.js");
    const dbMigrate = await import("./main/db/migrate.js");
    const dbSnap = await import("./main/db/snapshots.js");
    const dbIpc = await import("./main/ipc/db.js");
    const dbStoreImport = await import("./main/db/import-from-store.js");
    const { dbPath } = dbConn.open();
    console.log(`[Startup] DB open at ${dbPath}`);
    try { dbSnap.takeBootSnapshot(); } catch (err) { console.warn("[Startup] snapshot failed:", err?.message); }
    const result = dbMigrate.runMigrations();
    if (result.applied.length) console.log(`[Startup] applied ${result.applied.length} migrations`);
    if (result.skipped.length) console.log(`[Startup] ${result.skipped.length} migrations already applied`);
    dbIpc.registerDbIpc();
    // First-boot one-shot: copy each domain's data from electron-store
    // into SQLite. Idempotent — flagged per-table in store.
    try { await dbStoreImport.runFirstBootImport(store); }
    catch (err) { console.warn("[Startup] store→sqlite import warning:", err?.message); }

    // Run a repair pass on every boot: recompute roleplay_sessions
    // content_level + modes from the immutable session id. Cheap (one
    // pass + a couple of UPDATEs at most) and idempotent.
    try {
      const roleplayRepo = await import("./main/db/repos/roleplay.js");
      const stats = roleplayRepo.repairContentLevelsFromKey();
      if (stats.updated) {
        console.log(
          `[Startup] roleplay content-level repair: scanned ${stats.scanned}, ` +
          `updated ${stats.updated} (${stats.mismatched} drifted, ${stats.nullFilled} null)`,
        );
      }
    } catch (err) { console.warn("[Startup] content-level repair warning:", err?.message); }
  } catch (err) {
    // Distinguish "deps not installed" from real DB errors so the user
    // gets an actionable message instead of a stack trace.
    const isMissingDep = err?.code === "ERR_MODULE_NOT_FOUND"
      || /Cannot find package '(better-sqlite3|drizzle-orm|sqlite-vec)'/.test(err?.message || "");
    if (isMissingDep) {
      console.error(
        "\n══════════════════════════════════════════════════════════════════\n" +
        "[Startup] Local data layer dependencies are missing.\n" +
        "          Run:  npm install\n" +
        "          (then restart the app)\n" +
        "\n" +
        "          The app will keep booting. Generative Text, RoleplayChat,\n" +
        "          skills, and wallet are unaffected — they don't depend on\n" +
        "          the new SQLite layer.\n" +
        "\n" +
        "          ZHC's audit-log-derived views (Live feed, KPIs, Trail)\n" +
        "          will read empty and audit writes will silently drop\n" +
        "          until the install completes.\n" +
        "══════════════════════════════════════════════════════════════════\n",
      );
    } else {
      console.error("[Startup] DB bootstrap failed:", err);
    }
    // Defer crashing — the rest of the app boots, but data-layer IPC
    // calls will fail with clear errors. Lets the user open the app
    // and see the failure rather than a black window.
  }

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
      if (llamaServer.isRunning()) {
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

    // Fresh context for the describe run — no accumulated history.
    chatHistory = [];
    console.log("[synth-describe] Prompting with", promptText.length, "chars");

    const describeResult = await llamaServer.chat({
      messages: [{ role: "user", content: promptText }],
      maxTokens: 1024,
      temperature: 0.2,
    });
    const rawOutput = (describeResult.choices?.[0]?.message?.content ?? "").trim();
    recordLifetimeTokenUsage({
      messages: [{ role: "user", content: promptText }],
      output: rawOutput,
      usage: describeResult.usage,
    });

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

// Cached system info — refreshed periodically
let _cachedSystemInfo = null;

async function systemInformation() {
  // Instant result from os module (never fails, never hangs)
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const ip = getLocalIP();

  // Compute memBudget: available memory for AI inference
  // Apple Silicon unified memory: 70% headroom. Discrete GPU: 80% of RAM.
  const isMac = process.platform === "darwin";
  const memBudget = Math.floor((isMac ? totalMem * 0.7 : totalMem * 0.8));

  const result = {
    ram: totalMem,
    ramAvailable: freeMem,
    memBudget,
    gpu: "Unknown",
    vram: 0,
    ip,
  };

  // Merge cached detailed info if available
  if (_cachedSystemInfo) {
    Object.assign(result, _cachedSystemInfo);
    // Update live memory values
    result.ramAvailable = freeMem;
    result.memBudget = memBudget;
  }

  // Fetch detailed info in background (si.mem, si.graphics, si.cpu, si.osInfo)
  // Only once — subsequent calls use cache + live os.freemem()
  if (!_cachedSystemInfo) {
    (async () => {
      try {
        const [mem, gfx, cpu, osInfo] = await Promise.all([
          si.mem().catch(() => null),
          si.graphics().catch(() => null),
          si.cpu().catch(() => null),
          si.osInfo().catch(() => null),
        ]);
        _cachedSystemInfo = {};
        if (gfx?.controllers?.[0]) {
          _cachedSystemInfo.gpu = gfx.controllers[0].model || "Unknown";
          _cachedSystemInfo.vram = gfx.controllers[0].vram || 0;
        }
        if (cpu) {
          _cachedSystemInfo.cpu = `${cpu.manufacturer} ${cpu.brand}`;
          _cachedSystemInfo.cpuCores = cpu.physicalCores;
          _cachedSystemInfo.cpuThreads = cpu.cores;
          _cachedSystemInfo.cpuSpeed = cpu.speed;
        }
        if (osInfo) {
          _cachedSystemInfo.os = `${osInfo.distro} ${osInfo.release}`;
          _cachedSystemInfo.arch = osInfo.arch;
          _cachedSystemInfo.platform = osInfo.platform;
        }
        console.log("[SystemInfo] Detailed info cached:", _cachedSystemInfo.gpu, _cachedSystemInfo.cpu);
      } catch (e) {
        console.warn("[SystemInfo] Background fetch failed:", e.message);
      }
    })();
  }

  return result;
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
const activeDownloadItems = new Map(); // filename -> Electron DownloadItem

function getActiveDownloads() {
  return Array.from(activeDownloads.entries()).map(([filename, data]) => ({
    filename,
    ...data,
  }));
}

function customModelCatalogPath() {
  return path.join(MODEL_DIR, "custom-models.json");
}

function readCustomModelCatalog() {
  try {
    const file = customModelCatalogPath();
    if (!fs.existsSync(file)) return [];
    const rows = JSON.parse(fs.readFileSync(file, "utf8"));
    return Array.isArray(rows) ? rows : [];
  } catch (error) {
    console.warn("[Custom GGUF] Failed to read catalog:", error.message);
    return [];
  }
}

function writeCustomModelCatalog(rows) {
  fs.mkdirSync(MODEL_DIR, { recursive: true });
  fs.writeFileSync(customModelCatalogPath(), JSON.stringify(rows, null, 2));
}

function listCustomModels() {
  return readCustomModelCatalog().map((model) => ({
    ...model,
    available: fs.existsSync(path.join(MODEL_DIR, normalizeModelFilename(model.filename))),
  }));
}

function removeCustomModelFromCatalog(filename) {
  const normalized = normalizeModelFilename(filename);
  const rows = readCustomModelCatalog();
  const next = rows.filter((model) => normalizeModelFilename(model.filename) !== normalized);
  if (next.length !== rows.length) writeCustomModelCatalog(next);
}

function isLikelyGGUF(filePath) {
  try {
    const fd = fs.openSync(filePath, "r");
    const buf = Buffer.alloc(4);
    fs.readSync(fd, buf, 0, 4, 0);
    fs.closeSync(fd);
    return buf.toString("utf8") === "GGUF";
  } catch {
    return false;
  }
}

function guessCustomModelParameters(name) {
  const match = String(name || "").match(/(\d+(?:\.\d+)?)\s*b/i);
  if (!match) return null;
  return Number(match[1]) * 1e9;
}

function customModelNameFromFilename(filename) {
  return path
    .basename(filename, path.extname(filename))
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

async function importLocalGGUF() {
  const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
  const picked = await dialog.showOpenDialog(win, {
    title: "Import local LLM GGUF model",
    properties: ["openFile"],
    filters: [{ name: "GGUF models", extensions: ["gguf"] }],
  });

  if (picked.canceled || !picked.filePaths?.[0]) return { canceled: true };

  const sourcePath = picked.filePaths[0];
  if (path.extname(sourcePath).toLowerCase() !== ".gguf") {
    return { error: "Choose a .gguf LLM model file." };
  }
  if (!isLikelyGGUF(sourcePath)) {
    return { error: "This file does not look like a valid GGUF LLM model." };
  }

  fs.mkdirSync(MODEL_DIR, { recursive: true });
  const stat = fs.statSync(sourcePath);
  const hash = crypto
    .createHash("sha256")
    .update(`${sourcePath}:${stat.size}:${stat.mtimeMs}`)
    .digest("hex")
    .slice(0, 10);

  let filename = normalizeModelFilename(path.basename(sourcePath));
  let destPath = path.join(MODEL_DIR, filename);
  if (fs.existsSync(destPath)) {
    const existing = fs.statSync(destPath);
    const sameFile = fs.realpathSync(destPath) === fs.realpathSync(sourcePath);
    if (!sameFile && existing.size !== stat.size) {
      filename = normalizeModelFilename(`custom-${hash}-${path.basename(sourcePath)}`);
      destPath = path.join(MODEL_DIR, filename);
    }
  }

  if (!fs.existsSync(destPath) || fs.realpathSync(sourcePath) !== fs.realpathSync(destPath)) {
    fs.copyFileSync(sourcePath, destPath);
  }

  const parameters = guessCustomModelParameters(filename);
  const spec = {
    key: `custom_${hash}`,
    custom: true,
    type: "llm",
    source: "local",
    sourcePath,
    filename,
    modelname: customModelNameFromFilename(filename),
    name: customModelNameFromFilename(filename),
    filesize: stat.size >= 1e9 ? `${(stat.size / 1e9).toFixed(1)} GB` : `${Math.round(stat.size / 1e6)} MB`,
    filesizeBytes: stat.size,
    size: stat.size >= 1e9 ? `${(stat.size / 1e9).toFixed(1)} GB` : `${Math.round(stat.size / 1e6)} MB`,
    parameters,
    context: 32768,
    isMoE: false,
    license: "User-supplied; governed by the original model license",
    licenseUrl: "",
    importedAt: new Date().toISOString(),
  };

  const rows = readCustomModelCatalog();
  const next = rows.filter((model) => normalizeModelFilename(model.filename) !== filename);
  next.unshift(spec);
  writeCustomModelCatalog(next);

  return spec;
}

ipcMain.handle("get-active-downloads", () => getActiveDownloads());
ipcMain.handle("model-list-custom", () => listCustomModels());
ipcMain.handle("model-import-gguf", importLocalGGUF);

ipcMain.handle("model-download-cancel", (_event, filename) => {
  const normalizedFilename = normalizeModelFilename(filename);
  const item = activeDownloadItems.get(normalizedFilename);
  if (!item) return false;
  activeDownloads.set(normalizedFilename, {
    ...(activeDownloads.get(normalizedFilename) || {}),
    status: "canceling",
  });
  try {
    item.cancel();
    return true;
  } catch (error) {
    console.warn("[Model Download] Cancel failed:", normalizedFilename, error.message);
    activeDownloadItems.delete(normalizedFilename);
    return false;
  }
});

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
  activeDownloadItems.delete(normalizedFilename);

  try {
    const dl = await download(win, url, {
      filename: normalizedFilename,
      directory: MODEL_DIR,
      showBadge: false,
      onStarted: (item) => {
        activeDownloadItems.set(normalizedFilename, item);
      },
      onProgress: (p) => {
        const pct = p.percent;
        win.setProgressBar(pct);
        win.webContents.send("download-progress", { filename: normalizedFilename, percent: pct });
        // Update tracking
        activeDownloads.set(normalizedFilename, { url, percent: pct, status: "downloading" });
      },
      onCancel: () => {
        win.webContents.send("download-progress", {
          filename: normalizedFilename,
          percent: 0,
          status: "canceled",
        });
      },
    });
    win.setProgressBar(-1);
    // Remove from tracking on completion
    activeDownloads.delete(normalizedFilename);
    activeDownloadItems.delete(normalizedFilename);
    return { savedPath: dl.getSavePath() };
  } catch (error) {
    console.error("Download failed:", error);
    win?.setProgressBar(-1);
    // Remove from tracking on failure
    activeDownloads.delete(normalizedFilename);
    activeDownloadItems.delete(normalizedFilename);
    if (error instanceof CancelError) {
      return { canceled: true };
    }
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
  activeDownloads.set(mergedFilename, { url: baseUrl, percent: 0, status: "downloading" });
  activeDownloadItems.delete(mergedFilename);

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
        onStarted: (item) => {
          activeDownloadItems.set(mergedFilename, item);
        },
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
          activeDownloads.set(mergedFilename, {
            url: baseUrl,
            percent: overallPct,
            status: "downloading",
            part: partNum,
            totalParts,
          });
        },
        onCancel: () => {
          win.webContents.send("download-progress", {
            filename: mergedFilename,
            percent: 0,
            part: partNum,
            totalParts,
            phase: "downloading",
            status: "canceled",
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
    activeDownloads.delete(mergedFilename);
    activeDownloadItems.delete(mergedFilename);
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
    activeDownloads.delete(mergedFilename);
    activeDownloadItems.delete(mergedFilename);
    if (error instanceof CancelError) {
      return { canceled: true, isMultiPart: true };
    }
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
        removeCustomModelFromCatalog(mergedFilename);
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
    removeCustomModelFromCatalog(normalizedName);
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

  const vramMB = sysInfo.vram || 0;
  const vramGB = vramMB / 1024;

  const modelMaxCtx = currentModel.context || 4096;

  const isMac = process.platform === "darwin";
  const isUnified = isMac && vramMB === 0; // typical for Apple Silicon

  // On unified memory, `os.freemem()` / `sysInfo.ramAvailable` reports only
  // "inactive" RAM — macOS counts cached pages as in-use, so on a 64GB Mac
  // under normal load freemem can report <200MB while there are tens of GB
  // of evictable cache. That bogus reading collapsed memBudget to ~0 and
  // forced context to the minimum fallback (512).
  //
  // The KV-cache allocation itself triggers page reclamation when pressured,
  // so budgeting from total RAM × a headroom factor is safer than trusting
  // a live "free" number. On discrete-VRAM systems we still want freemem
  // so we don't fill host RAM that the user needs for the desktop.
  const ramTotalGB = (sysInfo.ram || 0) / 1024 ** 3;
  const ramFreeGB = (sysInfo.ramAvailable || sysInfo.ram || 0) / 1024 ** 3;
  const ramGB = isUnified ? ramTotalGB : ramFreeGB;

  // 1. Memory budget — how much RAM/VRAM we can safely use
  let memBudgetGB;
  if (isUnified) {
    memBudgetGB = ramGB * 0.7; // 30% headroom for OS + apps (against TOTAL)
  } else if (vramGB > 0) {
    memBudgetGB = Math.min(ramGB * 0.8, vramGB * 0.8);
  } else {
    memBudgetGB = ramGB * 0.8; // CPU-only, discrete system, use free RAM
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
  "nemomix-unleashed-12b-heretic": { parameters: 12e9, context: 131072 },
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
  "qwen3.5-0.8b":                   { parameters: 0.8e9, context: 131072 },
  "qwen3.5-2b":                     { parameters: 2e9, context: 131072 },
  "qwen3.5-4b":                     { parameters: 4e9, context: 262144 },
  "qwen3.5-9b-deepseek-v4-flash":   { parameters: 9e9, context: 131072 },
  "qwen3.5-9b":                     { parameters: 9e9, context: 262144 },
  "qwen3.5-27b":                    { parameters: 27e9, activeParameters: 8e9, context: 262144 },
  "qwen3.6-27b":                    { parameters: 27e9, context: 262144 },
  "qwen3.5-35b-a3b":                { parameters: 35e9, activeParameters: 3e9, isMoE: true, context: 262144 },
  "qwen3.6-35b-a3b":                { parameters: 35e9, activeParameters: 3e9, isMoE: true, context: 262144 },
  "qwen3.5-122b-a10b":              { parameters: 122e9, activeParameters: 10e9, isMoE: true, context: 262144 },
  "qwen3.5-397b-a17b":              { parameters: 397e9, activeParameters: 17e9, isMoE: true, context: 262144 },
  "kimi-k2.5":                      { parameters: 1000e9, activeParameters: 32e9, isMoE: true, context: 256000 },
  "kimi-k2.6":                      { parameters: 1000e9, activeParameters: 32e9, isMoE: true, context: 256000 },
  "minimax-m2.5":                   { parameters: 229e9, activeParameters: 10e9, isMoE: true, context: 205000 },
  "minimax-m2.7":                   { parameters: 229e9, activeParameters: 10e9, isMoE: true, context: 205000 },
  "minimax-m3":                     { parameters: 229e9, activeParameters: 10e9, isMoE: true, context: 205000 },
  "glm-5.2":                        { parameters: 355e9, activeParameters: 32e9, isMoE: true, context: 131072 },
  "diffusiongemma-26b-a4b":         { parameters: 26e9, activeParameters: 4e9, isMoE: true, context: 32768 },
  "ornith-1.0-9b":                  { parameters: 9e9, context: 131072 },
  "ornith-1.0-35b":                 { parameters: 35e9, activeParameters: 3e9, isMoE: true, context: 131072 },
  "gpt-oss-120b":                   { parameters: 120e9, activeParameters: 5.1e9, isMoE: true, context: 131072 },
  "llama-4-scout-17b-16e":          { parameters: 109e9, activeParameters: 17e9, isMoE: true, context: 10000000 },
  "llama-4-maverick-17b-128e":      { parameters: 400e9, activeParameters: 17e9, isMoE: true, context: 1000000 },
  "glm-5.1":                        { parameters: 355e9, activeParameters: 32e9, isMoE: true, context: 131072 },
  "mistral-small-3.2-24b":          { parameters: 24e9, context: 131072 },
  "devstral-small-2-24b":           { parameters: 24e9, context: 256000 },
  "ministral-3-3b":                 { parameters: 3e9, context: 256000 },
  "ministral-3-14b":                { parameters: 14e9, context: 256000 },
  "ministral-3-8b":                 { parameters: 8e9, context: 256000 },
  "nvidia-nemotron-3-nano-4b":      { parameters: 4e9, context: 131072 },
  "nemotron-3-nano-30b-a3b":        { parameters: 30e9, activeParameters: 3e9, isMoE: true, context: 131072 },
};

// Display name lookup — filename substring → human-readable model name
const MODEL_NAMES = {
  "gemma-3-1b-it":                  "Gemma 3 1B",
  "gemma-3-12b-it":                 "Gemma 3 12B",
  "gpt-oss-20b":                    "GPT-OSS 20B",
  "gpt-oss-120b":                   "GPT-OSS 120B",
  "nousresearch_hermes-4-14b":      "Hermes 4 14B",
  "meta-llama-3.1-8b-instruct":    "LLaMA 3.1 8B",
  "llama-4-scout-17b-16e":         "Llama 4 Scout 17B 16E",
  "llama-4-maverick-17b-128e":     "Llama 4 Maverick 17B 128E",
  "nemomix-unleashed-12b-heretic": "NemoMix Unleashed 12B Heretic",
  "phi-4-mini-instruct":           "Phi-4 Mini 3.8B",
  "glm-4.7-flash-ud-q2":           "GLM 4.7 Flash Q2",
  "glm-4.7-flash-ud-q4":           "GLM 4.7 Flash Q4",
  "glm-4.7-flash-ud-q8":           "GLM 4.7 Flash Q8",
  "glm-5.1":                       "GLM 5.1",
  "qwen3-coder-next":              "Qwen 3 Coder Next 80B",
  "qwen3.5-27b-ud-q2":             "Qwen 3.5 27B MTP Q2",
  "qwen3.5-27b-ud-q4":             "Qwen 3.5 27B MTP Q4",
  "qwen3.5-27b-ud-q8":             "Qwen 3.5 27B MTP Q8",
  "qwen3.6-27b-ud-q2":             "Qwen 3.6 27B MTP Q2",
  "qwen3.6-27b-ud-q4":             "Qwen 3.6 27B MTP Q4",
  "qwen3.6-27b-ud-q8":             "Qwen 3.6 27B MTP Q8",
  "qwen3.5-9b-deepseek-v4-flash":  "Qwen 3.5 9B DeepSeek V4 Flash",
  "qwen3.5-9b":                    "Qwen 3.5 9B MTP",
  "qwen3.5-0.8b":                  "Qwen 3.5 0.8B MTP",
  "qwen3.5-2b":                    "Qwen 3.5 2B MTP",
  "qwen3.5-4b":                    "Qwen 3.5 4B MTP",
  "qwen3.5-35b-a3b-ud-q2":         "Qwen 3.5 35B A3B MTP Q2",
  "qwen3.5-35b-a3b-ud-q4":         "Qwen 3.5 35B A3B MTP Q4",
  "qwen3.5-35b-a3b-ud-q8":         "Qwen 3.5 35B A3B MTP Q8",
  "qwen3.6-35b-a3b-ud-q2":         "Qwen 3.6 35B A3B MTP Q2",
  "qwen3.6-35b-a3b-ud-q4":         "Qwen 3.6 35B A3B MTP Q4",
  "qwen3.6-35b-a3b-ud-q8":         "Qwen 3.6 35B A3B MTP Q8",
  "qwen3.5-122b-a10b-ud-q2":       "Qwen 3.5 122B A10B MTP Q2",
  "qwen3.5-122b-a10b-ud-q4":       "Qwen 3.5 122B A10B MTP Q4",
  "qwen3.5-122b-a10b-ud-q8":       "Qwen 3.5 122B A10B MTP Q8",
  "qwen3.5-397b-a17b-ud-q2":       "Qwen 3.5 397B A17B MTP Q2",
  "qwen3.5-397b-a17b-ud-q4":       "Qwen 3.5 397B A17B MTP Q4",
  "qwen3.5-397b-a17b-ud-q8":       "Qwen 3.5 397B A17B MTP Q8",
  "kimi-k2.5":                     "Kimi K2.5 Q4",
  "kimi-k2.6":                     "Kimi K2.6",
  "minimax-m2.5":                  "MiniMax M2.5 Q4",
  "minimax-m2.7":                  "MiniMax M2.7",
  "minimax-m3":                    "MiniMax M3",
  "glm-5.2":                       "GLM 5.2",
  "diffusiongemma-26b-a4b":        "DiffusionGemma 26B A4B",
  "ornith-1.0-9b":                 "Ornith 1.0 9B",
  "ornith-1.0-35b":                "Ornith 1.0 35B",
  "mistral-small-3.2-24b":         "Mistral Small 3.2 24B",
  "devstral-small-2-24b":          "Devstral Small 2 24B",
  "ministral-3-3b":                "Ministral 3 3B",
  "ministral-3-14b-reasoning":     "Ministral 3 14B Reasoning",
  "ministral-3-8b":                "Ministral 8B",
  "nvidia-nemotron-3-nano-4b":     "Nemotron 3 Nano 4B",
  "nemotron-3-nano-30b-a3b":       "Nemotron 3 Nano 30B A3B",
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

/**
 * Ensure a specific LLM is loaded and ready before a caller dispatches
 * a chat request. Idempotent — short-circuits if the requested model is
 * already loaded. Used by ZHC's dispatcher so company heartbeats can
 * spawn their preferred model on demand without forcing the user to
 * load a model in Generative Text first.
 *
 * Accepts either:
 *   - a model key string like "llm_qwen_3_6_35b_a3b_q4"
 *   - a partial spec object { filename, parameters?, context?, mmproj? }
 *
 * Resolves keys via flagship.js's resolveLLM() to get a real filename +
 * spec, runs the existing context-size heuristic, then routes through
 * the same loadModel() the user-facing Generative Text flow uses.
 *
 * @returns {{ ok: boolean, port?: number, filename?: string, error?: string }}
 */
async function ensureModel(_event, modelOrKey) {
  try {
    let spec = null;

    // Already loaded match → short-circuit. We compare on filename, the
    // only field both code paths agree on.
    if (typeof modelOrKey === "string") {
      // Resolve the llm_* key → filename via flagship's resolver. Format:
      // "llm_<baseKey>" or "llm_<baseKey>_q<tier>" (default tier = q4).
      const m = modelOrKey.match(/^llm_(.+?)(?:_q(\d+))?$/);
      if (!m) return { ok: false, error: `unrecognized model key: ${modelOrKey}` };
      const baseKey = m[1];
      const tier = m[2] ? `q${m[2]}` : "q4";

      // Lazy import — flagship.js is large, don't drag it into hot paths.
      let resolved = null;
      try {
        const flagship = await import(path.join(__dirname, "..", "src", "skills", "flagship.js"))
          .catch(() => import("file:///" + path.resolve("src/skills/flagship.js")));
        if (typeof flagship.resolveLLM === "function") {
          resolved = flagship.resolveLLM(baseKey, tier);
        }
      } catch (err) {
        return { ok: false, error: `flagship import failed: ${err.message}` };
      }
      if (!resolved?.filename) {
        return { ok: false, error: `no resolveLLM match for "${baseKey}" tier=${tier}` };
      }
      spec = {
        filename: resolved.filename,
        parameters: resolved.parameters || resolved.activeParameters || null,
        activeParameters: resolved.activeParameters || null,
        isMoE: resolved.isMoE || false,
        context: resolved.context || null,
        mmproj: resolved.mmproj || null,
        draftModel: resolved.draftModel || null,
        specType: resolved.specType || null,
        specDraftNMax: resolved.specDraftNMax || null,
        mtp: resolved.mtp || false,
        flashAttention: resolved.flashAttention !== false,
        parallelSlots: resolved.parallelSlots || 1,
        enableThinking: resolved.enableThinking === true,
      };
    } else if (modelOrKey && typeof modelOrKey === "object") {
      spec = modelOrKey;
    } else {
      return { ok: false, error: "ensureModel: pass a model key string or spec object" };
    }

    const requestedFilename = (spec.filename || "").toLowerCase();
    if (!requestedFilename) return { ok: false, error: "no filename in spec" };

    // Already loaded the right model? Done.
    if (
      llamaServer.isRunning() &&
      currentLoadedModel?.filename?.toLowerCase() === requestedFilename
    ) {
      return {
        ok: true,
        filename: requestedFilename,
        port: llamaServer.getActivePort(),
        cached: true,
      };
    }

    // CRITICAL — never swap models while another caller is mid-flight.
    // The singleton serves both Generative Text + RoleplayChat + ZHC ticks;
    // killing it under an active companion conversation is the bug
    // surfaced as `[llama-server] exited (intentional=true)` mid-roleplay.
    // Instead: hold the existing model and tell the caller we declined.
    // The dispatcher's `_completeJSON` then proceeds against whatever is
    // already loaded — possibly the "wrong" model for a ZHC role, but
    // never breaks the user's active session.
    const inFlight = (typeof llamaServer.inFlightCount === "function") ? llamaServer.inFlightCount() : 0;
    if (llamaServer.isRunning() && inFlight > 0) {
      const currentName = currentLoadedModel?.filename || null;
      console.warn(
        `[ensureModel] requested ${requestedFilename} but ${inFlight} request(s) ` +
        `in flight against ${currentName} — declining swap to protect active sessions.`,
      );
      return {
        ok: true,
        filename: currentName,
        port: llamaServer.getActivePort(),
        cached: false,
        declined: true,
        reason: "in_flight",
        inFlight,
      };
    }

    // Verify the file exists on disk before we try to spawn — surfaces a
    // friendlier error than a llama-server start failure.
    const onDisk = path.join(MODEL_DIR, normalizeModelFilename(spec.filename));
    if (!fs.existsSync(onDisk)) {
      return { ok: false, error: `model file not found on disk: ${onDisk}` };
    }

    // Delegate to the existing loadModel — it stops any active subprocess,
    // computes context via the heuristic, and spawns llama-server.
    await loadModel(null, spec);

    return {
      ok: true,
      filename: requestedFilename,
      port: llamaServer.getActivePort(),
      cached: false,
    };
  } catch (err) {
    console.error("[ensureModel] failed:", err);
    return { ok: false, error: err.message || String(err) };
  }
}

async function loadModel(_event, currentModel) {
  // Normalize string model keys to object form (e.g. from openclaw passing "llm_llama_3_1_8b")
  if (typeof currentModel === "string") {
    currentModel = { filename: currentModel };
  }

  const incomingFilename = (currentModel.filename || "").toLowerCase();
  const isQwenMtpGguf = (
    /^qwen3\.5-(?:0\.8b|2b|4b|9b|27b)-ud-q[248]_k_xl\.gguf$/.test(incomingFilename) ||
    /^qwen3\.5-(?:35b-a3b|122b-a10b|397b-a17b)-ud-q[248]_k_xl(?:-\d{5}-of-\d{5})?\.gguf$/.test(incomingFilename) ||
    /^qwen3\.6-27b-ud-q[248]_k_xl\.gguf$/.test(incomingFilename) ||
    /^qwen3\.6-35b-a3b-ud-q[248]_k_xl\.gguf$/.test(incomingFilename)
  );
  if (isQwenMtpGguf && (currentModel.specType !== "draft-mtp" || currentModel.mtp !== true)) {
    currentModel = {
      ...currentModel,
      specType: "draft-mtp",
      specDraftNMax: currentModel.specDraftNMax || 2,
      mtp: true,
      draftModel: null,
      isMultimodal: false,
      mmproj: null,
    };
    console.log("[LLM] Qwen MTP GGUF detected from filename; enabling draft-mtp:", incomingFilename);
  }

  // Skip if the same model is already loaded (prevents HMR reload loops).
  // Pass forceReload: true to bypass this guard.
  // Guard against the "both filenames empty = match" trap: if the incoming
  // spec doesn't carry a filename we treat that as a different model and
  // will refuse to short-circuit.
  const requestedFilename = (currentModel.filename || "").toLowerCase();
  const currentFilename = (currentLoadedModel?.filename || "").toLowerCase();
  if (
    requestedFilename &&
    requestedFilename === currentFilename &&
    currentLoadedModel &&
    llamaServer.isRunning() &&
    !currentModel.forceReload
  ) {
    console.log(`[LLM] Model already loaded: ${requestedFilename}, skipping reload`);
    return true;
  }

  // Enrich model metadata from MODEL_SPECS if parameters/context are missing or invalid.
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

  // Stop any existing subprocess before loading a new one (frees GPU memory).
  // Clear chatHistory, system prompt, and currentLoadedModel at this point —
  // BEFORE the new spawn attempt — so a failed start can't leave stale turns
  // or persona prompts in place that the next model would see as "prior
  // context".
  //
  // Also invalidate the privacy-pipeline orchestrator's activeSession if
  // the model is changing: without this, a subsequent inference-request in
  // consumer+pipeline mode would "reuse" a session whose modelPath no
  // longer matches the running subprocess, sending the new model prompts
  // that still look like they belong to the old session.
  if (llamaServer.isRunning()) {
    console.log("[LLM] Stopping existing llama-server before loading new model...");
    await llamaServer.stopModel();
  }
  if (currentLoadedModel && currentFilename !== requestedFilename) {
    chatHistory = [];
    currentSystemPrompt = null;
    currentLoadedModel = null;
    try {
      const { cancelPipelineSession } = await getPipelineOrchestrator();
      await cancelPipelineSession();
    } catch (e) {
      console.warn("[LLM] Failed to cancel pipeline session on swap:", e.message);
    }
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

  // Optional speculative draft model (Qwen3 family only by default)
  let draftPath = null;
  const usesMtpSpecDecode = currentModel.specType === "draft-mtp" || currentModel.mtp === true;
  if (!usesMtpSpecDecode && currentModel.draftModel) {
    const normalizedDraft = normalizeModelFilename(currentModel.draftModel);
    const candidate = path.join(MODEL_DIR, normalizedDraft);
    if (fs.existsSync(candidate)) {
      draftPath = candidate;
      console.log(`[LLM] Speculative decoding enabled with draft: ${normalizedDraft}`);
    } else {
      console.log(`[LLM] Speculative draft not found on disk, skipping: ${candidate}`);
    }
  }

  // Decide on a memory-safe context size via the existing heuristic.
  const sysInfo = await systemInformation();
  const heuristicCtx = computeMaxContextForModel(currentModel, sysInfo);
  const modelMaxCtx = currentModel.context || 4096;
  const ctxSize = Math.min(heuristicCtx || modelMaxCtx, modelMaxCtx);
  console.log(`[LLM] Context: heuristic=${heuristicCtx}, modelMax=${modelMaxCtx}, using=${ctxSize}`);

  // Launch llama-server.
  const resourcesPath = app.isPackaged ? process.resourcesPath : null;
  const { port } = await llamaServer.startModel({
    modelPath,
    mmprojPath,
    draftPath,
    ctxSize,
    ngl: 99,
    flashAttention: currentModel.flashAttention !== false,
    parallelSlots: currentModel.parallelSlots || 1,
    enableThinking: currentModel.enableThinking === true,
    specType: currentModel.specType || null,
    specDraftNMax: currentModel.specDraftNMax || null,
    mtp: currentModel.mtp === true,
  }, { resourcesPath });

  currentLoadedModel = {
    ...currentModel,
    isMultimodal: !!mmprojPath,
    port,
  };
  // Remember the most-recent spec across unload/reload cycles so the
  // multimodal pipeline (RoleplayChat → text → TTS → image → video →
  // back to text) can auto-respawn the LLM the user was actually using.
  // Mirrors the node-llama-cpp era where the LLM was effectively
  // always-available; the llama-server era unloads aggressively to
  // share GPU memory with diffusion pipelines.
  lastLoadedSpec = {
    filename: currentModel.filename,
    parameters: currentModel.parameters,
    activeParameters: currentModel.activeParameters,
    isMoE: currentModel.isMoE,
    context: currentModel.context,
    mmproj: currentModel.mmproj,
    draftModel: currentModel.draftModel,
    specType: currentModel.specType,
    specDraftNMax: currentModel.specDraftNMax,
    mtp: currentModel.mtp,
    flashAttention: currentModel.flashAttention,
    parallelSlots: currentModel.parallelSlots,
    enableThinking: currentModel.enableThinking,
  };
  // Persist so a full app restart can auto-respawn (next text turn
  // after a quit + reopen during an active conversation).
  try { store.set("llm.lastLoadedSpec", lastLoadedSpec); } catch {}
  chatHistory = [];

  console.log(`Model loaded: ${currentModel.filename} on :${port}, multimodal: ${!!mmprojPath}`);

  if (mainWindow && !mainWindow.isDestroyed()) {
    // pipelineMode reflects the current routing mode so the bottom bar
    // keeps showing the "pipeline" tag across model swaps. Without this,
    // swapping models in consumer+pipeline mode would temporarily drop the
    // tag until the next inference re-asserts it.
    const networkMode = store.get("p2p.networkMode", "local");
    const pipelineEnabled = store.get("p2p.pipeline.enabled", false);
    const pipelineMode = networkMode === "consumer" && pipelineEnabled;
    mainWindow.webContents.send("model-changed", {
      filename: currentModel.filename,
      modelname: currentModel.modelname || resolveModelName(currentModel.filename),
      parameters: currentModel.parameters,
      context: currentModel.context,
      isMultimodal: !!mmprojPath,
      model_provenance: currentModel.model_provenance || currentModel.provenance || null,
      provenance: currentModel.provenance || currentModel.model_provenance || null,
      pipelineMode,
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

/**
 * Approximate token count for a message. Llama tokenizers average ~4
 * chars per token for English. Off by ~20% but plenty good for budget
 * accounting against context windows.
 */
function _estTokens(text) {
  if (typeof text !== "string") return 0;
  return Math.ceil(text.length / 4);
}

const LIFETIME_TOKEN_USAGE_KEY = "usage.lifetimeTokens";

function getLifetimeTokenUsage() {
  if (store.has(LIFETIME_TOKEN_USAGE_KEY)) {
    return Number(store.get(LIFETIME_TOKEN_USAGE_KEY, 0)) || 0;
  }

  // Older releases only persisted completion counts on text-history rows.
  // Preserve that available history once, then use the full lifetime ledger.
  const historicalRows = store.get("unifiedTextInferences", []);
  const historicalTotal = Array.isArray(historicalRows)
    ? historicalRows.reduce((total, row) => total + Math.max(0, Number(row?.tokensUsed) || 0), 0)
    : 0;
  store.set(LIFETIME_TOKEN_USAGE_KEY, historicalTotal);
  return historicalTotal;
}

function _messageTokenEstimate(messages = []) {
  return messages.reduce((total, message) => {
    if (typeof message?.content === "string") return total + _estTokens(message.content);
    if (!Array.isArray(message?.content)) return total;
    return total + message.content.reduce((partTotal, part) => (
      part?.type === "text" ? partTotal + _estTokens(part.text || "") : partTotal
    ), 0);
  }, 0);
}

function recordLifetimeTokenUsage({ messages = [], output = "", usage = null } = {}) {
  const reportedTotal = Number(usage?.total_tokens);
  const reportedParts = Number(usage?.prompt_tokens || 0) + Number(usage?.completion_tokens || 0);
  const estimatedTotal = _messageTokenEstimate(messages) + _estTokens(String(output || ""));
  const increment = Math.max(0, Math.round(
    Number.isFinite(reportedTotal) && reportedTotal > 0
      ? reportedTotal
      : reportedParts > 0 ? reportedParts : estimatedTotal,
  ));
  if (!increment) return getLifetimeTokenUsage();

  const total = getLifetimeTokenUsage() + increment;
  store.set(LIFETIME_TOKEN_USAGE_KEY, total);
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send("usage:lifetime-tokens-changed", total);
  }
  return total;
}

/**
 * Trim chatHistory to fit within the active model's context window.
 *
 * Reserves space for:
 *   - the system prompt (kept verbatim — companion personas + scenario
 *     guidelines in roleplay mode are large and load-bearing)
 *   - the new user message
 *   - the response budget (maxTokens, default 2048)
 *
 * Then walks backwards from the most recent history message, including
 * messages until the running total would exceed the budget. The oldest
 * messages are dropped first — chat needs recent context, not the
 * opening turn from 200 messages ago.
 *
 * Without this trim, a long roleplay session crashes mid-turn with
 * "request exceeds the available context size" once history grows.
 */
function _buildMessages(userMessage, opts = {}) {
  const ctxSize = currentLoadedModel?.context || lastLoadedSpec?.ctxSize || 4096;
  const maxTokens = opts.maxTokens || 2048;
  const systemTokens = _estTokens(currentSystemPrompt || "");
  const userTokens = _estTokens(userMessage || "");
  // 256-token safety margin for the chat-template wrapper, role tags,
  // and tokenization slop between our 4-char heuristic and the real
  // tokenizer.
  const budget = Math.max(0, ctxSize - systemTokens - userTokens - maxTokens - 256);

  const trimmed = [];
  let used = 0;
  for (let i = chatHistory.length - 1; i >= 0; i--) {
    const m = chatHistory[i];
    const cost = _estTokens(m.content);
    if (used + cost > budget) break;
    used += cost;
    trimmed.unshift(m);
  }

  if (trimmed.length < chatHistory.length) {
    console.log(
      `[chat] Trimmed history ${chatHistory.length} → ${trimmed.length} messages ` +
      `(ctx=${ctxSize}, sys=${systemTokens}, user=${userTokens}, resp=${maxTokens})`,
    );
  }

  const msgs = [];
  if (currentSystemPrompt) msgs.push({ role: "system", content: currentSystemPrompt });
  msgs.push(...trimmed);
  msgs.push({ role: "user", content: userMessage });
  return msgs;
}

async function chat(_event, input) {
  if (!llamaServer.isRunning()) {
    const ready = await ensureLocalLLMReady();
    if (!ready) throw new Error("Model not loaded");
  }

  const userMessage = typeof input === "string" ? input : input.message;
  const maxTokens = (typeof input === "object" && input.maxTokens) || 2048;
  const temperature = typeof input === "object" ? input.temperature : undefined;
  const seed = typeof input === "object" && Number.isInteger(input.seed)
    ? input.seed
    : Math.floor(Math.random() * 2147483647);
  const returnMetadata = typeof input === "object" && input.returnMetadata;

  const startTime = Date.now();
  const messages = _buildMessages(userMessage, { maxTokens });
  const result = await llamaServer.chat({
    messages,
    temperature,
    maxTokens,
    seed,
  });

  const assistantMessage = result.choices?.[0]?.message?.content ?? "";
  recordLifetimeTokenUsage({ messages, output: assistantMessage, usage: result.usage });
  chatHistory.push({ role: "user", content: userMessage });
  chatHistory.push({ role: "assistant", content: assistantMessage });

  if (returnMetadata) {
    const usage = result.usage || {};
    const elapsedMs = Date.now() - startTime;
    return {
      text: assistantMessage,
      tokenCount: usage.completion_tokens || 0,
      elapsedMs,
      prefillMs: 0, // llama-server doesn't expose prefill separately by default
    };
  }
  return assistantMessage;
}

/**
 * Stateless streaming chat for ZHC dispatcher use. Same wire shape as
 * chatStream but:
 *   - DOES NOT mutate the global chatHistory (ZHC ticks are stateless
 *     one-shot completions; polluting chatHistory would corrupt the
 *     user's Generative Text session).
 *   - Emits tokens on a separate IPC channel "zhc-chat-token" tagged
 *     with the caller's streamId so concurrent ZHC streams don't
 *     interleave each other or with Generative Text.
 *   - Returns the full assistant message string on completion.
 */
// ─── Active stream abort tracking (keyed by streamId for stateless, sender.id for regular) ───
const _chatAbortControllers = new Map();

function _setChatAbort(key, ctrl) {
  if (ctrl) {
    const old = _chatAbortControllers.get(key);
    if (old && !old.signal.aborted) {
      try { old.abort(); } catch { /* stale controller already settled */ }
    }
    _chatAbortControllers.set(key, ctrl);
  } else {
    _chatAbortControllers.delete(key);
  }
}

function _abortChat(key) {
  const ctrl = _chatAbortControllers.get(key);
  if (ctrl && !ctrl.signal.aborted) {
    ctrl.abort();
    return true;
  }
  return false;
}

async function chatStreamStateless(event, input) {
  if (!llamaServer.isRunning()) {
    const ready = await ensureLocalLLMReady();
    if (!ready) throw new Error("Model not loaded");
  }

  const userMessage = input?.message;
  const streamId = input?.streamId;
  const maxTokens = input?.maxTokens || 2048;
  const temperature = input?.temperature;
  const enableThinking = typeof input?.enableThinking === "boolean" ? input.enableThinking : undefined;

  if (!streamId) throw new Error("chatStreamStateless: streamId required");

  const win = BrowserWindow.fromWebContents(event.sender);
  const messages = [];
  if (currentSystemPrompt) messages.push({ role: "system", content: currentSystemPrompt });
  messages.push({ role: "user", content: userMessage });

  const ctrl = new AbortController();
  _setChatAbort(streamId, ctrl);
  try {
    const res = await llamaServer.chatStream(
      {
        messages,
        temperature,
        maxTokens,
        seed: Math.floor(Math.random() * 2147483647),
        enableThinking,
      },
      (chunk) => {
        if (win && !win.isDestroyed()) {
          event.sender.send("zhc-chat-token", { streamId, chunk });
        }
      },
      { signal: ctrl.signal },
    );
    recordLifetimeTokenUsage({ messages, output: res });
    return res;
  } catch (err) {
    if (err.name === "AbortError" || ctrl.signal.aborted) {
      return ""; // ZHC caller handles empty text as cancelled
    }
    throw err;
  } finally {
    _setChatAbort(streamId, null);
  }
}

async function chatStream(event, input) {
  if (!llamaServer.isRunning()) {
    const ready = await ensureLocalLLMReady();
    if (!ready) throw new Error("Model not loaded");
  }

  let userMessage, maxTokens, temperature, seed, enableThinking;
  if (typeof input === "string") {
    userMessage = input;
    maxTokens = 2048;
    seed = Math.floor(Math.random() * 2147483647);
  } else {
    userMessage = input.message;
    maxTokens = input.maxTokens || 2048;
    temperature = input.temperature;
    seed = Number.isInteger(input.seed)
      ? input.seed
      : Math.floor(Math.random() * 2147483647);
    // Per-request override of the chat template's `enable_thinking` var.
    // Live toggling — no model reload needed.
    if (typeof input.enableThinking === "boolean") {
      enableThinking = input.enableThinking;
    }
  }

  const win = BrowserWindow.fromWebContents(event.sender);
  const key = event.sender.id;
  const ctrl = new AbortController();
  _setChatAbort(key, ctrl);

  try {
    const messages = _buildMessages(userMessage, { maxTokens });
    const assistantMessage = await llamaServer.chatStream(
      {
        messages,
        temperature,
        maxTokens,
        seed,
        enableThinking,
      },
      (chunk) => {
        if (win && !win.isDestroyed()) {
          event.sender.send("chat-token", chunk);
        }
      },
      { signal: ctrl.signal },
    );

    recordLifetimeTokenUsage({ messages, output: assistantMessage });
    chatHistory.push({ role: "user", content: userMessage });
    chatHistory.push({ role: "assistant", content: assistantMessage });
    return assistantMessage;
  } catch (err) {
    if (err.name === "AbortError" || ctrl.signal.aborted) {
      console.log("[LLM] chatStream aborted for sender", key);
      // Manager already returns partial text; if we land here the
      // stream ended before any text arrived. Return empty so the
      // renderer can use its own accumulated streamingText.
      return "";
    }
    throw err;
  } finally {
    _setChatAbort(key, null);
  }
}

async function unloadModel(_event, { force } = {}) {
  // "Always loaded" guard: skip unload unless forced (hot-swap) or user-initiated
  if (!force && alwaysLoadedEnabled && llamaServer.isRunning()) {
    console.log("[LLM] Skipping unload — always-loaded is enabled. Use force=true to hot-swap.");
    return false;
  }

  if (llamaServer.isRunning()) {
    console.log("[LLM] Stopping llama-server to free GPU memory...");
    await llamaServer.stopModel();
  }
  currentLoadedModel = null;
  chatHistory = [];

  if (global.gc) global.gc();

  // Give GPU time to release memory before a follow-up load
  await new Promise((resolve) => setTimeout(resolve, 300));
  console.log("[LLM] Model unloaded successfully");

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("model-changed", null);
  }
  return true;
}

// Vision chat routes through llama-server when the currently loaded model was
// started with --mmproj. The Flask /vision/analyze endpoint remains available
// as a fallback path for models that have no GGUF mmproj (e.g. Qwen3-VL on
// Python stack).
async function chatWithVision(_event, { message, imageBase64 }) {
  if (!llamaServer.isRunning()) {
    throw new Error("Model not loaded. Load a multimodal GGUF (with mmproj) first.");
  }
  if (!currentLoadedModel?.isMultimodal) {
    throw new Error(
      "Current model is not multimodal. Load a GGUF with an mmproj asset, or hit the Flask /vision/analyze endpoint for Python-side vision.",
    );
  }
  const result = await llamaServer.chatVision({ message, imageBase64 });
  const output = typeof result === "string"
    ? result
    : result?.choices?.[0]?.message?.content || result?.text || "";
  recordLifetimeTokenUsage({
    messages: [{ role: "user", content: message }],
    output,
    usage: result?.usage,
  });
  return result;
}

// Check if mmproj file exists for multimodal GGUF models
function checkMmproj(_event, mmprojFilename) {
  if (!mmprojFilename) return false;
  const normalizedName = normalizeModelFilename(mmprojFilename);
  const mmprojPath = path.join(MODEL_DIR, normalizedName);
  return fs.existsSync(mmprojPath);
}

// Download mmproj vision projector for multimodal GGUF models
async function downloadMmproj(event, { url, filename }) {
  if (!url || !filename) {
    throw new Error("URL and filename are required for mmproj download");
  }
  return downloadModel(event, url, filename);
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
        llmLoaded: llamaServer.isRunning(),
        modelName: currentLoadedModel?.filename || null,
        flaskPort: PY_SERVER_PORT,
        companions: companions.length,
        scenarios: scenarios.length,
        rendererReady: mainWindow && !mainWindow.isDestroyed(),
      }));
      return;
    }

    // Manifest discovery — serves the SKILL.md files so any external agent
    // harness can GET the BonzAI capability description without needing the
    // repo on disk. Supports `?agent=openclaw` (default) and `?agent=hermes`.
    if (req.method === "GET" && url.pathname === "/manifest") {
      const agent = (url.searchParams.get("agent") || "openclaw").toLowerCase();
      const manifestName = agent === "hermes" ? "hermes" : "openclaw";
      const manifestPath = resolveBundledSkillManifest(manifestName);
      if (!manifestPath || !fs.existsSync(manifestPath)) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: `manifest not found for ${agent}` }));
        return;
      }
      try {
        const content = fs.readFileSync(manifestPath, "utf8");
        res.writeHead(200, {
          "Content-Type": "text/markdown; charset=utf-8",
          "X-Manifest-Agent": manifestName,
        });
        res.end(content);
      } catch (e) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: e.message }));
      }
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
    if (req.method === "POST" && url.pathname === "/api/vision/analyze") {
      let body = "";
      req.on("data", (chunk) => {
        body += chunk;
        if (body.length > 32 * 1024 * 1024) req.destroy();
      });
      req.on("end", async () => {
        try {
          const text = await runCrossPlatformVision(JSON.parse(body || "{}"));
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: true, response: text }));
        } catch (error) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: error.message }));
        }
      });
      return;
    }


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

          if (!llamaServer.isRunning()) {
            console.log(`[OpenAI API] No model loaded, returning 503`);
            res.writeHead(503, { "Content-Type": "application/json" });
            res.end(JSON.stringify({
              error: { message: "No model loaded. Please load a model in BonzAI first.", type: "server_error" }
            }));
            return;
          }

          // Transparent proxy to the llama-server subprocess. This preserves
          // every OpenAI feature (tool_calls, json_mode, logprobs, vision
          // via image_url, etc.) without us re-implementing them. We rewrite
          // the `model` field to match whichever GGUF is actually loaded.
          const actualModel = currentLoadedModel?.filename || "unknown";
          const upstreamBody = { ...parsed, model: actualModel };

          const upstream = await llamaServer.proxyRequest("/v1/chat/completions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(upstreamBody),
          });

          res.writeHead(upstream.status, Object.fromEntries(upstream.headers.entries()));

          if (!upstream.body) {
            res.end();
            return;
          }

          const reader = upstream.body.getReader();
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            if (!res.write(Buffer.from(value))) {
              await new Promise((resolve) => res.once("drain", resolve));
            }
          }
          res.end();
        } catch (error) {
          console.error("[OpenAI API] Chat completions error:", error);
          if (!res.headersSent) {
            res.writeHead(500, { "Content-Type": "application/json" });
          }
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

          if (!llamaServer.isRunning()) {
            res.writeHead(503, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "LLM not loaded. Load a model first." }));
            return;
          }

          const completion = await llamaServer.chat({
            messages: [{ role: "user", content: prompt }],
          });
          const response = completion.choices?.[0]?.message?.content ?? "";
          recordLifetimeTokenUsage({
            messages: [{ role: "user", content: prompt }],
            output: response,
            usage: completion.usage,
          });

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
        loaded: llamaServer.isRunning(),
        modelName: currentLoadedModel?.filename || null,
        hasSession: llamaServer.isRunning(),
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
