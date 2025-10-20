import {
  BrowserWindow,
  app,
  ipcMain,
  protocol,
  screen,
  shell,
  dialog,
} from "electron";
import Store from "electron-store";
import os from "os";
import fs from "fs";
import si from "systeminformation";
import psTree from "ps-tree";
import {
  getLlama,
  LlamaChatSession,
  JinjaTemplateChatWrapper,
} from "node-llama-cpp";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { download } from "electron-dl";
import { unlink } from "node:fs";
import child_process from "child_process";

const llama = await getLlama();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PY_DIST_FOLDER = "../dist"; // python distributable folder
const PY_MODULE = "diffuser.py"; // the name of the main module
let subpy = null;

const isRunningInBundle = () => {
  return fs.existsSync(path.join(__dirname, PY_DIST_FOLDER));
};

const getPythonScriptPath = () => {
  const devScript = path.join(__dirname, PY_MODULE);
  const prodScript = path.join(process.resourcesPath, "server", "diffuser.py");
  const prodBinary = path.join(
    process.resourcesPath,
    "server",
    "python-binary"
  );

  return {
    script: isRunningInBundle() ? prodScript : devScript,
    binary: isRunningInBundle() ? prodBinary : "python",
  };
};

const killPort = (port = 65000) => {
  try {
    if (process.platform === "win32") {
      child_process.execSync(
        `for /f "tokens=5" %a in ('netstat -aon ^| find ":${port}" ^| find "LISTENING"') do taskkill /f /pid %a`
      );
    } else {
      child_process.execSync(`lsof -ti:${port} | xargs kill -9`);
    }
    console.log(`[killPort] Successfully killed any process on port ${port}`);
  } catch (err) {
    console.log(
      `[killPort] No process found or failed to kill: ${err.message}`
    );
  }
};

const startPythonSubprocess = () => {
  killPort(65000);
  const { script, binary } = getPythonScriptPath(); // Updated to return both script and binary paths
  const port = 65000; // Match Flask port

  console.log(`Starting diffuser... Script: ${script}, Binary: ${binary}`);

  if (isRunningInBundle()) {
    console.log("Diffuser runs in bundle mode!");
    subpy = child_process.execFile(binary, [script, `--port=${port}`]);
  } else {
    console.log("Diffuser runs in development mode!");
    subpy = child_process.spawn(binary, [script, `--port=${port}`]);
  }

  // Attach event listeners to capture stdout and stderr
  if (subpy) {
    subpy.stdout.on("data", (data) => console.log(`Python stdout: ${data}`));
    subpy.stderr.on("data", (data) => console.error(`Python stderr: ${data}`));

    subpy.on("close", (code) => {
      console.log(`Python subprocess exited with code ${code}`);
    });

    subpy.on("error", (err) => {
      console.error(`Failed to start Python subprocess: ${err}`);
    });
  } else {
    console.error("Failed to start Python subprocess: subpy is null.");
  }
};

const killPythonSubprocess = (main_pid) => {
  console.log("Killing diffuser...");
  const python_script_name = path.basename(getPythonScriptPath());
  let cleanup_completed = false;
  psTree(main_pid, function (err, children) {
    let python_pids = children
      .filter(function (el) {
        return el.COMMAND == python_script_name;
      })
      .map(function (p) {
        return p.PID;
      });
    // kill all the spawned python processes
    python_pids.forEach(function (pid) {
      process.kill(pid);
    });
    subpy = null;
    cleanup_completed = true;
  });
  return new Promise(function (resolve, reject) {
    (function waitForSubProcessCleanup() {
      if (cleanup_completed) return resolve();
      setTimeout(waitForSubProcessCleanup, 30);
    })();
  });
};

const checkPythonServer = async (url) => {
  return new Promise((resolve, reject) => {
    const checkInterval = setInterval(() => {
      fetch(url)
        .then(() => {
          clearInterval(checkInterval);
          resolve(true);
        })
        .catch(() => console.log("Waiting for Python server..."));
    }, 1000);

    setTimeout(() => {
      clearInterval(checkInterval);
      reject(new Error("Python server did not start."));
    }, 15000);
  });
};

/**
 * If we want to present local images, we have to register a local protocol and
 * handle it ourselves. This dodges security issues.
 */
protocol.registerSchemesAsPrivileged([
  { scheme: "app", privileges: { bypassCSP: true } },
]);

app.whenReady().then(() => {
  /**
   * Register a handler for the local protocol. We do the dumb thing of just
   * reading the file. This is not safe in general.
   */
  protocol.handle("app", (req) => {
    const { pathname } = new URL(req.url);
    return net.fetch(pathToFileURL(pathname).toString());
  });
});

try {
  // Handle creating/removing shortcuts on Windows when installing/uninstalling.
  import.meta.resolve("electron-squirrel-startup/package.json");
  app.quit();
} catch (error) {
  // Ignore
  console.log("Ignore error: ", error);
}

/**
 * A global cache storage for persistent user data.
 */
const store = new Store();

// Expose store.get
ipcMain.handle("store-get", (_event, key, defaultValue) => {
  return store.get(key, defaultValue);
});

// Expose store.set
ipcMain.handle("store-set", (_event, key, value) => {
  store.set(key, value);
  return true;
});

// Expose store.delete
ipcMain.handle("store-delete", (_event, key) => {
  store.delete(key);
  return true;
});

ipcMain.handle("agent-save-image", async (event, defaultName, base64Data) => {
  // 1) show a Save As dialog
  const { canceled, filePath } = await dialog.showSaveDialog({
    defaultPath: defaultName,
    filters: [{ name: "Images", extensions: ["png"] }],
  });
  if (canceled || !filePath) return { success: false };

  // 2) strip off data:image/png;base64, if present
  const b64 = base64Data.replace(/^data:image\/\w+;base64,/, "");
  const buf = Buffer.from(b64, "base64");

  // 3) write to disk synchronously or async
  try {
    fs.writeFileSync(filePath, buf);
    return { success: true, path: filePath };
  } catch (e) {
    console.error("Failed to save:", e);
    return { success: false, error: e.message };
  }
});

/**
 * A local Llama Model that we'll be using consistently.
 */
let model = undefined;
/**
 * Structures required by LlamaModel for handling chat sessions. These get
 * created when the model is loaded.
 */
let modelContext = undefined;
let modelSession = undefined;

const createWindow = async (width, height) => {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: width,
    height: height,
    resizable: false,
    maximizable: false,
    minimizable: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https:")) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });

  mainWindow.maximize();

  // and load the index.html of the app.
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    await mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    await mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`)
    );
  }

  // Open the DevTools.
  // mainWindow.webContents.openDevTools();
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on("ready", async () => {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  const flaskURL = "http://127.0.0.1:65000";
  startPythonSubprocess();

  try {
    await checkPythonServer(flaskURL);
    console.log("Python server is running!");
    await createWindow(width, height);
  } catch (error) {
    console.error("Failed to start Python server:", error);
    app.quit();
  }

  // createWindow(width, height);

  // develop
  // try {
  //   await child_process.spawn("python", ["./src/server/diffuser.py"]);
  //   return true;
  // } catch (error) {
  //   console.error("Server start failed:", error);
  //   return false;
  // }
  // packaging
  // child_process.spawn('./dist/diffuser/diffuser');
});

ipcMain.handle("start-server", startPythonSubprocess);

ipcMain.handle("stop-server", killPythonSubprocess);

ipcMain.handle("system-information", systemInformation);

/**
 * Checks if a LLama Model exists
 */
ipcMain.handle("model-check", checkModel);

ipcMain.handle("model-download", downloadModel);

ipcMain.handle("model-delete", deleteModel);

/**
 * Loads a LLama Model
 */
ipcMain.handle("model-load", loadModel);
/**
 * Two way communication with the model.
 */
ipcMain.handle("model-chat", chat);

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    let main_process_pid = process.pid;
    killPythonSubprocess(main_process_pid).then(() => {
      app.quit();
    });
  }
});

app.on("activate", () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (subpy == null) {
    startPythonSubprocess();
  }

  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

function getLocalIP() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === "IPv4" && !net.internal) {
        return net.address;
      }
    }
  }
  return "127.0.0.1";
}

/**
 * Checks the model cache dir and delete the model if available.
 */
async function systemInformation() {
  const ram = await si.mem();
  const vram = await si.graphics();

  const ip = getLocalIP();
  console.log(`Flask API should be accessible at: http://${ip}:65000`);

  const systemValues = {
    ram: ram.total,
    gpu: vram.controllers[0].model,
    vram: vram.controllers[0].vram,
    ip: ip,
  };

  return systemValues;
}

/**
 * Initialize the model configuration on the first run.
 */
const modelDir = store.get("models");
if (!modelDir) {
  // In production, the model will be in the resources directory
  const defaultModelDir = app.getPath("userData");
  console.log(defaultModelDir);
  fs.mkdirSync(defaultModelDir, { recursive: true });
  store.set("models", defaultModelDir);
}

/**
 * Downloads the model file to the user's data directory.
 */
async function downloadModel(event, url, filename) {
  const win = BrowserWindow.getFocusedWindow();
  console.log('app.getPath("userData")', app.getPath("userData"));
  try {
    const dl = await download(win, url, {
      filename,
      directory: path.join(app.getPath("userData"), "models"),
      showBadge: false,
      onProgress: (progressObj) => {
        const pct = progressObj.percent; // 0 to 1
        win.setProgressBar(pct);
        win.webContents.send("download-progress", { filename, percent: pct });
      },
    });

    win.setProgressBar(-1); // clear
    return { savedPath: dl.getSavePath() };
  } catch (error) {
    console.error("Download failed:", error);
    return false;
  }
}

/**
 * Checks the model cache dir and delete the model if available.
 */
function deleteModel(event, modelname) {
  console.log('app.getPath("userData")', app.getPath("userData"));
  console.log("modelname", modelname);
  const modelPath = path.join(app.getPath("userData"), "models", modelname);

  unlink(modelPath, (err) => {
    if (err) throw err;
    console.log("Model was deleted");
  });
  return true;
}

/**
 * Checks the model cache dir and loads a model if available.
 */
async function loadModel(event, modelname) {
  const modelPath = path.join(app.getPath("userData"), "models", modelname);

  const model = await llama.loadModel({
    modelPath: modelPath,
  });

  modelContext = await model.createContext({
    contextSize: 4096,
  });

  modelSession = new LlamaChatSession({
    contextSequence: modelContext.getSequence(),
  });
  return true;
}

function checkModel(event, modelname) {
  const modelPath = path.join(app.getPath("userData"), "models", modelname);

  if (!fs.existsSync(modelPath)) {
    console.error("Model file not found:", modelPath);
    return false;
  }
  return true;
}

/**
 * Prompts the model to respond to the user message in relation to the current
 * session context.
 */
async function chat(event, userMessage) {
  if (!modelSession) {
    throw new Error("Model not loaded");
  }
  const assistantMessage = await modelSession.prompt(userMessage);
  // Note: We could do streaming here but node-llama-cpp doesn't expose a
  // streaming interface.
  return assistantMessage;
}
