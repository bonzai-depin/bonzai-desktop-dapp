// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts
const { contextBridge, ipcRenderer } = require("electron");
import { COMPANY_OPERATIONS } from './shared/companyOperations.js';

const operationalApi = Object.fromEntries(Object.entries(COMPANY_OPERATIONS).map(([namespace, methods]) => [namespace, {
  ...Object.fromEntries([...methods.reads, ...methods.writes, ...(['companyBilling', 'purchasing'].includes(namespace) ? ['generateDocument'] : []), ...(namespace === 'companyBilling' ? ['chorusAction'] : [])].map(method => [method, (companyId, ...args) => ipcRenderer.invoke(`db:${namespace}:${method}`, companyId, ...args)])),
  onChanged: callback => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on(`db:${namespace}:changed`, handler);
    return () => ipcRenderer.removeListener(`db:${namespace}:changed`, handler);
  },
}]));

contextBridge.exposeInMainWorld("electronAPI", {
  publicStorage: Object.fromEntries(['status', 'receipts', 'configure', 'disconnect', 'upload', 'uploadMetadata'].map(method => [method, payload => ipcRenderer.invoke(`public-storage:${method}`, payload)])),
  workspace: Object.fromEntries(['status','checkout','verify','backup','restore','demo','demoOpen'].map(method => [method, (...args) => ipcRenderer.invoke('workspace:'+method,...args)])),
  onWorkspaceDemo: cb => { const h=(_e,v)=>cb(v); ipcRenderer.on('workspace:demo-progress',h); return ()=>ipcRenderer.removeListener('workspace:demo-progress',h); },
  companyRuntime: {
    invoke: (name, args = []) => ipcRenderer.invoke('company-runtime:invoke', name, args),
    ready: error => ipcRenderer.send('company-runtime:ready', error),
    result: result => ipcRenderer.send('company-runtime:result', result),
    stream: event => ipcRenderer.send('company-runtime:stream', event),
    onCommand: cb => { const h = (_e, value) => cb(value); ipcRenderer.on('company-runtime:command', h); return () => ipcRenderer.removeListener('company-runtime:command', h); },
    onStream: cb => { const h = (_e, value) => cb(value); ipcRenderer.on('company-runtime:stream', h); return () => ipcRenderer.removeListener('company-runtime:stream', h); },
    onStatus: cb => { const h = (_e, value) => cb(value); ipcRenderer.on('company-runtime:status', h); return () => ipcRenderer.removeListener('company-runtime:status', h); },
  },
  robinhood: {
    connect: () => ipcRenderer.invoke("robinhood-mcp:connect"),
    status: () => ipcRenderer.invoke("robinhood-mcp:status"),
    callTool: (request) => ipcRenderer.invoke("robinhood-mcp:call-tool", request),
    disconnect: () => ipcRenderer.invoke("robinhood-mcp:disconnect"),
    onState: (cb) => {
      const handler = (_event, state) => cb(state);
      ipcRenderer.on("robinhood-mcp:state", handler);
      return () => ipcRenderer.removeListener("robinhood-mcp:state", handler);
    },
  },
  // App version for window title
  getAppVersion: () => ipcRenderer.invoke("get-app-version"),
  // Platform info (exposed synchronously from preload context)
  platform: process.platform,
  arch: process.arch,
  copyText: (text) => ipcRenderer.invoke("clipboard-copy-text", text),
  startServer: () => ipcRenderer.invoke("start-server"),
  stopServer: () => ipcRenderer.invoke("stop-server"),
  restartServer: () => ipcRenderer.invoke("restart-server"),
  systemInformation: () => ipcRenderer.invoke("system-information"),
  performanceBenchmark: {
    run: options => ipcRenderer.invoke('benchmark:run', options),
    onProgress: callback => {
      const listener = (_event, value) => callback(value);
      ipcRenderer.on('benchmark:progress', listener);
      return () => ipcRenderer.removeListener('benchmark:progress', listener);
    },
    begin3d: (mode, model) => ipcRenderer.invoke('benchmark:begin3d', { mode, model }),
    finish3d: (id, trace) => ipcRenderer.invoke('benchmark:finish3d', { id, trace }),
    list: () => ipcRenderer.invoke('benchmark:list'),
    report: id => ipcRenderer.invoke('benchmark:report', id),
    stop: () => ipcRenderer.invoke('benchmark:stop'),
    snapshot: id => ipcRenderer.invoke('benchmark:snapshot', id),
    export: id => ipcRenderer.invoke('benchmark:export', id),
    archive: (id, receipt) => ipcRenderer.invoke('benchmark:archive', { id, receipt }),
  },
  checkModel: (modelname) => ipcRenderer.invoke("model-check", modelname),
  downloadModel: (url, filename) =>
    ipcRenderer.invoke("model-download", url, filename),
  cancelModelDownload: (filename) =>
    ipcRenderer.invoke("model-download-cancel", filename),
  onDownloadProgress: (cb) => {
    const handler = (event, data) => cb(event, data);
    ipcRenderer.on("download-progress", handler);
    return () => ipcRenderer.removeListener("download-progress", handler);
  },
  getActiveDownloads: () => ipcRenderer.invoke("get-active-downloads"),
  listCustomModels: () => ipcRenderer.invoke("model-list-custom"),
  importLocalModel: () => ipcRenderer.invoke("model-import-gguf"),
  deleteModel: (modelname) => ipcRenderer.invoke("model-delete", modelname),
  loadModel: (modelname) => ipcRenderer.invoke("model-load", modelname),
  unloadModel: () => ipcRenderer.invoke("model-unload"),
  getLoadedModel: () => ipcRenderer.invoke("model-get-loaded"),
  completionBudget: (prompt, maxTokens) => ipcRenderer.invoke('model-completion-budget', { prompt, maxTokens }),
  llamaRuntimeStatus: () => ipcRenderer.invoke("llama-runtime-status"),
  localExecutionStatus: () => ipcRenderer.invoke("local-execution-status"),
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
  setSystemPrompt: (prompt) => ipcRenderer.invoke("model-set-system-prompt", prompt),
  chatStream: (userMessage, options = {}) => ipcRenderer.invoke("model-chat-stream", { message: userMessage, ...options }),
  abortChatStream: () => ipcRenderer.invoke("model-abort-chat-stream"),
  usage: {
    getLifetimeTokens: () => ipcRenderer.invoke("usage:get-lifetime-tokens"),
    onLifetimeTokensChanged: (cb) => {
      const handler = (_event, total) => cb(total);
      ipcRenderer.on("usage:lifetime-tokens-changed", handler);
      return () => ipcRenderer.removeListener("usage:lifetime-tokens-changed", handler);
    },
  },

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
   * Pass either a model key string ("llm_qwen_3_6_35b_a3b_q4") or a
   * partial spec object. Resolves keys via flagship.resolveLLM in main.
   *
   * Returns { ok, port?, filename?, cached?, error? }.
   */
  ensureModel: (modelOrKey) => ipcRenderer.invoke("model-ensure", modelOrKey),

  /**
   * Local data layer (better-sqlite3 + Drizzle). Renderer-side service
   * modules call these instead of touching electron-store for per-table
   * data. New tables get wired here as the migration progresses.
   */
  db: {
    ...operationalApi,
    automation: {
      renew: (id, runId, leaseMs) => ipcRenderer.invoke("db:automation:renew", id, runId, leaseMs),
      begin: (companyId, input) => ipcRenderer.invoke("db:automation:begin", companyId, input),
      finish: (companyId, runId, input) => ipcRenderer.invoke("db:automation:finish", companyId, runId, input),
      state: (companyId) => ipcRenderer.invoke("db:automation:state", companyId),
      recent: (companyId, limit) => ipcRenderer.invoke("db:automation:recent", companyId, limit),
      recover: (companyId, staleBefore) => ipcRenderer.invoke("db:automation:recover", companyId, staleBefore),
      clear: (companyId) => ipcRenderer.invoke("db:automation:clear", companyId),
      onChanged: (cb) => {
        const h = (_e, payload) => cb(payload);
        ipcRenderer.on("db:automation:changed", h);
        return () => ipcRenderer.removeListener("db:automation:changed", h);
      },
    },
    audit: {
      append: (companyId, entry) => ipcRenderer.invoke("db:audit:append", companyId, entry),
      recent: (companyId, n) => ipcRenderer.invoke("db:audit:recent", companyId, n),
      all: (companyId) => ipcRenderer.invoke("db:audit:all", companyId),
      filter: (companyId, opts) => ipcRenderer.invoke("db:audit:filter", companyId, opts),
      summarize: (companyId, windowMs) => ipcRenderer.invoke("db:audit:summarize", companyId, windowMs),
      clear: (companyId) => ipcRenderer.invoke("db:audit:clear", companyId),
      remove: (companyId, entryId) => ipcRenderer.invoke("db:audit:remove", companyId, entryId),
      bulkInsert: (rows) => ipcRenderer.invoke("db:audit:bulkInsert", rows),
      /** Subscribe to "table changed" broadcasts. cb receives { companyId }. */
      onChanged: (cb) => {
        const handler = (_event, payload) => cb(payload);
        ipcRenderer.on("db:audit:changed", handler);
        return () => ipcRenderer.removeListener("db:audit:changed", handler);
      },
    },
    generations: {
      /**
       * Create a generation row. Pass `input` as the typed shape and
       * optional `blobInputs` for output media:
       *   blobInputs = [{ base64, ext, role: "image"|"audio"|"video"|"thumbnail", mime?, width?, height?, durationMs? }]
       * The main process writes the blobs first, then inserts the row.
       */
      create: (input, blobInputs) => ipcRenderer.invoke("db:generations:create", input, blobInputs),
      list: (filter) => ipcRenderer.invoke("db:generations:list", filter),
      get: (id) => ipcRenderer.invoke("db:generations:get", id),
      update: (id, patch) => ipcRenderer.invoke("db:generations:update", id, patch),
      delete: (id) => ipcRenderer.invoke("db:generations:delete", id),
      searchByPrompt: (query, opts) => ipcRenderer.invoke("db:generations:searchByPrompt", query, opts),
      countsByPipeline: () => ipcRenderer.invoke("db:generations:countsByPipeline"),
      bulkInsert: (rows) => ipcRenderer.invoke("db:generations:bulkInsert", rows),
      onChanged: (cb) => {
        const handler = (_event, payload) => cb(payload);
        ipcRenderer.on("db:generations:changed", handler);
        return () => ipcRenderer.removeListener("db:generations:changed", handler);
      },
    },
    blobs: {
      /** Write base64 → file. Returns `{ id, path, dedup }`. */
      write: (base64, ext, meta) => ipcRenderer.invoke("db:blobs:write", base64, ext, meta),
      /** Read a local file path → blob store. For Flask audio_path / video_path. */
      writeFromPath: (srcPath, ext, meta) => ipcRenderer.invoke("db:blobs:writeFromPath", srcPath, ext, meta),
      /** Raw bytes (Uint8Array). Use `url()` for `<img>` binding. */
      read: (id, ext) => ipcRenderer.invoke("db:blobs:read", id, ext),
      /** Convenience: returns a `data:<mime>;base64,…` URL. */
      url: (id, ext, mime) => ipcRenderer.invoke("db:blobs:url", id, ext, mime),
      get: (id) => ipcRenderer.invoke("db:blobs:get", id),
      recent: (opts) => ipcRenderer.invoke("db:blobs:recent", opts),
      diskUsage: () => ipcRenderer.invoke("db:blobs:diskUsage"),
      sweepOrphans: () => ipcRenderer.invoke("db:blobs:sweepOrphans"),
    },
    companyPortability: {
      export: (id, options) => ipcRenderer.invoke('db:companyPortability:export', id, options),
      import: (bundle, options) => ipcRenderer.invoke('db:companyPortability:import', bundle, options),
    },
    companies: {
      save: (charter) => ipcRenderer.invoke("db:companies:save", charter),
      get: (id) => ipcRenderer.invoke("db:companies:get", id),
      list: () => ipcRenderer.invoke("db:companies:list"),
      listIds: () => ipcRenderer.invoke("db:companies:listIds"),
      setStatus: (id, status) => ipcRenderer.invoke("db:companies:setStatus", id, status),
      remove: (id) => ipcRenderer.invoke("db:companies:remove", id),
      bulkInsert: (rows) => ipcRenderer.invoke("db:companies:bulkInsert", rows),
      onChanged: (cb) => {
        const h = (_e, p) => cb(p);
        ipcRenderer.on("db:companies:changed", h);
        return () => ipcRenderer.removeListener("db:companies:changed", h);
      },
    },
    goals: {
      createWithTasks: (companyId, input, tasks) => ipcRenderer.invoke("db:goals:createWithTasks", companyId, input, tasks),
      create: (companyId, input) => ipcRenderer.invoke("db:goals:create", companyId, input),
      list: (companyId, filter) => ipcRenderer.invoke("db:goals:list", companyId, filter),
      get: (companyId, goalId) => ipcRenderer.invoke("db:goals:get", companyId, goalId),
      update: (companyId, goalId, patch) => ipcRenderer.invoke("db:goals:update", companyId, goalId, patch),
      cancel: (companyId, goalId, reason) => ipcRenderer.invoke("db:goals:cancel", companyId, goalId, reason),
      complete: (companyId, goalId) => ipcRenderer.invoke("db:goals:complete", companyId, goalId),
      maybeComplete: (companyId, goalId, siblings) => ipcRenderer.invoke("db:goals:maybeComplete", companyId, goalId, siblings),
      counts: (companyId) => ipcRenderer.invoke("db:goals:counts", companyId),
      clear: (companyId) => ipcRenderer.invoke("db:goals:clear", companyId),
      bulkInsert: (rows) => ipcRenderer.invoke("db:goals:bulkInsert", rows),
      onChanged: (cb) => {
        const h = (_e, p) => cb(p);
        ipcRenderer.on("db:goals:changed", h);
        return () => ipcRenderer.removeListener("db:goals:changed", h);
      },
    },
    issues: {
      wakeTeamWaits: id => ipcRenderer.invoke('db:issues:wakeTeamWaits', id),
      answerQuestion: (id, issueId, answer) => ipcRenderer.invoke('db:issues:answerQuestion', id, issueId, answer),
      reconcileExecution: (id, issueId, stepId, input) => ipcRenderer.invoke('db:issues:reconcileExecution', id, issueId, stepId, input),
      saveWorkflowResult: (companyId, issueId, input) => ipcRenderer.invoke('db:issues:saveWorkflowResult', companyId, issueId, input),
      reviewWorkflowResult: (companyId, issueId, stepId, input) => ipcRenderer.invoke('db:issues:reviewWorkflowResult', companyId, issueId, stepId, input),
      saveExecution: (companyId, id, execution, revision) => ipcRenderer.invoke("db:issues:saveExecution", companyId, id, execution, revision),
      resumeApproval: (companyId, id) => ipcRenderer.invoke("db:issues:resumeApproval", companyId, id),
      create: (companyId, input) => ipcRenderer.invoke("db:issues:create", companyId, input),
      list: (companyId, filter) => ipcRenderer.invoke("db:issues:list", companyId, filter),
      get: (companyId, id) => ipcRenderer.invoke("db:issues:get", companyId, id),
      update: (companyId, id, patch) => ipcRenderer.invoke("db:issues:update", companyId, id, patch),
      reopen: (companyId, id) => ipcRenderer.invoke("db:issues:reopen", companyId, id),
      remove: (companyId, id) => ipcRenderer.invoke("db:issues:remove", companyId, id),
      nextForRole: (companyId, roleKey, currentCompanion) => ipcRenderer.invoke("db:issues:nextForRole", companyId, roleKey, currentCompanion),
      claimNextForRole: (companyId, roleKey, currentCompanion) => ipcRenderer.invoke("db:issues:claimNextForRole", companyId, roleKey, currentCompanion),
      startAttempt: (companyId, issueId, role, companion) => ipcRenderer.invoke("db:issues:startAttempt", companyId, issueId, role, companion),
      finishAttempt: (companyId, issueId, outcome) => ipcRenderer.invoke("db:issues:finishAttempt", companyId, issueId, outcome),
      attempts: (issueId) => ipcRenderer.invoke("db:issues:attempts", issueId),
      counts: (companyId) => ipcRenderer.invoke("db:issues:counts", companyId),
      recoverStale: (companyId, staleBefore) => ipcRenderer.invoke("db:issues:recoverStale", companyId, staleBefore),
      clear: (companyId) => ipcRenderer.invoke("db:issues:clear", companyId),
      bulkInsert: (rows) => ipcRenderer.invoke("db:issues:bulkInsert", rows),
      onChanged: (cb) => {
        const h = (_e, p) => cb(p);
        ipcRenderer.on("db:issues:changed", h);
        return () => ipcRenderer.removeListener("db:issues:changed", h);
      },
    },
    teams: {
      list: id => ipcRenderer.invoke('db:teams:list',id),
      directory: id => ipcRenderer.invoke('db:teams:directory',id),
      read: (id,thread) => ipcRenderer.invoke('db:teams:read',id,thread),
      request: (id,input) => ipcRenderer.invoke('db:teams:request',id,input),
      reply: (id,input) => ipcRenderer.invoke('db:teams:reply',id,input),
      execute: (id,type,input,context) => ipcRenderer.invoke('db:teams:execute',id,type,input,context),
      onChanged: cb => {const h=(_e,data)=>cb(data);ipcRenderer.on('db:teams:changed',h);return ()=>ipcRenderer.removeListener('db:teams:changed',h);},
    },
    gmao: {
      saveClient: (companyId, ...args) => ipcRenderer.invoke("db:gmao:saveClient", companyId, ...args),
      saveServiceContract: (companyId, ...args) => ipcRenderer.invoke("db:gmao:saveServiceContract", companyId, ...args),
      saveSupplier: (companyId, ...args) => ipcRenderer.invoke("db:gmao:saveSupplier", companyId, ...args),
      acknowledgeHandoff: (companyId, ...args) => ipcRenderer.invoke("db:gmao:acknowledgeHandoff", companyId, ...args),
      saveOutbox: (companyId, ...args) => ipcRenderer.invoke("db:gmao:saveOutbox", companyId, ...args),
      resolveOutbox: (companyId, ...args) => ipcRenderer.invoke("db:gmao:resolveOutbox", companyId, ...args),
      getDossier: (companyId, ...args) => ipcRenderer.invoke("db:gmao:getDossier", companyId, ...args),
      searchWorkOrders: (companyId, ...args) => ipcRenderer.invoke("db:gmao:searchWorkOrders", companyId, ...args),
      generateDocument: (companyId, ...args) => ipcRenderer.invoke("db:gmao:generateDocument", companyId, ...args),
      sendOutbox: (companyId, ...args) => ipcRenderer.invoke("db:gmao:sendOutbox", companyId, ...args),
      checkDelivery: (companyId, ...args) => ipcRenderer.invoke("db:gmao:checkDelivery", companyId, ...args),

      bootstrap: (companyId, input) => ipcRenderer.invoke("db:gmao:bootstrap", companyId, input),
      snapshot: (companyId, now) => ipcRenderer.invoke("db:gmao:snapshot", companyId, now),
      saveContract: (companyId, input) => ipcRenderer.invoke("db:gmao:saveContract", companyId, input),
      saveSite: (companyId, input) => ipcRenderer.invoke("db:gmao:saveSite", companyId, input),
      saveAsset: (companyId, input) => ipcRenderer.invoke("db:gmao:saveAsset", companyId, input),
      importAssets: (companyId, rows) => ipcRenderer.invoke("db:gmao:importAssets", companyId, rows),
      savePlan: (companyId, input) => ipcRenderer.invoke("db:gmao:savePlan", companyId, input),
      createWorkOrder: (companyId, input) => ipcRenderer.invoke("db:gmao:createWorkOrder", companyId, input),
      updateWorkOrder: (companyId, id, input) => ipcRenderer.invoke("db:gmao:updateWorkOrder", companyId, id, input),
      transitionWorkOrder: (companyId, id, status, input) => ipcRenderer.invoke("db:gmao:transitionWorkOrder", companyId, id, status, input),
      addEvent: (companyId, workOrderId, input) => ipcRenderer.invoke("db:gmao:addEvent", companyId, workOrderId, input),
      recordAttachmentSheet: (companyId, workOrderId, input) => ipcRenderer.invoke("db:gmao:recordAttachmentSheet", companyId, workOrderId, input),
      saveProcurement: (companyId, input) => ipcRenderer.invoke("db:gmao:saveProcurement", companyId, input),
      saveNotification: (companyId, input) => ipcRenderer.invoke("db:gmao:saveNotification", companyId, input),
      addDocument: (companyId, input) => ipcRenderer.invoke("db:gmao:addDocument", companyId, input),
      saveCompliance: (companyId, input) => ipcRenderer.invoke("db:gmao:saveCompliance", companyId, input),
      saveSubcontractor: (companyId, input) => ipcRenderer.invoke("db:gmao:saveSubcontractor", companyId, input),
      saveRate: (companyId, input) => ipcRenderer.invoke("db:gmao:saveRate", companyId, input),
      createQuote: (companyId, workOrderId, input) => ipcRenderer.invoke("db:gmao:createQuote", companyId, workOrderId, input),
      updateQuote: (companyId, quoteId, input) => ipcRenderer.invoke("db:gmao:updateQuote", companyId, quoteId, input),
      validateProcessStep: (companyId, workOrderId, input) => ipcRenderer.invoke("db:gmao:validateProcessStep", companyId, workOrderId, input),
      recordServiceAcceptance: (companyId, workOrderId, input) => ipcRenderer.invoke("db:gmao:recordServiceAcceptance", companyId, workOrderId, input),
      saveInvoice: (companyId, input) => ipcRenderer.invoke("db:gmao:saveInvoice", companyId, input),
      saveOnCallShift: (companyId, input) => ipcRenderer.invoke("db:gmao:saveOnCallShift", companyId, input),
      generatePreventive: (companyId, now) => ipcRenderer.invoke("db:gmao:generatePreventive", companyId, now),
      evaluateSla: (companyId, now) => ipcRenderer.invoke("db:gmao:evaluateSla", companyId, now),
      ingestDocument: (companyId, input) => ipcRenderer.invoke("db:gmao:ingestDocument", companyId, input),
      applyDocumentIntake: (companyId, id, input) => ipcRenderer.invoke("db:gmao:applyDocumentIntake", companyId, id, input),
      resolveRecommendation: (companyId, id, status, input) => ipcRenderer.invoke("db:gmao:resolveRecommendation", companyId, id, status, input),
      recommendSchedule: (companyId, workOrderId, candidates) => ipcRenderer.invoke("db:gmao:recommendSchedule", companyId, workOrderId, candidates),
      recordAssetSignal: (companyId, assetId, input) => ipcRenderer.invoke("db:gmao:recordAssetSignal", companyId, assetId, input),
      saveBillingLine: (companyId, input) => ipcRenderer.invoke("db:gmao:saveBillingLine", companyId, input),
      reconcileBilling: (companyId, workOrderId) => ipcRenderer.invoke("db:gmao:reconcileBilling", companyId, workOrderId),
      runAutomation: (companyId, now) => ipcRenderer.invoke("db:gmao:runAutomation", companyId, now),
      exportWeeklyRegister: (companyId, options) => ipcRenderer.invoke("db:gmao:exportWeeklyRegister", companyId, options),
      exportInventory: (companyId) => ipcRenderer.invoke("db:gmao:exportInventory", companyId),
      onChanged: (cb) => {
        const h = (_e, payload) => cb(payload);
        ipcRenderer.on("db:gmao:changed", h);
        return () => ipcRenderer.removeListener("db:gmao:changed", h);
      },
    },
    treasury: {
      getState: (companyId) => ipcRenderer.invoke("db:treasury:getState", companyId),
      recordRevenue: (companyId, opts) => ipcRenderer.invoke("db:treasury:recordRevenue", companyId, opts),
      paySupplier: (companyId, opts) => ipcRenderer.invoke("db:treasury:paySupplier", companyId, opts),
      listEntries: (companyId, opts) => ipcRenderer.invoke("db:treasury:listEntries", companyId, opts),
      reset: (companyId) => ipcRenderer.invoke("db:treasury:reset", companyId),
      bulkInsertState: (rows) => ipcRenderer.invoke("db:treasury:bulkInsertState", rows),
      bulkInsertEntries: (rows) => ipcRenderer.invoke("db:treasury:bulkInsertEntries", rows),
      onChanged: (cb) => {
        const h = (_e, p) => cb(p);
        ipcRenderer.on("db:treasury:changed", h);
        return () => ipcRenderer.removeListener("db:treasury:changed", h);
      },
    },
    approvals: {
      enqueue: (companyId, opts) => ipcRenderer.invoke("db:approvals:enqueue", companyId, opts),
      pending: (companyId) => ipcRenderer.invoke("db:approvals:pending", companyId),
      approve: (companyId, pendingId) => ipcRenderer.invoke("db:approvals:approve", companyId, pendingId),
      reject: (companyId, pendingId, reason) => ipcRenderer.invoke("db:approvals:reject", companyId, pendingId, reason),
      clear: (companyId) => ipcRenderer.invoke("db:approvals:clear", companyId),
      bulkInsert: (rows) => ipcRenderer.invoke("db:approvals:bulkInsert", rows),
      onChanged: (cb) => {
        const h = (_e, p) => cb(p);
        ipcRenderer.on("db:approvals:changed", h);
        return () => ipcRenderer.removeListener("db:approvals:changed", h);
      },
    },
    distribution: {
      publish: (companyId, opts) => ipcRenderer.invoke("db:distribution:publish", companyId, opts),
      listCatalog: (companyId) => ipcRenderer.invoke("db:distribution:listCatalog", companyId),
      getRecord: (companyId, id) => ipcRenderer.invoke("db:distribution:getRecord", companyId, id),
      clear: (companyId) => ipcRenderer.invoke("db:distribution:clear", companyId),
      remove: (companyId, id) => ipcRenderer.invoke("db:distribution:remove", companyId, id),
      bulkInsert: (rows) => ipcRenderer.invoke("db:distribution:bulkInsert", rows),
      onChanged: (cb) => {
        const h = (_e, p) => cb(p);
        ipcRenderer.on("db:distribution:changed", h);
        return () => ipcRenderer.removeListener("db:distribution:changed", h);
      },
    },
    connectors: {
      create: (companyId, input) => ipcRenderer.invoke("db:connectors:create", companyId, input),
      list: (companyId, filter) => ipcRenderer.invoke("db:connectors:list", companyId, filter),
      get: (companyId, id) => ipcRenderer.invoke("db:connectors:get", companyId, id),
      getByKind: (companyId, kind) => ipcRenderer.invoke("db:connectors:getByKind", companyId, kind),
      update: (companyId, id, patch) => ipcRenderer.invoke("db:connectors:update", companyId, id, patch),
      setSecretRef: (companyId, id, secretRef) => ipcRenderer.invoke("db:connectors:setSecretRef", companyId, id, secretRef),
      revoke: (companyId, id, reason) => ipcRenderer.invoke("db:connectors:revoke", companyId, id, reason),
      remove: (companyId, id) => ipcRenderer.invoke("db:connectors:remove", companyId, id),
      healthSummary: (companyId) => ipcRenderer.invoke("db:connectors:healthSummary", companyId),
      clear: (companyId) => ipcRenderer.invoke("db:connectors:clear", companyId),
      bulkInsert: (rows) => ipcRenderer.invoke("db:connectors:bulkInsert", rows),
      onChanged: (cb) => {
        const h = (_e, p) => cb(p);
        ipcRenderer.on("db:connectors:changed", h);
        return () => ipcRenderer.removeListener("db:connectors:changed", h);
      },
    },
    companions: {
      upsert: (record) => ipcRenderer.invoke("db:companions:upsert", record),
      get: (id) => ipcRenderer.invoke("db:companions:get", id),
      list: (filter) => ipcRenderer.invoke("db:companions:list", filter),
      remove: (id) => ipcRenderer.invoke("db:companions:remove", id),
      bulkInsert: (rows) => ipcRenderer.invoke("db:companions:bulkInsert", rows),
      replaceRoster: (rows) => ipcRenderer.invoke("db:companions:replaceRoster", rows),
      memoryAdd: (companionId, mem) => ipcRenderer.invoke("db:companions:memoryAdd", companionId, mem),
      memoryList: (companionId, scope) => ipcRenderer.invoke("db:companions:memoryList", companionId, scope),
      memoryRecall: (companionId, scope, limit) => ipcRenderer.invoke("db:companions:memoryRecall", companionId, scope, limit),
      memoryRemove: (memoryId) => ipcRenderer.invoke("db:companions:memoryRemove", memoryId),
      memoryClear: (companionId) => ipcRenderer.invoke("db:companions:memoryClear", companionId),
      memoryBulkInsert: (rows) => ipcRenderer.invoke("db:companions:memoryBulkInsert", rows),
      onChanged: (cb) => {
        const h = (_e, p) => cb(p);
        ipcRenderer.on("db:companions:changed", h);
        return () => ipcRenderer.removeListener("db:companions:changed", h);
      },
    },
    memory: {
      exists: (scope, id) => ipcRenderer.invoke("db:memory:exists", scope, id),
      load: (scope, id) => ipcRenderer.invoke("db:memory:load", scope, id),
      save: (memory) => ipcRenderer.invoke("db:memory:save", memory),
      recall: (scope, id, query, limit) => ipcRenderer.invoke("db:memory:recall", scope, id, query, limit),
      onChanged: (cb) => {
        const h = (_e, payload) => cb(payload);
        ipcRenderer.on("db:memory:changed", h);
        return () => ipcRenderer.removeListener("db:memory:changed", h);
      },
    },
    jobs: {
      create: (input) => ipcRenderer.invoke("db:jobs:create", input),
      list: (filter) => ipcRenderer.invoke("db:jobs:list", filter),
      get: (id) => ipcRenderer.invoke("db:jobs:get", id),
      setStatus: (id, status) => ipcRenderer.invoke("db:jobs:setStatus", id, status),
      apply: (jobId, input) => ipcRenderer.invoke("db:jobs:apply", jobId, input),
      applications: (jobId) => ipcRenderer.invoke("db:jobs:applications", jobId),
      hire: (jobId, applicationId) => ipcRenderer.invoke("db:jobs:hire", jobId, applicationId),
      contract: (jobId) => ipcRenderer.invoke("db:jobs:contract", jobId),
      addMilestone: (contractId, input) => ipcRenderer.invoke("db:jobs:addMilestone", contractId, input),
      milestones: (contractId) => ipcRenderer.invoke("db:jobs:milestones", contractId),
      submitEvidence: (id, evidence) => ipcRenderer.invoke("db:jobs:submitEvidence", id, evidence),
      approveMilestone: (id) => ipcRenderer.invoke("db:jobs:approveMilestone", id),
      review: (contractId, input) => ipcRenderer.invoke("db:jobs:review", contractId, input),
      reputation: (companionId) => ipcRenderer.invoke("db:jobs:reputation", companionId),
    },
    /**
     * Cross-app semantic search via sqlite-vec. The renderer hands us
     * an already-embedded query vector (Phase 5b: the renderer can
     * also call `electronAPI.embed(text)` to compute one). Returns
     * `[{ sourceTable, sourceId, distance, embeddedAt, model }]`.
     */
    embeddings: {
      enqueue: (item) => ipcRenderer.invoke("db:embeddings:enqueue", item),
      enqueueMany: (items) => ipcRenderer.invoke("db:embeddings:enqueueMany", items),
      search: (queryEmbedding, opts) => ipcRenderer.invoke("db:embeddings:search", queryEmbedding, opts),
      drop: (key) => ipcRenderer.invoke("db:embeddings:drop", key),
      pendingCount: () => ipcRenderer.invoke("db:embeddings:pendingCount"),
      totalCount: () => ipcRenderer.invoke("db:embeddings:totalCount"),
      countsBySource: () => ipcRenderer.invoke("db:embeddings:countsBySource"),
      tick: () => ipcRenderer.invoke("db:embeddings:tick"),
      stats: () => ipcRenderer.invoke("db:embeddings:stats"),
      backfill: () => ipcRenderer.invoke("db:embeddings:backfill"),
    },
    skills: {
      upsert: (record) => ipcRenderer.invoke("db:skills:upsert", record),
      list: (filter) => ipcRenderer.invoke("db:skills:list", filter),
      get: (id) => ipcRenderer.invoke("db:skills:get", id),
      bulkInsert: (rows) => ipcRenderer.invoke("db:skills:bulkInsert", rows),
      recordRun: (run) => ipcRenderer.invoke("db:skills:recordRun", run),
      listRuns: (filter) => ipcRenderer.invoke("db:skills:listRuns", filter),
      runStats: (skillId) => ipcRenderer.invoke("db:skills:runStats", skillId),
      bulkInsertRuns: (rows) => ipcRenderer.invoke("db:skills:bulkInsertRuns", rows),
      registerOwnership: (reg) => ipcRenderer.invoke("db:skills:registerOwnership", reg),
      listOwnership: (filter) => ipcRenderer.invoke("db:skills:listOwnership", filter),
      recordClaim: (skillId, companionId, payoutCents) => ipcRenderer.invoke("db:skills:recordClaim", skillId, companionId, payoutCents),
    },
    moltbook: {
      postCreate: (post) => ipcRenderer.invoke("db:moltbook:postCreate", post),
      postsList: (filter) => ipcRenderer.invoke("db:moltbook:postsList", filter),
      engagement: (eng) => ipcRenderer.invoke("db:moltbook:engagement", eng),
    },
    openclaw: {
      upsertConversation: (conv) => ipcRenderer.invoke("db:openclaw:upsertConversation", conv),
      listConversations: (filter) => ipcRenderer.invoke("db:openclaw:listConversations", filter),
      findConversation: (channel, externalChatId) => ipcRenderer.invoke("db:openclaw:findConversation", channel, externalChatId),
      appendMessage: (conversationId, msg) => ipcRenderer.invoke("db:openclaw:appendMessage", conversationId, msg),
      listMessages: (conversationId, opts) => ipcRenderer.invoke("db:openclaw:listMessages", conversationId, opts),
    },
    web3: {
      mintUpsert: (mint) => ipcRenderer.invoke("db:web3:mintUpsert", mint),
      mintsList: (filter) => ipcRenderer.invoke("db:web3:mintsList", filter),
      paymentRecord: (p) => ipcRenderer.invoke("db:web3:paymentRecord", p),
      paymentSettle: (id, txHash) => ipcRenderer.invoke("db:web3:paymentSettle", id, txHash),
      paymentsList: (filter) => ipcRenderer.invoke("db:web3:paymentsList", filter),
      epochUpsert: (epoch) => ipcRenderer.invoke("db:web3:epochUpsert", epoch),
      epochsList: (filter) => ipcRenderer.invoke("db:web3:epochsList", filter),
      claimRecord: (claim) => ipcRenderer.invoke("db:web3:claimRecord", claim),
      claimsList: (filter) => ipcRenderer.invoke("db:web3:claimsList", filter),
    },
    roleplay: {
      upsertSession: (record) => ipcRenderer.invoke("db:roleplay:upsertSession", record),
      getSession: (id) => ipcRenderer.invoke("db:roleplay:getSession", id),
      listSessions: (filter) => ipcRenderer.invoke("db:roleplay:listSessions", filter),
      archiveSession: (id) => ipcRenderer.invoke("db:roleplay:archiveSession", id),
      clearSession: (id) => ipcRenderer.invoke("db:roleplay:clearSession", id),
      bulkInsertSessions: (rows) => ipcRenderer.invoke("db:roleplay:bulkInsertSessions", rows),
      appendMessage: (sessionId, msg) => ipcRenderer.invoke("db:roleplay:appendMessage", sessionId, msg),
      listMessages: (sessionId, opts) => ipcRenderer.invoke("db:roleplay:listMessages", sessionId, opts),
      deleteMessage: (messageId) => ipcRenderer.invoke("db:roleplay:deleteMessage", messageId),
      bulkInsertMessages: (rows) => ipcRenderer.invoke("db:roleplay:bulkInsertMessages", rows),
      upsertMessages: (rows) => ipcRenderer.invoke("db:roleplay:upsertMessages", rows),
      messageCount: (sessionId) => ipcRenderer.invoke("db:roleplay:messageCount", sessionId),
      resetAndReimport: (opts) => ipcRenderer.invoke("db:roleplay:resetAndReimport", opts),
      repairContentLevels: () => ipcRenderer.invoke("db:roleplay:repairContentLevels"),
      onChanged: (cb) => {
        const h = (_e, p) => cb(p);
        ipcRenderer.on("db:roleplay:changed", h);
        return () => ipcRenderer.removeListener("db:roleplay:changed", h);
      },
    },
  },
  /**
   * Stateless streaming chat for the ZHC dispatcher. Returns the full
   * assistant text on completion. Tokens stream via `onZhcChatToken`
   * tagged with `streamId` so concurrent ticks (or Generative Text) do
   * not interleave.
   */
  zhcChatStream: ({ streamId, prompt, temperature, maxTokens, enableThinking }) =>
    ipcRenderer.invoke("zhc-chat-stream", {
      streamId, message: prompt, temperature, maxTokens, enableThinking, isolated: true,
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
  analyzeLocalImage: (payload) => ipcRenderer.invoke("vision-analyze-local", payload),
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
    has: (key) => ipcRenderer.invoke("store-has", key),
    set: (key, value) => ipcRenderer.invoke("store-set", key, value),
    delete: (key) => ipcRenderer.invoke("store-delete", key),
  },
  companyConnector: {
    oauthStatus: input => ipcRenderer.invoke("company-connector:oauth-status", input),
    configureOAuth: input => ipcRenderer.invoke("company-connector:configure-oauth", input),
    authorizeOAuth: input => ipcRenderer.invoke("company-connector:authorize-oauth", input),
    cancelOAuth: input => ipcRenderer.invoke("company-connector:cancel-oauth", input),
    authorizeMail: input => ipcRenderer.invoke("company-connector:authorize-mail",input),
    cancelMail: input => ipcRenderer.invoke("company-connector:cancel-mail",input),
    setSecret: (companyId, connectorId, secret, metadata = {}) => ipcRenderer.invoke("company-connector:set-secret", { companyId, connectorId, secret, ...metadata }),
    deleteSecret: (companyId, connectorId) => ipcRenderer.invoke("company-connector:delete-secret", { companyId, connectorId }),
    request: (request) => ipcRenderer.invoke("company-connector:request", request),
    validate: (companyId, connectorId) => ipcRenderer.invoke("company-connector:validate", { companyId, connectorId }),
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
  walletCredentials: {
    ensureAvailable: () => ipcRenderer.invoke("wallet-credentials:available"),
    ensureOWSPassphrase: (companionId) => ipcRenderer.invoke("ows:credential-ensure-passphrase", companionId),
    getAttestationKey: () => ipcRenderer.invoke("skill-attestation:credential-get"),
    setAttestationKey: (secret) => ipcRenderer.invoke("skill-attestation:credential-set", secret),
    getOWS: (companionId, kind) => ipcRenderer.invoke("ows:credential-get", { companionId, kind }),
    setOWS: (companionId, kind, secret) => ipcRenderer.invoke("ows:credential-set", { companionId, kind, secret }),
    getLegacyWallet: (companionId) => ipcRenderer.invoke("agent-wallet:credential-get", companionId),
    setLegacyWallet: (companionId, wallet) => ipcRenderer.invoke("agent-wallet:credential-set", { companionId, wallet }),
    deleteLegacyWallet: (companionId) => ipcRenderer.invoke("agent-wallet:credential-delete", companionId),
    getMasterSecret: (create = false) => ipcRenderer.invoke("agent-wallet:master-secret", create),
  },
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
  exportMeditationVideo: (payload) =>
    ipcRenderer.invoke("meditation-export-video", payload),
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
  getServerStatus: () => ipcRenderer.invoke("get-server-status"),
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

  // Unified, local-first OpenClaw and Hermes integration management.
  harnessGetStatus: () => ipcRenderer.invoke("harness-get-status"),
  harnessSetEnabled: (id, enabled) => ipcRenderer.invoke("harness-set-enabled", { id, enabled }),
  harnessSync: (id) => ipcRenderer.invoke("harness-sync", id),


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
   * @returns {Promise<{ok: boolean, result?: Record<string, unknown>, error?: string}>}
   */
  p2pInference: (peerId, request) =>
    ipcRenderer.invoke("p2p-inference", { peerId, request }),
  agentWorkerPublish: (descriptor, binding) => ipcRenderer.invoke('agent-worker-publish', descriptor, binding),
  agentWorkerUnpublish: key => ipcRenderer.invoke('agent-worker-unpublish', key),
  agentWorkerRuns: () => ipcRenderer.invoke('agent-worker-runs'),
  agentWorkerPeers: () => ipcRenderer.invoke('agent-worker-peers'),
  agentWorkerStoreMedia: (artifact, base64) => ipcRenderer.invoke('agent-worker-store-media', artifact, base64),
  agentWorkerTransferStart: artifact => ipcRenderer.invoke('agent-worker-transfer-start', artifact),
  agentWorkerTransferChunk: (id, offset, data) => ipcRenderer.invoke('agent-worker-transfer-chunk', id, offset, data),
  agentWorkerTransferFinish: id => ipcRenderer.invoke('agent-worker-transfer-finish', id),
  agentWorkerTransferAbort: id => ipcRenderer.invoke('agent-worker-transfer-abort', id),
  agentWorkerExportMedia: artifact => ipcRenderer.invoke('agent-worker-export-media', artifact),
  agentJobsInbox: () => ipcRenderer.invoke('agent-jobs-inbox'),
  agentJobsList: scope => ipcRenderer.invoke('agent-jobs-list', scope),
  agentJobsSave: (scope, record) => ipcRenderer.invoke('agent-jobs-save', scope, record),
  agentJobsDismiss: id => ipcRenderer.invoke('agent-jobs-dismiss', id),
  agentJobsSend: (peerId, packet) => ipcRenderer.invoke('agent-jobs-send', { peerId, packet }),

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
   * Privacy-pipeline service-time ledger access. The shard worker and
   * main bridge append rows to ~/bonzai-server/service_time.ndjson;
   * serviceTime.service.js batches + submits them on Arbitrum.
   * `read` returns parsed rows (with `_raw_size` for diagnostics).
   * `truncate(beforeTs)` removes rows with ts <= watermark; called
   * after a `recordServiceTimeBatch` tx confirms.
   */
  serviceTime: {
    readLedger: () => ipcRenderer.invoke("service-time:read-ledger"),
    truncateLedger: (beforeTs) => ipcRenderer.invoke("service-time:truncate-ledger", beforeTs),
  },

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

  onMeshActivity: (handler) => {
    ipcRenderer.on("mesh-activity", handler);
    return () => ipcRenderer.removeListener("mesh-activity", handler);
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
    xRequest: (agentId, input) => ipcRenderer.invoke('social:x-request', agentId, input),
    xClient: (clientId) => ipcRenderer.invoke('social:x-client', clientId),
    publicList: () => ipcRenderer.invoke('social:public-list'),
    publicConfigure: (agentId, settings) => ipcRenderer.invoke('social:public-configure', agentId, settings),
    publicPause: (agentId) => ipcRenderer.invoke('social:public-pause', agentId),
    publicRequests: (agentId) => ipcRenderer.invoke('social:public-requests', agentId),
    publicNext: (agentId) => ipcRenderer.invoke('social:public-next', agentId),
    publicEdit: (id, text) => ipcRenderer.invoke('social:public-edit', id, text),
    publicPoll: (agentId) => ipcRenderer.invoke('social:public-poll', agentId),
    publicClaim: (id) => ipcRenderer.invoke('social:public-claim', id),
    publicComplete: (id, result, error) => ipcRenderer.invoke('social:public-complete', id, result, error),
    publicDismiss: (id) => ipcRenderer.invoke('social:public-dismiss', id),
    publicRetry: (id) => ipcRenderer.invoke('social:public-retry', id),
    publicPublish: (id, automatic = false) => ipcRenderer.invoke('social:public-publish', id, automatic),
    wrapAudioInVideo: (input) => ipcRenderer.invoke('social:wrap-audio-video', input),
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
