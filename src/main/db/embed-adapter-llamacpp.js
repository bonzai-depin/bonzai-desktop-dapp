/**
 * llama-server embedding adapter — Phase 5b.
 *
 * Spawns a dedicated llama-server instance with `--embedding` and
 * exposes `embed(texts) → Float32Array[]` against its `/v1/embeddings`
 * endpoint. Uses its own process (not the multi-model pool) so chat +
 * vision instances can swap freely without disrupting the embed worker.
 *
 * The model file is expected at `<MODEL_DIR>/<filename>`. If it isn't
 * present we log a clear download hint and return null so the worker
 * stays idle — no crash, no error toast.
 *
 * Default model: nomic-embed-text-v1.5 (768-dim, ~80MB Q4_K_M).
 */

import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import http from "node:http";
import child_process from "node:child_process";

const DEFAULT_MODEL_FILENAME = "nomic-embed-text-v1.5.Q4_K_M.gguf";
const DEFAULT_DIM = 768;
const READINESS_TIMEOUT_MS = 30_000;
const MAX_BATCH_INPUT_TOKENS = 4096;   // server -ub default

let _proc = null;
let _port = null;
let _ready = null;

/**
 * Try to register the adapter. Returns the adapter or null if the model
 * file isn't on disk (caller logs a hint). Idempotent.
 *
 * @param {object} opts
 * @param {string} [opts.modelDir]    defaults to ~/bonzai-models
 * @param {string} [opts.filename]    defaults to DEFAULT_MODEL_FILENAME
 * @param {number} [opts.ctxSize]     llama-server -c, default 2048
 * @param {string} [opts.binaryPath]  override llama-server path
 */
export async function tryCreate(opts = {}) {
  const modelDir = opts.modelDir || path.join(os.homedir(), "bonzai-models");
  const filename = opts.filename || DEFAULT_MODEL_FILENAME;
  const modelPath = path.join(modelDir, filename);

  if (!fs.existsSync(modelPath)) {
    console.log(
      `[embed-adapter] model not found at ${modelPath}\n` +
      `                 Drop nomic-embed-text-v1.5.Q4_K_M.gguf into ${modelDir}\n` +
      `                 (https://huggingface.co/nomic-ai/nomic-embed-text-v1.5-GGUF)\n` +
      `                 Embeddings will stay queued until then.`,
    );
    return null;
  }

  const binary = opts.binaryPath || _findBinary();
  if (!binary) {
    console.warn("[embed-adapter] llama-server binary not found; skipping registration");
    return null;
  }

  await _spawn({ binary, modelPath, ctxSize: opts.ctxSize ?? 2048 });

  return {
    name: `llamacpp:${filename}`,
    dim: DEFAULT_DIM,
    embed: _embedBatch,
    shutdown: _shutdown,
  };
}

// ─────────────────────────────────────────────────────────────────────
// Internals
// ─────────────────────────────────────────────────────────────────────

async function _spawn({ binary, modelPath, ctxSize }) {
  if (_proc) return;
  _port = await _pickFreePort();

  const args = [
    "-m", modelPath,
    "--host", "127.0.0.1",
    "--port", String(_port),
    "-ngl", "99",
    "-c", String(ctxSize),
    "--embedding",
    "--pooling", "mean",
    "--no-warmup",
  ];

  console.log(`[embed-adapter] spawn ${binary} on :${_port}`);
  _proc = child_process.spawn(binary, args, {
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env },
  });
  _proc.stdout.on("data", (d) => {
    const line = d.toString().trimEnd();
    if (line) console.log(`[embed-adapter] ${line}`);
  });
  _proc.stderr.on("data", (d) => {
    const line = d.toString().trimEnd();
    if (line) console.log(`[embed-adapter:err] ${line}`);
  });
  _proc.on("exit", (code) => {
    console.log(`[embed-adapter] llama-server exited (code=${code})`);
    _proc = null;
    _port = null;
    _ready = null;
  });

  _ready = _waitReady(_port);
  await _ready;
  console.log(`[embed-adapter] ready on :${_port}`);
}

async function _waitReady(port) {
  const deadline = Date.now() + READINESS_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const ok = await _httpGet(`http://127.0.0.1:${port}/health`);
      if (ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`embed-adapter: llama-server didn't become ready within ${READINESS_TIMEOUT_MS}ms`);
}

/**
 * Embed a batch of texts. Splits oversized batches by approximate
 * token count so we don't blow past the server's --ubatch-size.
 */
async function _embedBatch(texts) {
  if (!Array.isArray(texts) || texts.length === 0) return [];
  if (!_proc || !_port) throw new Error("embed-adapter: not running");

  // Cheap token estimate; bisect into sub-batches if any single batch
  // would exceed the input window.
  const subBatches = [];
  let current = [];
  let currentTokens = 0;
  for (const t of texts) {
    const cost = Math.ceil((t?.length || 0) / 4);
    if (currentTokens + cost > MAX_BATCH_INPUT_TOKENS && current.length) {
      subBatches.push(current);
      current = [];
      currentTokens = 0;
    }
    current.push(t || "");
    currentTokens += cost;
  }
  if (current.length) subBatches.push(current);

  const out = [];
  for (const batch of subBatches) {
    const res = await fetch(`http://127.0.0.1:${_port}/v1/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input: batch }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(`embed-adapter: /v1/embeddings ${res.status}: ${t.slice(0, 200)}`);
    }
    const json = await res.json();
    const data = json.data || [];
    for (const item of data) {
      const arr = item.embedding;
      if (!Array.isArray(arr)) continue;
      out.push(Float32Array.from(arr));
    }
  }
  return out;
}

async function _shutdown() {
  if (!_proc) return;
  const proc = _proc;
  _proc = null;
  try { proc.kill("SIGTERM"); } catch {}
}

function _findBinary() {
  const platformKey = process.platform === "darwin" ? "darwin"
                    : process.platform === "win32" ? "win32"
                    : "linux";
  const exe = process.platform === "win32" ? "llama-server.exe" : "llama-server";
  const cwd = process.cwd();
  const candidates = [
    path.join(cwd, "bin", `${platformKey}-${process.arch}`, exe),
  ];
  for (const p of candidates) if (fs.existsSync(p)) return p;
  return null;
}

async function _pickFreePort() {
  const net = await import("node:net");
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const p = srv.address().port;
      srv.close(() => resolve(p));
    });
  });
}

function _httpGet(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      res.resume();
      resolve(res.statusCode >= 200 && res.statusCode < 300);
    });
    req.on("error", reject);
    req.setTimeout(2000, () => { req.destroy(new Error("timeout")); });
  });
}
