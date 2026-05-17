/**
 * llama-server subprocess manager.
 *
 * Single source of truth for local LLM inference in BonzAI.
 * Used by: main.js IPC handlers (model-load/chat/unload), the OpenAI-
 * compatible gateway (:3002) consumed by OpenClaw and Hermes, consumer-mode
 * private inference, and the multimodal (mmproj) path.
 *
 * Design:
 *   - One active model at a time. Switching models = kill + respawn.
 *   - Subprocess owns GPU memory. Exit cleanly frees it.
 *   - OpenAI-compatible HTTP API on 127.0.0.1:<dynamic>. Callers speak fetch().
 *   - Ready detection: poll GET /health until {"status":"ok"}.
 *   - Startup stderr is tee'd to console under a [llama-server] prefix.
 *
 * Replaces node-llama-cpp. The llama-server binary is built by
 * scripts/build-llama-rpc.js alongside rpc-server.
 */

import path from "path";
import fs from "fs";
import net from "net";
import child_process from "child_process";
import { Agent } from "undici";

const LLAMA_SERVER_EXE = process.platform === "win32" ? "llama-server.exe" : "llama-server";

/**
 * Long-lived undici dispatcher with timeouts disabled. The local
 * llama-server holds a non-streaming POST open until the entire
 * response is generated, which can take many minutes for large
 * outputs (3D scene generation, long roleplay turns). Default
 * undici headers/body timeouts (5 min) would abort the request
 * mid-generation. Connections are loopback-only, so disabling
 * the timeout has no security implications.
 */
const llamaFetchDispatcher = new Agent({
  headersTimeout: 0,
  bodyTimeout: 0,
  keepAliveTimeout: 60_000,
});

const PLATFORM_KEY = {
  darwin: "macos",
  win32: "windows",
  linux: "linux",
}[process.platform] || process.platform;

const READINESS_TIMEOUT_MS = 120_000; // Large models on cold-start need >60s
const SHUTDOWN_SIGKILL_MS = 5_000;

// ─────────────────────────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────────────────────────

let activeProcess = null;
let activePort = null;
let activeSpec = null; // { modelPath, mmprojPath, ctxSize, ngl, draftPath, rpcPeers, ... }
let lastExitInfo = null;
let exitListeners = new Set();

// Peer list picked by the user before any model is loaded. When startModel()
// fires without an explicit rpcPeers argument, we apply this instead.
let pendingRpcPeers = [];
let pendingTensorSplit = undefined;
let pendingSplitMode = undefined;

// Cache the resources path from the last startModel() so updateRpcPeers()
// can restart without re-plumbing it from the caller.
let _lastResourcesPath = null;

// Set by stopModel() so the exit handler can tell a graceful shutdown apart
// from a crash. Consumers of onExit() care about this — e.g. main.js only
// clears currentLoadedModel on UNEXPECTED exits so the privacy-pipeline
// restart cycle doesn't wipe user state.
let _stopping = false;

/**
 * Count of in-flight requests against the singleton llama-server. Each
 * `chat`/`chatStream`/`chatVision`/`proxyRequest` increments on entry and
 * decrements in `finally`. ZHC's `ensureModel` reads this to refuse a
 * model swap that would interrupt an active companion conversation —
 * the user's request to "the server must not quit during a companion
 * conversation."
 */
let _inFlight = 0;
export function inFlightCount() { return _inFlight; }

// ─────────────────────────────────────────────────────────────────────────────
// Binary resolution
// ─────────────────────────────────────────────────────────────────────────────

function resolveBinary({ resourcesPath = null, cwd = process.cwd() } = {}) {
  const arch = process.arch;
  const candidates = [
    path.join(cwd, "bin", `${PLATFORM_KEY}-${arch}`, LLAMA_SERVER_EXE),
    resourcesPath ? path.join(resourcesPath, "app", "bin", `${PLATFORM_KEY}-${arch}`, LLAMA_SERVER_EXE) : null,
    resourcesPath ? path.join(resourcesPath, "server", "llama-runtime", `${PLATFORM_KEY}-${arch}`, LLAMA_SERVER_EXE) : null,
  ].filter(Boolean);

  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error(
    `llama-server binary not found. Searched:\n  ${candidates.join("\n  ")}\n` +
    `Run 'npm run build:rpc' to compile it, or make sure forge packaged it into Resources/server/llama-runtime/.`
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Port allocation
// ─────────────────────────────────────────────────────────────────────────────

async function pickFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI flag assembly
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build llama-server CLI args from a normalized model spec.
 *
 * @param {object} spec
 * @param {string} spec.modelPath           absolute path to main .gguf
 * @param {string} [spec.mmprojPath]        absolute path to mmproj for VLMs
 * @param {number} [spec.port]              fixed port; omit for dynamic
 * @param {number} [spec.ctxSize=8192]      main model context size
 * @param {number} [spec.ngl=99]            GPU layers (99 = all)
 * @param {boolean} [spec.flashAttention=true]
 * @param {number} [spec.parallelSlots=1]   -np, concurrent requests
 * @param {string} [spec.kvCacheTypeK="q8_0"]  -ctk; saves memory on long contexts
 * @param {string} [spec.kvCacheTypeV="q8_0"]  -ctv
 * @param {string} [spec.draftPath]         -md, speculative draft model
 * @param {string} [spec.specType]          --spec-type; currently draft-mtp
 * @param {number} [spec.specDraftNMax=2]   --spec-draft-n-max for MTP
 * @param {number} [spec.draftNgl=99]       -ngld
 * @param {number} [spec.draftCtxSize]      -cd
 * @param {number} [spec.draftMaxTokens=12] --draft-max
 * @param {number} [spec.draftMinTokens=3]  --draft-min
 * @param {number} [spec.draftPMin=0.5]     --draft-p-min
 * @param {number} [spec.mainGpu]           --main-gpu
 * @param {string} [spec.chatTemplate]      --chat-template name
 * @param {string[]} [spec.rpcPeers]        Consumer-mode `-rpc` backends as
 *                                          "host:port" strings. Empty/omitted
 *                                          = local-only (private mode). Each
 *                                          entry is a local TCP forwarder the
 *                                          caller has already wired to a
 *                                          remote shard provider over libp2p.
 * @param {string} [spec.tensorSplit]       Privacy-pipeline `--tensor-split`.
 *                                          Comma-separated layer percentages,
 *                                          e.g. "25,25,25,25". First value =
 *                                          local share, remainder = per-peer.
 * @param {string} [spec.splitMode]         `--split-mode` (default: "layer").
 * @param {boolean} [spec.noWarmup]         `--no-warmup` (faster startup for
 *                                          short-lived privacy sessions).
 * @param {string} [spec.reasoningFormat="none"]
 *                                          `--reasoning-format`. Default "none"
 *                                          keeps `<think>…</think>` inside
 *                                          `delta.content` so single-channel
 *                                          consumers (our chatStream) get the
 *                                          full output. Use "auto"/"deepseek"
 *                                          if a caller wants the split into
 *                                          `delta.reasoning_content`.
 * @param {boolean} [spec.enableThinking=false]
 *                                          Forwarded to the chat template via
 *                                          `--chat-template-kwargs '{"enable_thinking":...}'`.
 *                                          Default false: Qwen3 / Qwen3.5
 *                                          hybrid models otherwise burn the
 *                                          n_predict budget on hidden chain-
 *                                          of-thought (the small 0.8B variant
 *                                          loops degenerately). Templates
 *                                          that don't reference the variable
 *                                          ignore it harmlessly.
 */
function buildArgs(spec) {
  const isMtpSpecDecode = spec.specType === "draft-mtp" || spec.mtp === true;
  const requestedParallelSlots = spec.parallelSlots && spec.parallelSlots >= 1 ? spec.parallelSlots : 1;
  const parallelSlots = isMtpSpecDecode ? 1 : requestedParallelSlots;
  if (isMtpSpecDecode && requestedParallelSlots !== 1) {
    console.warn("[llama-server] MTP speculative decoding requires -np 1; forcing parallelSlots=1");
  }

  const args = [
    "-m", spec.modelPath,
    "--host", "127.0.0.1",
    "--port", String(spec.port),
    "-ngl", String(spec.ngl ?? 99),
    "-c", String(spec.ctxSize ?? 8192),
  ];
  // Note: not passing --log-colors. Recent llama-server versions made it
  // a value-taking flag (on|off|auto). Default "auto" already disables
  // colors when stdio is piped, which is what we want for a subprocess.

  if (spec.flashAttention !== false) args.push("-fa", "on");
  if (spec.kvCacheTypeK) args.push("-ctk", spec.kvCacheTypeK);
  if (spec.kvCacheTypeV) args.push("-ctv", spec.kvCacheTypeV);
  // CRITICAL — always pass -np explicitly. llama-server's auto-pick chose
  // n_parallel=4 by default, which slices the context window into 4
  // equal slots: a -c 65536 deployment ends up with only ~16K usable
  // per request, and large codegen prompts (~10K prefill) leave only
  // ~5-6K for output. The result is a truncated response that *looks*
  // like the model gave up, but is actually a hard slot cap. Forcing
  // n_parallel=1 (or whatever the caller specifies) gives the entire
  // context window to a single in-flight request — what we want for
  // single-user generative work.
  args.push("-np", String(parallelSlots));
  if (typeof spec.mainGpu === "number") args.push("--main-gpu", String(spec.mainGpu));
  if (spec.chatTemplate) args.push("--chat-template", spec.chatTemplate);

  // Keep thinking-model output in `delta.content` (with raw <think>…</think>
  // tags) instead of letting llama-server split it into a separate
  // `reasoning_content` channel. Without this, Qwen3-class hybrid models
  // burn the n_predict budget on hidden reasoning that never reaches the
  // single-channel UI. See chatStream below — it also defensively reads
  // reasoning_content as a fallback in case a caller overrides this.
  args.push("--reasoning-format", spec.reasoningFormat ?? "none");

  // Disable hybrid thinking by default. Qwen3 / Qwen3.5 templates honor
  // `enable_thinking`; smaller models (e.g. Qwen3.5 0.8B) loop
  // degenerately when forced to think, and even larger ones waste tokens
  // for typical chat use. Templates without the variable ignore the kwarg.
  // child_process.spawn doesn't shell-parse, so the JSON is passed literally.
  const enableThinking = spec.enableThinking === true;
  args.push("--chat-template-kwargs", JSON.stringify({ enable_thinking: enableThinking }));

  if (spec.mmprojPath && !isMtpSpecDecode) {
    args.push("--mmproj", spec.mmprojPath);
  } else if (spec.mmprojPath && isMtpSpecDecode) {
    console.warn("[llama-server] MTP speculative decoding is not compatible with --mmproj yet; disabling mmproj");
  }

  if (isMtpSpecDecode) {
    args.push(
      "--spec-type", "draft-mtp",
      "--spec-draft-n-max", String(spec.specDraftNMax ?? 2),
    );
  } else if (spec.draftPath) {
    args.push(
      "-md", spec.draftPath,
      "-ngld", String(spec.draftNgl ?? 99),
      "--draft-max", String(spec.draftMaxTokens ?? 12),
      "--draft-min", String(spec.draftMinTokens ?? 3),
      "--draft-p-min", String(spec.draftPMin ?? 0.5),
    );
    if (spec.draftCtxSize) args.push("-cd", String(spec.draftCtxSize));
  }

  // Consumer mode: offload tensor compute to remote rpc-server peers.
  // Empty or missing list = local-only (private mode). The values must be
  // LOCAL TCP endpoints; the caller is responsible for forwarding them to
  // their libp2p peers. Mainline llama-server uses long-form --rpc; the
  // short form was never accepted.
  if (Array.isArray(spec.rpcPeers) && spec.rpcPeers.length > 0) {
    args.push("--rpc", spec.rpcPeers.join(","));
    // Tensor-split + split-mode only matter when --rpc is active.
    if (spec.tensorSplit) args.push("--tensor-split", spec.tensorSplit);
    if (spec.splitMode) args.push("--split-mode", spec.splitMode);
  }

  if (spec.noWarmup) args.push("--no-warmup");

  return args;
}

// ─────────────────────────────────────────────────────────────────────────────
// Startup / readiness
// ─────────────────────────────────────────────────────────────────────────────

async function waitForReady(port, pid, signal) {
  const deadline = Date.now() + READINESS_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (signal?.aborted) throw new Error("Startup aborted");
    if (!activeProcess || activeProcess.pid !== pid) {
      throw new Error("llama-server exited during startup");
    }
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`, {
        signal: AbortSignal.timeout(1000),
      });
      if (res.ok) {
        const body = await res.json().catch(() => ({}));
        if (body?.status === "ok" || body?.status === "loading model" /* still acceptable, keep polling */) {
          if (body.status === "ok") return true;
        }
      }
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`llama-server did not become ready within ${READINESS_TIMEOUT_MS}ms`);
}

/**
 * Start a model. If another is running, it is stopped first.
 * @returns {Promise<{port: number, pid: number}>}
 */
export async function startModel(spec, { resourcesPath = null } = {}) {
  if (!spec?.modelPath) throw new Error("startModel: modelPath required");
  if (!fs.existsSync(spec.modelPath)) throw new Error(`Model file not found: ${spec.modelPath}`);
  if (spec.mmprojPath && !fs.existsSync(spec.mmprojPath)) {
    console.warn(`[llama-server] mmproj not found, disabling multimodal: ${spec.mmprojPath}`);
    spec = { ...spec, mmprojPath: null };
  }

  const isMtpSpecDecode = spec.specType === "draft-mtp" || spec.mtp === true;
  if (isMtpSpecDecode) {
    if (spec.mmprojPath) {
      console.warn("[llama-server] MTP speculative decoding is not compatible with --mmproj yet; disabling multimodal");
      spec = { ...spec, mmprojPath: null };
    }
    if (spec.draftPath) {
      console.warn("[llama-server] MTP speculative decoding uses the GGUF draft heads; ignoring external draft model");
      spec = { ...spec, draftPath: null };
    }
    if (spec.parallelSlots && spec.parallelSlots !== 1) {
      spec = { ...spec, parallelSlots: 1 };
    }
  }

  if (spec.draftPath && !fs.existsSync(spec.draftPath)) {
    console.warn(`[llama-server] draft model not found, disabling speculative decoding: ${spec.draftPath}`);
    spec = { ...spec, draftPath: null };
  }

  if (activeProcess) await stopModel();

  // Apply the user-picked peer list + tensor split if the caller didn't pass
  // explicit values. `rpcPeers: []` from the caller is respected as
  // "local-only, clear any pending list" — only `undefined` falls back to
  // pendingRpcPeers.
  const rpcPeers = _normalizePeers(spec.rpcPeers ?? pendingRpcPeers);
  const tensorSplit = spec.tensorSplit ?? pendingTensorSplit;
  const splitMode = spec.splitMode ?? pendingSplitMode;
  _lastResourcesPath = resourcesPath;

  const binary = resolveBinary({ resourcesPath });
  const port = spec.port || (await pickFreePort());
  const fullSpec = { ...spec, rpcPeers, tensorSplit, splitMode, port };
  const args = buildArgs(fullSpec);

  // Clear macOS quarantine on packaged builds
  if (process.platform === "darwin") {
    try { child_process.execSync(`xattr -rd com.apple.quarantine "${binary}"`, { stdio: "ignore" }); } catch {}
  }

  console.log(`[llama-server] Spawn ${binary} on :${port}`);
  console.log(`[llama-server] args: ${args.join(" ")}`);

  const proc = child_process.spawn(binary, args, {
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env },
  });

  activeProcess = proc;
  activePort = port;
  activeSpec = fullSpec;
  lastExitInfo = null;

  proc.stdout.on("data", (d) => {
    const line = d.toString().trimEnd();
    if (line) console.log(`[llama-server] ${line}`);
  });
  proc.stderr.on("data", (d) => {
    const line = d.toString().trimEnd();
    if (line) console.log(`[llama-server:err] ${line}`);
  });

  const pid = proc.pid;
  proc.on("exit", (code, signal) => {
    const intentional = _stopping;
    console.log(`[llama-server] exited (code=${code}, signal=${signal}, intentional=${intentional})`);
    if (activeProcess && activeProcess.pid === pid) {
      lastExitInfo = { code, signal, at: Date.now(), intentional };
      activeProcess = null;
      activePort = null;
      activeSpec = null;
    }
    for (const listener of exitListeners) {
      try { listener({ code, signal, pid, intentional }); } catch {}
    }
  });

  try {
    await waitForReady(port, pid);
  } catch (err) {
    try { proc.kill("SIGTERM"); } catch {}
    throw err;
  }

  console.log(`[llama-server] Ready on :${port} (pid=${pid})`);
  return { port, pid };
}

/**
 * Normalize a peer list: trim, drop empties, de-dupe, preserve order.
 */
function _normalizePeers(peers) {
  if (!Array.isArray(peers)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of peers) {
    if (typeof raw !== "string") continue;
    const trimmed = raw.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

/**
 * Swap the active RPC peer list (and, optionally, tensor-split / split-mode).
 *
 * Call this when the user picks or unpicks providers in the P2P modal. It is
 * safe to call before any model is loaded; in that case the new config
 * becomes the default for the next startModel().
 *
 * When a model IS running, the subprocess is restarted with the same model
 * spec plus the new peer list. Pass an empty array to revert to local-only
 * (private mode).
 *
 * @param {string[]} peers  Local TCP endpoints ("127.0.0.1:<fwd>") that the
 *                          caller has wired to remote libp2p shard providers.
 * @param {object}  [overrides]
 * @param {string}  [overrides.tensorSplit]   `--tensor-split` value
 * @param {string}  [overrides.splitMode]     `--split-mode`
 * @returns {Promise<{restarted: boolean, peers: string[]}>}
 */
export async function updateRpcPeers(peers, overrides = {}) {
  const next = _normalizePeers(peers);

  if (!activeProcess) {
    pendingRpcPeers = next;
    if (overrides.tensorSplit !== undefined) pendingTensorSplit = overrides.tensorSplit;
    if (overrides.splitMode !== undefined) pendingSplitMode = overrides.splitMode;
    return { restarted: false, peers: next };
  }

  const current = activeSpec?.rpcPeers ?? [];
  const unchangedPeers =
    current.length === next.length &&
    current.every((p, i) => p === next[i]);
  const unchangedSplit =
    (overrides.tensorSplit === undefined || overrides.tensorSplit === activeSpec?.tensorSplit) &&
    (overrides.splitMode === undefined || overrides.splitMode === activeSpec?.splitMode);
  if (unchangedPeers && unchangedSplit) {
    return { restarted: false, peers: next };
  }

  // Restart with identical spec + new peers/splits. Preserves model + mmproj
  // + draft + ctxSize + everything else.
  const spec = {
    ...activeSpec,
    rpcPeers: next,
    tensorSplit: overrides.tensorSplit ?? activeSpec?.tensorSplit,
    splitMode: overrides.splitMode ?? activeSpec?.splitMode,
    port: undefined,
  };
  console.log(`[llama-server] Restarting with ${next.length} RPC peer(s), split=${spec.tensorSplit ?? "auto"}`);
  await stopModel();
  await startModel(spec, { resourcesPath: _lastResourcesPath });
  return { restarted: true, peers: next };
}

/** Current peer list (may apply to the next start if nothing is running). */
export function getRpcPeers() {
  if (activeProcess) return activeSpec?.rpcPeers ?? [];
  return pendingRpcPeers;
}

/**
 * Gracefully stop the running model, if any. Marks the exit as intentional
 * so consumers of onExit() can distinguish a deliberate shutdown from a
 * crash.
 */
export async function stopModel({ force = false } = {}) {
  if (!activeProcess) return false;
  const proc = activeProcess;
  const pid = proc.pid;

  _stopping = true;
  activeProcess = null;
  activePort = null;
  activeSpec = null;

  return new Promise((resolve) => {
    let settled = false;
    const done = () => {
      if (!settled) {
        settled = true;
        _stopping = false;
        resolve(true);
      }
    };
    proc.once("exit", done);
    try { proc.kill(force ? "SIGKILL" : "SIGTERM"); } catch {}
    setTimeout(() => {
      if (!settled) {
        try { proc.kill("SIGKILL"); } catch {}
        console.warn(`[llama-server] SIGTERM timed out, sent SIGKILL to pid=${pid}`);
      }
    }, SHUTDOWN_SIGKILL_MS);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// HTTP client helpers (OpenAI-compatible)
// ─────────────────────────────────────────────────────────────────────────────

function requireRunning() {
  if (!activeProcess || !activePort) throw new Error("No llama-server running. Call startModel() first.");
  return activePort;
}

/**
 * Non-streaming chat completion. Returns the full response string.
 *
 * @param {boolean} [opts.enableThinking]  Per-request override for the
 *   chat template's `enable_thinking` variable. Sent as
 *   `chat_template_kwargs` so a single running model can toggle hybrid
 *   reasoning on/off without a server restart. Templates without the
 *   variable ignore it.
 */
export async function chat({ messages, temperature, maxTokens, stop, tools, toolChoice, seed, enableThinking }) {
  const port = requireRunning();
  const body = {
    messages,
    stream: false,
  };
  if (typeof temperature === "number") body.temperature = temperature;
  if (typeof maxTokens === "number") body.max_tokens = maxTokens;
  if (stop) body.stop = stop;
  if (tools) body.tools = tools;
  if (toolChoice) body.tool_choice = toolChoice;
  if (typeof seed === "number") body.seed = seed;
  if (typeof enableThinking === "boolean") {
    body.chat_template_kwargs = { enable_thinking: enableThinking };
  }

  _inFlight++;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      dispatcher: llamaFetchDispatcher,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`llama-server /v1/chat/completions ${res.status}: ${text}`);
    }
    return await res.json();
  } finally {
    _inFlight = Math.max(0, _inFlight - 1);
  }
}

/**
 * Streaming chat completion. Invokes onChunk(text) per delta. Returns the
 * full concatenated text. The chunk shape from llama-server mirrors OpenAI's
 * Server-Sent Events — we strip `data: ` framing for the caller.
 */
export async function chatStream({ messages, temperature, maxTokens, stop, seed, enableThinking }, onChunk, { signal } = {}) {
  const port = requireRunning();
  const body = {
    messages,
    stream: true,
  };
  if (typeof temperature === "number") body.temperature = temperature;
  if (typeof maxTokens === "number") body.max_tokens = maxTokens;
  if (stop) body.stop = stop;
  if (typeof seed === "number") body.seed = seed;
  if (typeof enableThinking === "boolean") {
    body.chat_template_kwargs = { enable_thinking: enableThinking };
  }

  _inFlight++;
  let buffer = "";
  let full = "";
  try {
    const res = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
      dispatcher: llamaFetchDispatcher,
    });
    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => "");
      throw new Error(`llama-server stream ${res.status}: ${text}`);
    }

    const decoder = new TextDecoder();
    const reader = res.body.getReader();

    while (true) {
      if (signal?.aborted) {
        console.log("[llama-server] chatStream aborted by signal");
        try { reader.cancel(); } catch {}
        break;
      }
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newlineIdx;
      while ((newlineIdx = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, newlineIdx).trim();
        buffer = buffer.slice(newlineIdx + 1);
        if (!line || !line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (payload === "[DONE]") return full;
        try {
          const parsed = JSON.parse(payload);
          const deltaObj = parsed.choices?.[0]?.delta ?? {};
          // Merge reasoning_content into the visible stream. With
          // `--reasoning-format none` everything already arrives in
          // `content`; this is a safety net for callers that override the
          // flag or for future llama-server defaults.
          const delta = (deltaObj.reasoning_content ?? "") + (deltaObj.content ?? "");
          if (delta) {
            full += delta;
            onChunk?.(delta, parsed);
          }
        } catch {
          // Ignore non-JSON keepalive lines
        }
      }
    }
    // Signal-aborted streams still carry the partial text accumulated so far.
    return full;
  } catch (err) {
    if (err.name === "AbortError" || signal?.aborted) {
      console.log("[llama-server] chatStream aborted, returning partial text");
      return full;
    }
    throw err;
  } finally {
    _inFlight = Math.max(0, _inFlight - 1);
  }
}

/**
 * Vision / multimodal chat. Takes an image (base64 or raw URL) and message.
 * Routed through /v1/chat/completions with an image_url content part, which
 * llama-server natively understands when started with --mmproj.
 */
export async function chatVision({ message, imageBase64, imageMime = "image/png", temperature, maxTokens }) {
  const port = requireRunning();
  if (!activeSpec?.mmprojPath) {
    throw new Error("Active model was not loaded with mmproj; vision is unavailable.");
  }
  const dataUrl = imageBase64.startsWith("data:")
    ? imageBase64
    : `data:${imageMime};base64,${imageBase64}`;

  const body = {
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: message ?? "Describe this image." },
          { type: "image_url", image_url: { url: dataUrl } },
        ],
      },
    ],
    stream: false,
  };
  if (typeof temperature === "number") body.temperature = temperature;
  if (typeof maxTokens === "number") body.max_tokens = maxTokens;

  _inFlight++;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      dispatcher: llamaFetchDispatcher,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`llama-server vision ${res.status}: ${text}`);
    }
    const json = await res.json();
    return json.choices?.[0]?.message?.content ?? "";
  } finally {
    _inFlight = Math.max(0, _inFlight - 1);
  }
}

/**
 * Raw proxy for /v1/* — used by the OpenClaw/Hermes gateway so it can forward
 * whole requests (including tool_calls, json_mode, logprobs, etc.) without
 * re-implementing the OpenAI shape.
 *
 * @returns {Response} fetch Response, body may be a stream
 */
export async function proxyRequest(subpath, { method = "GET", headers = {}, body = null, signal } = {}) {
  const port = requireRunning();
  const targetUrl = `http://127.0.0.1:${port}${subpath}`;
  const init = { method, headers, signal, dispatcher: llamaFetchDispatcher };
  if (body != null) init.body = typeof body === "string" ? body : JSON.stringify(body);
  return fetch(targetUrl, init);
}

// ─────────────────────────────────────────────────────────────────────────────
// Introspection
// ─────────────────────────────────────────────────────────────────────────────

export function isRunning() {
  return !!activeProcess;
}

export function getActiveSpec() {
  if (!activeSpec) return null;
  return { ...activeSpec };
}

export function getActivePort() {
  return activePort;
}

export function getLastExitInfo() {
  return lastExitInfo;
}

/** Subscribe to child-process exits. Returns an unsubscribe function. */
export function onExit(listener) {
  exitListeners.add(listener);
  return () => exitListeners.delete(listener);
}

/**
 * Best-effort metrics from /slots + /props. Returns null if unavailable.
 */
export async function getMetrics() {
  const port = activePort;
  if (!port) return null;
  try {
    const [slotsRes, propsRes] = await Promise.all([
      fetch(`http://127.0.0.1:${port}/slots`, { signal: AbortSignal.timeout(1000) }),
      fetch(`http://127.0.0.1:${port}/props`, { signal: AbortSignal.timeout(1000) }),
    ]);
    const slots = slotsRes.ok ? await slotsRes.json() : null;
    const props = propsRes.ok ? await propsRes.json() : null;
    return { slots, props };
  } catch {
    return null;
  }
}
