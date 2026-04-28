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
  llamaRuntimeStatus: () => ipcRenderer.invoke("llama-runtime-status"),
  broadcastModelState: () => ipcRenderer.invoke("broadcast-model-state"),
  llamaGetRpcPeers: () => ipcRenderer.invoke("llama-get-rpc-peers"),
  llamaSetRpcPeers: (peers) => ipcRenderer.invoke("llama-set-rpc-peers", peers),
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

  // ─── Multi-instance llama-server pool (Company "parallel LLM" mode) ───
  poolConfigure: (opts) => ipcRenderer.invoke("pool-configure", opts),
  poolRegisterModel: (opts) => ipcRenderer.invoke("pool-register-model", opts),
  poolEnsure: (opts) => ipcRenderer.invoke("pool-ensure", opts),
  poolChat: async (opts) => {
    const res = await ipcRenderer.invoke("pool-chat", opts);
    if (res?.ok) return res.text;
    throw new Error(res?.error || "pool chat failed");
  },
  poolInventory: () => ipcRenderer.invoke("pool-inventory"),
  poolShutdown: () => ipcRenderer.invoke("pool-shutdown"),
  /**
   * Ensure a specific LLM is loaded and ready. Idempotent — short-circuits
   * if the requested model is already running. Used by ZHC's dispatcher
   * to spawn a role's preferred model on demand.
   *
   * Pass either a model key string ("llm_qwen_3_6_28b_reap_a3b_q4") or a
   * partial spec object. Resolves keys via flagship.resolveLLM in main.
   *
   * Returns { ok, port?, filename?, cached?, error? }.
   */
  ensureModel: (modelOrKey) => ipcRenderer.invoke("model-ensure", modelOrKey),
  /**
   * Stateless streaming chat for the ZHC dispatcher. Returns the full
   * assistant text on completion. Tokens stream via `onZhcChatToken`
   * tagged with `streamId` so concurrent ticks (or Generative Text) do
   * not interleave.
   */
  zhcChatStream: ({ streamId, prompt, temperature, maxTokens, enableThinking }) =>
    ipcRenderer.invoke("zhc-chat-stream", {
      streamId, message: prompt, temperature, maxTokens, enableThinking,
    }),
  /**
   * Subscribe to ZHC stream tokens. The callback receives `{ streamId, chunk }`.
   * Returns an unsubscribe function.
   */
  onZhcChatToken: (cb) => {
    const handler = (_event, payload) => cb(payload);
    ipcRenderer.on("zhc-chat-token", handler);
    return () => ipcRenderer.removeListener("zhc-chat-token", handler);
  },
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
    // Session signer for companion wallets (non-custodial)
    getSessionSignerId: () =>
      ipcRenderer.invoke("privy:get-session-signer-id"),
    companionRpc: (walletId, method, caip2, params) =>
      ipcRenderer.invoke("privy:companion-rpc", { walletId, method, caip2, params }),
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Non-Custodial Wallet Bridge (BrowserView → bonzai.sh/wallet)
  // User controls their own keys. Desktop app delegates signing.
  // ─────────────────────────────────────────────────────────────────────────
  wallet: {
    open: (opts) => ipcRenderer.invoke("wallet:open", opts),
    signRequest: (request) => ipcRenderer.invoke("wallet:sign-request", request),
    getAddress: () => ipcRenderer.invoke("wallet:get-address"),
    close: () => ipcRenderer.invoke("wallet:close"),
  },

  /**
   * Listen for wallet address from BrowserView bridge
   */
  onWalletAddress: (handler) => {
    const wrapped = (_event, address) => handler(address);
    ipcRenderer.on("wallet:address", wrapped);
    return () => ipcRenderer.removeListener("wallet:address", wrapped);
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Open Wallet Standard (OWS) — encrypted vault-based wallets via NAPI-RS
  // ─────────────────────────────────────────────────────────────────────────
  ows: {
    createWallet: (opts) => ipcRenderer.invoke("ows:create-wallet", opts),
    listWallets: () => ipcRenderer.invoke("ows:list-wallets"),
    getWallet: (nameOrId) => ipcRenderer.invoke("ows:get-wallet", nameOrId),
    deleteWallet: (nameOrId) => ipcRenderer.invoke("ows:delete-wallet", nameOrId),
    signMessage: (opts) => ipcRenderer.invoke("ows:sign-message", opts),
    signTypedData: (opts) => ipcRenderer.invoke("ows:sign-typed-data", opts),
    signTransaction: (opts) => ipcRenderer.invoke("ows:sign-transaction", opts),
    signAndSend: (opts) => ipcRenderer.invoke("ows:sign-and-send", opts),
    createApiKey: (opts) => ipcRenderer.invoke("ows:create-api-key", opts),
    listApiKeys: () => ipcRenderer.invoke("ows:list-api-keys"),
    revokeApiKey: (id) => ipcRenderer.invoke("ows:revoke-api-key", id),
    createPolicy: (json) => ipcRenderer.invoke("ows:create-policy", json),
    listPolicies: () => ipcRenderer.invoke("ows:list-policies"),
    getPolicy: (id) => ipcRenderer.invoke("ows:get-policy", id),
    deletePolicy: (id) => ipcRenderer.invoke("ows:delete-policy", id),
    exportWallet: (opts) => ipcRenderer.invoke("ows:export-wallet", opts),
    importPrivateKey: (opts) => ipcRenderer.invoke("ows:import-private-key", opts),
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
   * @param {string} request.pipeline - Pipeline name (e.g. 'image_turbo', 'llm')
   * @param {Record<string, unknown>} request.params - Pipeline-specific parameters
   * @param {string} [request.paymentTxHash] - x402 payment transaction hash
   * @returns {Promise<{ok: boolean, result?: Record<string, unknown>, error?: string}>}
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
   * Get LAN-discovered peers (via mDNS) — free providers on local network
   * @returns {Promise<{ok: boolean, peers: Array<{peerId: string, multiaddrs: string[], discoveredAt: number, free: boolean}>}>}
   */
  p2pLANPeers: () => ipcRenderer.invoke("p2p-lan-peers"),

  /**
   * Route an inference request — automatically sends to selected provider (LAN/remote)
   * or falls back to local Flask/OpenClaw.
   * @param {string} pipeline - Pipeline name (e.g. 'image_turbo', 'audio_turbo', 'llm')
   * @param {Record<string, unknown>} params - Pipeline-specific request parameters
   * @returns {Promise<{ok: boolean, result?: Record<string, unknown>, remote?: boolean, error?: string}>}
   */
  inferenceRequest: (pipeline, params) => ipcRenderer.invoke("inference-request", { pipeline, params }),

  /**
   * Listen for LAN peer discovery events (from main process)
   */
  /**
   * Listen for Privy OAuth callback (deep link from browser)
   */
  onPrivyOAuthCallback: (handler) => {
    ipcRenderer.on("privy-oauth-callback", handler);
    return () => ipcRenderer.removeListener("privy-oauth-callback", handler);
  },

  onLANPeerDiscovered: (handler) => {
    ipcRenderer.on("lan-peer-discovered", handler);
    return () => ipcRenderer.removeListener("lan-peer-discovered", handler);
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // Pipeline Private Inference (v2)
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Run private pipeline inference across multiple peers
   * @param {Object} opts
   * @param {string} opts.modelPath - Path to GGUF model file
   * @param {Object} opts.request - Inference request
   * @param {string} opts.request.prompt - User prompt
   * @param {number} [opts.request.maxTokens] - Maximum tokens to generate
   * @param {Object} [opts.privacyConfig] - Privacy configuration
   * @param {number} [opts.privacyConfig.localProportion] - Fraction processed locally (0-1)
   * @param {boolean} [opts.privacyConfig.dpEnabled] - Enable differential privacy
   * @param {number} [opts.privacyConfig.epsilon] - DP epsilon parameter
   * @returns {Promise<{ok: boolean, text?: string, tokensGenerated?: number, elapsed?: number, peersUsed?: number, sessionId?: string}>}
   */
  p2pPipelineInfer: (opts) => ipcRenderer.invoke("p2p-pipeline-infer", opts),

  /**
   * Get active pipeline session status
   * @returns {Promise<{ok: boolean, active: boolean, sessionId?: string, status?: string, peersUsed?: number, elapsed?: number}>}
   */
  p2pPipelineStatus: () => ipcRenderer.invoke("p2p-pipeline-status"),

  /**
   * Cancel the active pipeline session
   * @returns {Promise<{ok: boolean}>}
   */
  p2pPipelineCancel: () => ipcRenderer.invoke("p2p-pipeline-cancel"),

  /**
   * Start local rpc-server for shard provider mode
   * @param {Object} opts
   * @param {number} [opts.port] - Port for the RPC server
   * @returns {Promise<{ok: boolean, rpcPort?: number}>}
   */
  p2pShardStart: (opts) => ipcRenderer.invoke("p2p-shard-start", opts),

  /**
   * Stop local rpc-server
   * @returns {Promise<{ok: boolean}>}
   */
  p2pShardStop: () => ipcRenderer.invoke("p2p-shard-stop"),

  /**
   * Read GGUF model metadata (layer count, dims, architecture)
   * @param {string} modelPath - Path to GGUF model file
   * @returns {Promise<{ok: boolean, n_layer?: number, n_embd?: number, architecture?: string}>}
   */
  p2pShardMetadata: (modelPath) => ipcRenderer.invoke("p2p-shard-metadata", { modelPath }),

  /**
   * Subscribe to pipeline token streaming
   * @param {Function} cb Token chunk callback
   * @returns {Function} Unsubscribe function
   */
  onPipelineToken: (cb) => {
    const handler = (_event, chunk) => cb(chunk);
    ipcRenderer.on("pipeline-token", handler);
    return () => ipcRenderer.removeListener("pipeline-token", handler);
  },

  /**
   * Subscribe to pipeline status updates
   * @param {Function} cb Status message callback
   * @returns {Function} Unsubscribe function
   */
  onPipelineStatus: (cb) => {
    const handler = (_event, msg) => cb(msg);
    ipcRenderer.on("pipeline-status", handler);
    return () => ipcRenderer.removeListener("pipeline-status", handler);
  },
  onPipelineError: (cb) => {
    const handler = (_event, err) => cb(err);
    ipcRenderer.on("pipeline-error", handler);
    return () => ipcRenderer.removeListener("pipeline-error", handler);
  },

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
   * @param {Record<string, string|number|boolean>} [params] - Query parameters
   * @returns {Promise<{success: boolean, data?: Record<string, unknown>|Array, error?: string}>}
   */
  fetch: (endpoint, params) =>
    ipcRenderer.invoke("polymarket:fetch", { endpoint, params }),

  /**
   * Batch fetch multiple endpoints in parallel
   * @param {Array<{endpoint: string, params?: Record<string, string|number|boolean>}>} requests
   * @returns {Promise<Array<{success: boolean, data?: Record<string, unknown>|Array, error?: string}>>}
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
   * @param {Object} [options] - Fetch options
   * @param {string} [options.method] - HTTP method (GET, POST, etc.)
   * @param {Record<string, string>} [options.headers] - Request headers
   * @param {string|Record<string, unknown>} [options.body] - Request body
   * @returns {Promise<{success: boolean, data?: Record<string, unknown>|Array|string, error?: string}>}
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
