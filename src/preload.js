// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  // App version for window title
  getAppVersion: () => ipcRenderer.invoke("get-app-version"),
  // Platform info (exposed synchronously from preload context)
  platform: process.platform,
  arch: process.arch,
  startServer: () => ipcRenderer.invoke("start-server"),
  stopServer: () => ipcRenderer.invoke("stop-server"),
  restartServer: () => ipcRenderer.invoke("restart-server"),
  systemInformation: () => ipcRenderer.invoke("system-information"),
  checkModel: (modelname) => ipcRenderer.invoke("model-check", modelname),
  downloadModel: (url, filename) =>
    ipcRenderer.invoke("model-download", url, filename),
  onDownloadProgress: (cb) => ipcRenderer.on("download-progress", cb),
  getActiveDownloads: () => ipcRenderer.invoke("get-active-downloads"),
  deleteModel: (modelname) => ipcRenderer.invoke("model-delete", modelname),
  loadModel: (modelname) => ipcRenderer.invoke("model-load", modelname),
  unloadModel: () => ipcRenderer.invoke("model-unload"),
  getLoadedModel: () => ipcRenderer.invoke("model-get-loaded"),
  getAlwaysLoaded: () => ipcRenderer.invoke("model-get-always-loaded"),
  setAlwaysLoaded: (enabled) => ipcRenderer.invoke("model-set-always-loaded", enabled),
  onModelChanged: (cb) => {
    const handler = (_event, model) => cb(model);
    ipcRenderer.on("model-changed", handler);
    return () => ipcRenderer.removeListener("model-changed", handler);
  },
  chat: (userMessage, options = {}) => ipcRenderer.invoke("model-chat", { message: userMessage, ...options }),
  resetChat: () => ipcRenderer.invoke("model-reset-chat"),
  chatStream: (userMessage, options = {}) => ipcRenderer.invoke("model-chat-stream", { message: userMessage, ...options }),
  onChatToken: (cb) => {
    const handler = (_event, chunk) => cb(chunk);
    ipcRenderer.on("chat-token", handler);
    return () => ipcRenderer.removeListener("chat-token", handler);
  },
  // Vision chat for multimodal models (MiniCPM-V, etc.)
  chatVision: (message, imageBase64) =>
    ipcRenderer.invoke("model-chat-vision", { message, imageBase64 }),
  // Mmproj (vision projector) management for multimodal models
  checkMmproj: (mmprojFilename) =>
    ipcRenderer.invoke("model-check-mmproj", mmprojFilename),
  downloadMmproj: (url, filename) =>
    ipcRenderer.invoke("model-download-mmproj", { url, filename }),
  store: {
    get: (key, defaultValue = null) =>
      ipcRenderer.invoke("store-get", key, defaultValue),
    set: (key, value) => ipcRenderer.invoke("store-set", key, value),
    delete: (key) => ipcRenderer.invoke("store-delete", key),
  },
  // Agent wallet transaction confirmation (P0 Security)
  confirmTransaction: (details) =>
    ipcRenderer.invoke("confirm-transaction", details),

  // ─────────────────────────────────────────────────────────────────────────
  // Privy Server Wallet (agent wallets via Privy API, secret stays in main)
  // ─────────────────────────────────────────────────────────────────────────
  privy: {
    createServerWallet: (opts) =>
      ipcRenderer.invoke("privy:create-server-wallet", opts),
    sendTransaction: (walletId, tx) =>
      ipcRenderer.invoke("privy:send-transaction", { walletId, tx }),
    signTypedData: (walletId, typedData) =>
      ipcRenderer.invoke("privy:sign-typed-data", { walletId, typedData }),
    getWallet: (walletId) =>
      ipcRenderer.invoke("privy:get-wallet", walletId),
    setPolicy: (walletId, policy) =>
      ipcRenderer.invoke("privy:set-policy", { walletId, policy }),
  },
  saveImage: (defaultName, base64Data) =>
    ipcRenderer.invoke("agent-save-image", defaultName, base64Data),
  saveAudio: (defaultName, sourcePath) =>
    ipcRenderer.invoke("agent-save-audio", defaultName, sourcePath),
  saveVideo: (defaultName, sourcePath) =>
    ipcRenderer.invoke("agent-save-video", defaultName, sourcePath),
  // File existence check (for media validation)
  fileExists: (filePath) => ipcRenderer.invoke("file-exists", filePath),
  // Get home directory for file paths
  getHomeDir: () => ipcRenderer.invoke("get-home-dir"),
  // Save base64 data to file (for OpenClaw/WhatsApp media delivery)
  saveBase64ToFile: (filePath, base64Data) =>
    ipcRenderer.invoke("save-base64-to-file", filePath, base64Data),
  // Fix history paths after MODEL_DIR migration
  fixHistoryPaths: (oldDir, newDir) => ipcRenderer.invoke("fix-history-paths", oldDir, newDir),
  // Force migrate all history paths to current MODEL_DIR (auto-detects old paths)
  forceMigrateHistory: () => ipcRenderer.invoke("force-migrate-history"),
  // Open URL in default browser
  openExternal: (url) => ipcRenderer.invoke("open-external", url),
  // Server status events (for self-healing notifications)
  onServerStatus: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on("server-status", handler);
    // Return unsubscribe function
    return () => ipcRenderer.removeListener("server-status", handler);
  },
  // Server log events (forward Python server output to renderer console)
  onServerLog: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on("server-log", handler);
    // Return unsubscribe function
    return () => ipcRenderer.removeListener("server-log", handler);
  },
  // OpenClaw webhook events (main process forwards webhooks to renderer)
  onOpenClawWebhook: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on("openclaw-webhook", handler);
    return () => ipcRenderer.removeListener("openclaw-webhook", handler);
  },
  // Send response back to main process for OpenClaw webhook
  sendOpenClawResponse: (requestId, result) =>
    ipcRenderer.invoke("openclaw-webhook-response", { requestId, result }),
  // Model directory management
  getModelDir: () => ipcRenderer.invoke("get-model-dir"),
  selectModelDir: () => ipcRenderer.invoke("select-model-dir"),
  selectVideoFile: () => ipcRenderer.invoke("select-video-file"),
  downloadVideoToTemp: (url) => ipcRenderer.invoke("download-video-to-temp", url),
  // Migration progress events (for MODEL_DIR file migration)
  onMigrationProgress: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on("migration-progress", handler);
    return () => ipcRenderer.removeListener("migration-progress", handler);
  },
  // OpenClaw integration toggle
  openclawGetEnabled: () => ipcRenderer.invoke("openclaw-get-enabled"),
  openclawSetEnabled: (enabled) => ipcRenderer.invoke("openclaw-set-enabled", enabled),
  openclawIsInstalled: () => ipcRenderer.invoke("openclaw-is-installed"),

  // Hermes Agent integration toggle
  hermesGetEnabled: () => ipcRenderer.invoke("hermes-get-enabled"),
  hermesSetEnabled: (enabled) => ipcRenderer.invoke("hermes-set-enabled", enabled),
  hermesIsInstalled: () => ipcRenderer.invoke("hermes-is-installed"),

  // ─────────────────────────────────────────────────────────────────────────────
  // Irys / Arweave Upload (proxied through main process for Node.js compat)
  // ─────────────────────────────────────────────────────────────────────────────
  irys: {
    init: (opts) => ipcRenderer.invoke("irys-init", opts),
    upload: (opts) => ipcRenderer.invoke("irys-upload", opts),
    uploadJson: (opts) => ipcRenderer.invoke("irys-upload-json", opts),
    balance: () => ipcRenderer.invoke("irys-balance"),
    fund: (opts) => ipcRenderer.invoke("irys-fund", opts),
    price: (opts) => ipcRenderer.invoke("irys-price", opts),
    disconnect: () => ipcRenderer.invoke("irys-disconnect"),
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // Dataset Studio (simple CRUD + LLM describe)
  // ─────────────────────────────────────────────────────────────────────────────
  synthExamplesList: () => ipcRenderer.invoke("synth-examples-list"),
  synthExampleSave: (ex) => ipcRenderer.invoke("synth-example-save", ex),
  synthExampleDelete: (id) => ipcRenderer.invoke("synth-example-delete", id),
  synthDescribe: (opts) => ipcRenderer.invoke("synth-describe", opts),
  synthExport: (opts) => ipcRenderer.invoke("synth-export", opts),

  // ─────────────────────────────────────────────────────────────────────────────
  // P2P Network (libp2p) - Distributed Inference
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Start the P2P node for distributed inference
   * @param {Object} options Configuration options
   * @param {number} options.listenPort Port to listen on (default: 4002)
   * @param {boolean} options.enableRelay Enable relay server for other providers
   * @param {string[]} options.bootstrapNodes Initial peers to connect to
   * @returns {Promise<{ok: boolean, peerId?: string, multiaddrs?: string[], error?: string}>}
   */
  p2pStart: (options = {}) => ipcRenderer.invoke("p2p-start", options),

  /**
   * Stop the P2P node
   * @returns {Promise<{ok: boolean, error?: string}>}
   */
  p2pStop: () => ipcRenderer.invoke("p2p-stop"),

  /**
   * Get P2P node status
   * @returns {Promise<{ok: boolean, started: boolean, peerId?: string, multiaddrs?: string[], connectedPeers?: number, natStatus?: string}>}
   */
  p2pStatus: () => ipcRenderer.invoke("p2p-status"),

  /**
   * Dial a remote peer
   * @param {string} peerIdOrAddr Peer ID or multiaddr
   * @returns {Promise<{ok: boolean, error?: string}>}
   */
  p2pDial: (peerIdOrAddr) => ipcRenderer.invoke("p2p-dial", peerIdOrAddr),

  /**
   * Send inference request to a remote provider
   * @param {string} peerId Target peer ID
   * @param {Object} request Inference request with pipeline and params
   * @returns {Promise<{ok: boolean, result?: any, error?: string}>}
   */
  p2pInference: (peerId, request) =>
    ipcRenderer.invoke("p2p-inference", { peerId, request }),

  /**
   * Check health of a remote peer
   * @param {string} peerId Target peer ID
   * @returns {Promise<{ok: boolean, pipelines?: string[], version?: string, error?: string}>}
   */
  p2pHealth: (peerId) => ipcRenderer.invoke("p2p-health", peerId),

  /**
   * Get local peer ID (for self-inference detection)
   * @returns {Promise<{ok: boolean, peerId?: string, error?: string}>}
   */
  p2pLocalPeerId: () => ipcRenderer.invoke("p2p-local-peer-id"),

  /**
   * Read file as base64 (for NFT minting of audio/video files)
   * @param {string} filePath - Absolute path to the file
   * @returns {Promise<string>} Base64-encoded file content
   */
  readFileAsBase64: (filePath) =>
    ipcRenderer.invoke("read-file-as-base64", filePath),

  // ─────────────────────────────────────────────────────────────────────────
  // Social Platform Integration (Instagram, TikTok, X)
  // ─────────────────────────────────────────────────────────────────────────

  social: {
    /** Start OAuth flow for a platform */
    oauthStart: ({ platform, companionId }) =>
      ipcRenderer.invoke("social:oauth-start", { platform, companionId }),

    /** Get stored credentials */
    getCredentials: ({ platform, companionId }) =>
      ipcRenderer.invoke("social:get-credentials", { platform, companionId }),

    /** Refresh OAuth token */
    refreshToken: ({ platform, companionId }) =>
      ipcRenderer.invoke("social:refresh-token", { platform, companionId }),

    /** Make authenticated API call through main process */
    apiCall: ({ platform, url, method, headers, body, formData }) =>
      ipcRenderer.invoke("social:api-call", { platform, url, method, headers, body, formData }),

    /** Upload media (binary) through main process */
    mediaUpload: ({ platform, url, accessToken, file, fields }) =>
      ipcRenderer.invoke("social:media-upload", { platform, url, accessToken, file, fields }),

    /** Disconnect a platform for a companion */
    disconnect: ({ platform, companionId }) =>
      ipcRenderer.invoke("social:disconnect", { platform, companionId }),

    /** Get all connected platforms for a companion */
    getConnected: ({ companionId }) =>
      ipcRenderer.invoke("social:get-connected", { companionId }),
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
