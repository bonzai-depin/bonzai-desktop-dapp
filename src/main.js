import { BrowserWindow, app, ipcMain, protocol, screen, shell } from "electron";
import Store from "electron-store";
import fs from "fs";
import si from "systeminformation";
import { LlamaChatSession, LlamaContext, LlamaModel } from "node-llama-cpp";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { download } from "electron-dl";
import { unlink } from "node:fs";
import child_process from "child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

  createWindow(width, height);

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
    app.quit();
  }
});

app.on("activate", () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

/**
 * Checks the model cache dir and delete the model if available.
 */
async function systemInformation() {
  const ram = await si.mem();
  const vram = await si.graphics();

  const systemValues = {
    ram: ram.total,
    gpu: vram.controllers[0].model,
    vram: vram.controllers[0].vram,
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
  // const url =
  //   "https://huggingface.co/microsoft/Phi-3-mini-4k-instruct-gguf/resolve/main/Phi-3-mini-4k-instruct-q4.gguf";
  console.log('app.getPath("userData")', app.getPath("userData"));
  try {
    await download(win, url, {
      directory: path.join(app.getPath("userData"), "models"),
      filename: filename,
    });
    return true;
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
function loadModel(event, modelname) {
  const modelPath = path.join(app.getPath("userData"), "models", modelname);

  model = new LlamaModel({
    modelPath: modelPath,
  });
  modelContext = new LlamaContext({ model });
  modelSession = new LlamaChatSession({ context: modelContext });
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

function checkModel(event, modelname) {
  const modelPath = path.join(app.getPath("userData"), "models", modelname);

  if (!fs.existsSync(modelPath)) {
    console.error("Model file not found:", modelPath);
    return false;
  }
  return true;
}
