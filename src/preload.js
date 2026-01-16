// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  startServer: () => ipcRenderer.invoke("start-server"),
  stopServer: () => ipcRenderer.invoke("stop-server"),
  restartServer: () => ipcRenderer.invoke("restart-server"),
  systemInformation: () => ipcRenderer.invoke("system-information"),
  checkModel: (modelname) => ipcRenderer.invoke("model-check", modelname),
  downloadModel: (url, filename) =>
    ipcRenderer.invoke("model-download", url, filename),
  onDownloadProgress: (cb) => ipcRenderer.on("download-progress", cb),
  deleteModel: (modelname) => ipcRenderer.invoke("model-delete", modelname),
  loadModel: (modelname) => ipcRenderer.invoke("model-load", modelname),
  chat: (userMessage) => ipcRenderer.invoke("model-chat", userMessage),
  store: {
    get: (key, defaultValue = null) =>
      ipcRenderer.invoke("store-get", key, defaultValue),
    set: (key, value) => ipcRenderer.invoke("store-set", key, value),
    delete: (key) => ipcRenderer.invoke("store-delete", key),
  },
  saveImage: (defaultName, base64Data) =>
    ipcRenderer.invoke("agent-save-image", defaultName, base64Data),
  saveAudio: (defaultName, sourcePath) =>
    ipcRenderer.invoke("agent-save-audio", defaultName, sourcePath),
  saveVideo: (defaultName, sourcePath) =>
    ipcRenderer.invoke("agent-save-video", defaultName, sourcePath),
  // File existence check (for media validation)
  fileExists: (filePath) => ipcRenderer.invoke("file-exists", filePath),
  // Open URL in default browser
  openExternal: (url) => ipcRenderer.invoke("open-external", url),
  // Server status events (for self-healing notifications)
  onServerStatus: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on("server-status", handler);
    // Return unsubscribe function
    return () => ipcRenderer.removeListener("server-status", handler);
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Polymarket API Proxy
// Routes requests through main process to bypass CORS restrictions
// ─────────────────────────────────────────────────────────────────────────────
contextBridge.exposeInMainWorld("polymarketProxy", {
  /**
   * Fetch from Polymarket API
   * @param {string} endpoint - 'markets', 'holders', 'events', 'prices', or full URL
   * @param {Object} params - Query parameters
   * @returns {Promise<{success: boolean, data?: any, error?: string}>}
   */
  fetch: (endpoint, params) =>
    ipcRenderer.invoke("polymarket:fetch", { endpoint, params }),

  /**
   * Batch fetch multiple endpoints in parallel
   * @param {Array<{endpoint: string, params?: Object}>} requests
   * @returns {Promise<Array<{success: boolean, data?: any, error?: string}>>}
   */
  batch: (requests) => ipcRenderer.invoke("polymarket:batch", requests),

  /**
   * Convenience methods for common endpoints
   */
  getMarkets: (params = {}) =>
    ipcRenderer.invoke("polymarket:fetch", { endpoint: "markets", params }),

  getHolders: (marketId, params = {}) =>
    ipcRenderer.invoke("polymarket:fetch", {
      endpoint: "holders",
      params: { market: marketId, ...params },
    }),

  getEvents: (params = {}) =>
    ipcRenderer.invoke("polymarket:fetch", { endpoint: "events", params }),
});

// ─────────────────────────────────────────────────────────────────────────────
// Generic External API Proxy
// For any external API that has CORS restrictions
// ─────────────────────────────────────────────────────────────────────────────
contextBridge.exposeInMainWorld("externalProxy", {
  /**
   * Fetch any external URL through main process
   * @param {string} url - Full URL to fetch
   * @param {Object} options - { method, headers, body }
   * @returns {Promise<{success: boolean, data?: any, error?: string}>}
   */
  fetch: (url, options = {}) =>
    ipcRenderer.invoke("proxy:fetch", { url, options }),

  /**
   * GET request helper
   */
  get: (url, headers = {}) =>
    ipcRenderer.invoke("proxy:fetch", {
      url,
      options: { method: "GET", headers },
    }),

  /**
   * POST request helper
   */
  post: (url, body, headers = {}) =>
    ipcRenderer.invoke("proxy:fetch", {
      url,
      options: { method: "POST", headers, body },
    }),
});
