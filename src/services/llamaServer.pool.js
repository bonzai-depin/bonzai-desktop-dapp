/**
 * BonzAI — multi-instance llama-server pool
 *
 * Spawns and manages multiple `llama-server` subprocesses concurrently,
 * one per model. Used by the Company feature when execution.llm.mode is
 * "parallel" — different roles get their own model instance so they
 * truly run in parallel instead of serializing at the single shared
 * server.
 *
 * Memory budget enforcement: each spawned instance reports its
 * approximate footprint (model weights + KV cache); the pool refuses to
 * spawn another instance when total footprint would exceed
 * `memoryBudgetGB`. LRU eviction reclaims an idle instance when
 * possible; if the requested model fits after eviction, it spawns.
 *
 * The pool is independent of `llamaServer.manager.js`. The "main" model
 * the user loaded via Chat tab keeps using the legacy single-instance
 * manager; the pool runs alongside for company-driven workloads.
 *
 * Each instance speaks the OpenAI-compatible HTTP API on its own port.
 * `chat({ modelKey, prompt, ... })` resolves the right port and posts.
 */

import path from "path";
import fs from "fs";
import net from "net";
import child_process from "child_process";
import { Agent } from "undici";

const LLAMA_SERVER_EXE = process.platform === "win32" ? "llama-server.exe" : "llama-server";
const PLATFORM_KEY = {
  darwin: "macos", win32: "windows", linux: "linux",
}[process.platform] || process.platform;

const READINESS_TIMEOUT_MS = 180_000;

// Long-lived undici dispatcher matching the singleton manager's pattern.
const _fetchDispatcher = new Agent({
  headersTimeout: 0,
  bodyTimeout: 0,
  keepAliveTimeout: 60_000,
});

// ─────────────────────────────────────────────────────────────────────────
// Pool state
// ─────────────────────────────────────────────────────────────────────────

/** modelKey -> Instance */
const _instances = new Map();
/** Total estimated memory footprint of all live instances, in bytes. */
let _totalBytes = 0;

let _budgetBytes = 22 * 1024 ** 3; // default 22 GB
let _lastResourcesPath = null;

/**
 * @typedef {Object} Instance
 * @property {string} modelKey
 * @property {string} modelPath
 * @property {number} port
 * @property {object} proc                child_process handle
 * @property {number} sizeBytes           estimated footprint
 * @property {number} lastUsed            ms timestamp
 * @property {number} inFlight            outstanding requests
 * @property {Promise<void>|null} ready   resolves when /health ok
 */

// ─────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────

/**
 * Configure the pool. Currently just memory budget + resources path.
 */
export function configure({ memoryBudgetGB, resourcesPath } = {}) {
  if (Number.isFinite(memoryBudgetGB)) _budgetBytes = memoryBudgetGB * 1024 ** 3;
  if (resourcesPath !== undefined) _lastResourcesPath = resourcesPath;
}

/**
 * Acquire an instance for a model. Returns the port it's listening on.
 * Spawns if needed; evicts LRU instances under memory pressure.
 *
 * @param {object} spec
 *   modelKey      : unique handle ("llm_qwen3_5_4b")
 *   modelPath     : absolute path to the .gguf
 *   sizeBytes     : approximate footprint (model + KV); used for budget
 *   ctxSize       : llama-server -c value
 *   ngl           : -ngl, default 99
 *   parallelSlots : -np, default 1
 *   chatTemplate  : optional --chat-template name
 *   specType      : optional --spec-type, currently draft-mtp
 *   specDraftNMax : optional --spec-draft-n-max for MTP, default 2
 *   mtp           : true to enable in-GGUF MTP draft heads
 *   noWarmup      : optional --no-warmup
 */
export async function acquire(spec) {
  if (!spec?.modelKey) throw new Error("acquire: modelKey required");
  if (!spec?.modelPath) throw new Error("acquire: modelPath required");

  const existing = _instances.get(spec.modelKey);
  if (existing) {
    if (existing.ready) await existing.ready;
    existing.lastUsed = Date.now();
    return existing.port;
  }

  // Memory budget check + eviction loop
  const wantBytes = spec.sizeBytes || _estimateBytes(spec);
  while (_totalBytes + wantBytes > _budgetBytes) {
    const evicted = await _evictLRU(spec.modelKey);
    if (!evicted) {
      throw new Error(
        `pool: budget exceeded — wanted ${(wantBytes / 1024 ** 3).toFixed(1)} GB, ` +
        `have ${((_budgetBytes - _totalBytes) / 1024 ** 3).toFixed(1)} GB free, ` +
        `nothing evictable. Lower memoryBudgetGB or unload other instances.`
      );
    }
  }

  const inst = await _spawn(spec, wantBytes);
  return inst.port;
}

/**
 * Free an instance — decrement the inFlight counter so eviction can pick
 * it up later. Safe to call repeatedly.
 */
export function release(modelKey) {
  const inst = _instances.get(modelKey);
  if (!inst) return;
  inst.inFlight = Math.max(0, inst.inFlight - 1);
  inst.lastUsed = Date.now();
}

/**
 * Run a chat completion against a specific model instance.
 *
 * @param {object} body  OpenAI-compatible request body
 * @returns {Promise<string>}  the assistant message string
 */
export async function chat({ modelKey, prompt, messages, temperature, maxTokens, stop, seed, enableThinking }) {
  const reg = _lookupModelPath(modelKey);
  const port = await acquire({
    modelKey,
    modelPath: reg.modelPath,
    sizeBytes: reg.sizeBytes,
    ctxSize: reg.ctxSize,
    parallelSlots: reg.parallelSlots,
    chatTemplate: reg.chatTemplate,
    specType: reg.specType,
    specDraftNMax: reg.specDraftNMax,
    mtp: reg.mtp,
  });
  const inst = _instances.get(modelKey);
  inst.inFlight++;
  try {
    const body = {
      stream: false,
      messages: messages || [{ role: "user", content: prompt || "" }],
    };
    if (typeof temperature === "number") body.temperature = temperature;
    if (typeof maxTokens === "number") body.max_tokens = maxTokens;
    if (stop) body.stop = stop;
    if (typeof seed === "number") body.seed = seed;
    if (typeof enableThinking === "boolean") {
      body.chat_template_kwargs = { enable_thinking: enableThinking };
    }
    const res = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      dispatcher: _fetchDispatcher,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`pool[${modelKey}] /v1/chat/completions ${res.status}: ${text.slice(0, 200)}`);
    }
    const json = await res.json();
    return json.choices?.[0]?.message?.content ?? "";
  } finally {
    release(modelKey);
  }
}

/**
 * Ensure a specific model is loaded (used by SWAP mode to pre-warm
 * before a sequential call). No-op if already loaded.
 */
export async function ensure(modelKey, modelPath) {
  if (_instances.has(modelKey)) return _instances.get(modelKey).port;
  return acquire({ modelKey, modelPath });
}

/**
 * Stop and remove an instance. No-op if not present.
 */
export async function release_(modelKey) {
  const inst = _instances.get(modelKey);
  if (!inst) return false;
  await _kill(inst);
  _instances.delete(modelKey);
  _totalBytes -= inst.sizeBytes;
  return true;
}

/** Stop ALL pool instances. Used on app teardown. */
export async function shutdown() {
  for (const inst of _instances.values()) await _kill(inst);
  _instances.clear();
  _totalBytes = 0;
}

/** Inventory snapshot for the diagnostics UI. */
export function inventory() {
  return [..._instances.values()].map((i) => ({
    modelKey: i.modelKey,
    port: i.port,
    sizeBytes: i.sizeBytes,
    sizeGB: +(i.sizeBytes / 1024 ** 3).toFixed(2),
    inFlight: i.inFlight,
    lastUsed: i.lastUsed,
    pid: i.proc?.pid,
  }));
}

export function totalBytes() { return _totalBytes; }
export function budgetBytes() { return _budgetBytes; }

// ─────────────────────────────────────────────────────────────────────────
// Internals
// ─────────────────────────────────────────────────────────────────────────

async function _spawn(spec, sizeBytes) {
  if (!fs.existsSync(spec.modelPath)) {
    throw new Error(`pool: model file not found: ${spec.modelPath}`);
  }
  const port = await _pickFreePort();
  const binary = _resolveBinary();
  const isMtpSpecDecode = spec.specType === "draft-mtp" || spec.mtp === true;
  const parallelSlots = isMtpSpecDecode ? 1 : (spec.parallelSlots ?? 1);

  const args = [
    "-m", spec.modelPath,
    "--host", "127.0.0.1",
    "--port", String(port),
    "-ngl", String(spec.ngl ?? 99),
    "-c", String(spec.ctxSize ?? 8192),
    "-fa", "on",
    "-np", String(parallelSlots),
    "--reasoning-format", "none",
    "--chat-template-kwargs", JSON.stringify({ enable_thinking: false }),
  ];
  if (spec.chatTemplate) args.push("--chat-template", spec.chatTemplate);
  if (isMtpSpecDecode) {
    args.push("--spec-type", "draft-mtp", "--spec-draft-n-max", String(spec.specDraftNMax ?? 2));
  }
  if (spec.noWarmup) args.push("--no-warmup");

  if (process.platform === "darwin") {
    try { child_process.execSync(`xattr -rd com.apple.quarantine "${binary}"`, { stdio: "ignore" }); } catch {}
  }

  console.log(`[pool] Spawn ${spec.modelKey} → ${binary} on :${port}`);
  const proc = child_process.spawn(binary, args, {
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env },
  });
  proc.stdout.on("data", (d) => {
    const line = d.toString().trimEnd();
    if (line) console.log(`[pool:${spec.modelKey}] ${line}`);
  });
  proc.stderr.on("data", (d) => {
    const line = d.toString().trimEnd();
    if (line) console.log(`[pool:${spec.modelKey}:err] ${line}`);
  });

  const inst = {
    modelKey: spec.modelKey, modelPath: spec.modelPath, port,
    proc, sizeBytes, lastUsed: Date.now(), inFlight: 0, ready: null,
  };
  _instances.set(spec.modelKey, inst);
  _totalBytes += sizeBytes;

  proc.on("exit", (code) => {
    if (_instances.get(spec.modelKey) === inst) {
      _instances.delete(spec.modelKey);
      _totalBytes -= sizeBytes;
      console.log(`[pool] ${spec.modelKey} exited (code=${code})`);
    }
  });

  inst.ready = _waitReady(port);
  await inst.ready;
  console.log(`[pool] ${spec.modelKey} ready on :${port}`);
  return inst;
}

async function _waitReady(port) {
  const deadline = Date.now() + READINESS_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(1000) });
      if (res.ok) {
        const body = await res.json().catch(() => ({}));
        if (body?.status === "ok") return true;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`pool: instance on :${port} did not become ready within ${READINESS_TIMEOUT_MS}ms`);
}

async function _evictLRU(skipKey) {
  // Find the oldest-used instance that has zero in-flight requests and
  // is not the one we're trying to spawn.
  let candidate = null;
  for (const inst of _instances.values()) {
    if (inst.modelKey === skipKey) continue;
    if (inst.inFlight > 0) continue;
    if (!candidate || inst.lastUsed < candidate.lastUsed) candidate = inst;
  }
  if (!candidate) return false;
  console.log(`[pool] evicting ${candidate.modelKey} (LRU, idle ${(Date.now() - candidate.lastUsed) / 1000}s)`);
  await _kill(candidate);
  _instances.delete(candidate.modelKey);
  _totalBytes -= candidate.sizeBytes;
  return true;
}

async function _kill(inst) {
  try { inst.proc.kill("SIGTERM"); } catch {}
  await new Promise((resolve) => {
    let done = false;
    const t = setTimeout(() => {
      if (done) return;
      try { inst.proc.kill("SIGKILL"); } catch {}
      done = true; resolve();
    }, 5000);
    inst.proc.once("exit", () => { if (!done) { done = true; clearTimeout(t); resolve(); } });
  });
}

function _pickFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
  });
}

function _resolveBinary() {
  const arch = process.arch;
  const cwd = process.cwd();
  const candidates = [
    path.join(cwd, "bin", `${PLATFORM_KEY}-${arch}`, LLAMA_SERVER_EXE),
    _lastResourcesPath ? path.join(_lastResourcesPath, "app", "bin", `${PLATFORM_KEY}-${arch}`, LLAMA_SERVER_EXE) : null,
    _lastResourcesPath ? path.join(_lastResourcesPath, "server", "llama-runtime", `${PLATFORM_KEY}-${arch}`, LLAMA_SERVER_EXE) : null,
  ].filter(Boolean);
  for (const p of candidates) if (fs.existsSync(p)) return p;
  throw new Error(`pool: llama-server binary not found. Searched:\n  ${candidates.join("\n  ")}`);
}

/**
 * The pool itself doesn't know where each model file lives, nor how big
 * a context it should run with — those are policy decisions owned by
 * main.js. The renderer (or main's own code) calls registerModelPath()
 * before chat(), passing the full spec including ctxSize computed via
 * main.js's `computeMaxContextForModel` heuristic.
 *
 * Backwards-compatible: callers passing only `(modelKey, modelPath, sizeBytes)`
 * still work — they just won't get a ctxSize-aware spawn.
 */
const _modelPaths = new Map();
export function registerModelPath(modelKey, modelPath, sizeBytes, extras = {}) {
  _modelPaths.set(modelKey, {
    modelPath,
    sizeBytes,
    ctxSize: extras.ctxSize || null,
    parameters: extras.parameters || null,
    activeParameters: extras.activeParameters || null,
    isMoE: extras.isMoE || false,
    context: extras.context || null,
    parallelSlots: extras.parallelSlots || 1,
    chatTemplate: extras.chatTemplate || null,
    specType: extras.specType || null,
    specDraftNMax: extras.specDraftNMax || null,
    mtp: extras.mtp === true,
  });
}
function _lookupModelPath(modelKey) {
  const entry = _modelPaths.get(modelKey);
  if (!entry) {
    throw new Error(`pool: model ${modelKey} not registered. Call registerModelPath() before chat().`);
  }
  return entry;
}

function _estimateBytes(spec) {
  // Rough heuristic: file size + 25% for KV cache overhead at modest context.
  // The caller (which knows the GGUF size) should pass sizeBytes explicitly
  // when possible; this is a fallback.
  try {
    const stat = fs.statSync(spec.modelPath);
    return Math.round(stat.size * 1.25);
  } catch {
    return 4 * 1024 ** 3; // 4 GB default
  }
}
