// src/main/pinataPublish.js
//
// P11 — Pinata IPFS publishing, main-process only.
//
// The Pinata JWT (or API key/secret pair) previously lived in the renderer
// (VITE_PINATA_* env vars baked into the production bundle at build time,
// sent as renderer-built auth headers on every upload) — extractable by any
// user of the packaged app and reachable by an XSS in any companion-rendered
// content. This module is now the ONLY place those credentials are read
// (`process.env`, main process only) and the only place the actual Pinata
// request is built. storage.service.js (renderer) sends content/metadata
// over the storage:publish IPC and gets back an upload receipt with no
// credential material in it — see toReceiptResult below.
//
// Reuses the egressPolicy.js choke point this app already trusts for social/
// proxy egress: HTTPS-only, SSRF-safe DNS pinning, and redirects that are
// never followed automatically but re-validated (target + DNS) against the
// same fixed Pinata policy on every hop — so a redirect to anywhere but
// api.pinata.cloud's two upload routes is denied before it is ever fetched.
//
// `kind: "file"` publishes are read here in the main process, but the
// requested `filePath` is renderer-controlled — reachable by the same
// XSS/compromised-renderer threat this module's credential move is meant to
// defend against. It is authorized through fileAccess.js's P7 `authorizeRead`
// (owned model/files roots, or a live native-dialog grant) before any stat or
// read happens; see the `senderId`/`roots`/`grants` deps on publishToPinata.
//
// No Electron imports here — pure functions plus injectable I/O seams
// (`env`, `readFile`, `statFile`, `senderId`/`roots`/`grants`, and everything
// performEgressRequest itself accepts) so this is unit-testable under
// `node --test` without a real network, filesystem, or Electron runtime.
// fileAccess.js (imported for authorizeRead) is itself Electron-import-free.

import fs from "node:fs";
import { performEgressRequest, EgressPolicyError } from "./egressPolicy.js";
import { authorizeRead } from "./fileAccess.js";

export const PINATA_ORIGIN = "https://api.pinata.cloud";
export const PINATA_GATEWAY = "https://gateway.pinata.cloud/ipfs";

// Hard ceiling on what this handler will buffer for a single publish call.
// Pinata payloads can legitimately be large; this bounds worst-case memory
// use against a runaway (or compromised) renderer, not a target size. The
// request body must be fully buffered anyway — performEgressRequest resends
// the same body if a redirect hop occurs (R4), which a one-shot stream can't
// do — so the bound is enforced up front instead of streaming.
export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024; // 100 MiB
export const MAX_METADATA_BYTES = 2 * 1024 * 1024; // 2 MiB (JSON metadata only)

// Immutable — mirrors the shape (and the "declare every allowed
// origin/path/method up front" discipline) of SOCIAL_POLICIES /
// PROXY_INTEGRATIONS in egressPolicy.js. `authFrom: "mainHeaders"` marks
// these routes as always taking their auth from `request.mainHeaders`
// (built by publishToPinata below, never from renderer input) rather than
// from a caller-supplied header or accessToken field.
export const PINATA_POLICY = Object.freeze({
  name: "storage:pinata",
  routes: Object.freeze([
    Object.freeze({
      origin: PINATA_ORIGIN,
      pathPrefix: "/pinning/pinFileToIPFS",
      methods: Object.freeze(["POST"]),
      allowedHeaders: Object.freeze([]),
      authFrom: "mainHeaders",
    }),
    Object.freeze({
      origin: PINATA_ORIGIN,
      pathPrefix: "/pinning/pinJSONToIPFS",
      methods: Object.freeze(["POST"]),
      allowedHeaders: Object.freeze([]),
      authFrom: "mainHeaders",
    }),
  ]),
});

const EXT_BY_CONTENT_TYPE = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "audio/wav": "wav",
  "audio/mpeg": "mp3",
  "text/html": "html",
  "text/plain": "txt",
  "application/json": "json",
  "model/gltf-binary": "glb",
  "model/gltf+json": "gltf",
  "application/octet-stream": "bin",
};

function extFromContentType(contentType) {
  return EXT_BY_CONTENT_TYPE[contentType] || "bin";
}

function buildKeyValues(generation = {}, attribution = {}) {
  const kv = { "App-Name": "BonzAI", "App-Version": "2.0.0" };
  if (generation.type) kv["Generation-Type"] = generation.type;
  if (generation.model) kv["Model-ID"] = generation.model;
  if (generation.modelVersion) kv["Model-Version"] = generation.modelVersion;
  if (generation.promptHash) kv["Prompt-Hash"] = generation.promptHash;
  if (generation.timestamp) kv["Generation-Timestamp"] = String(generation.timestamp);
  if (attribution.creator) kv["Creator-Address"] = attribution.creator;
  if (attribution.platform) kv["Platform-Address"] = attribution.platform;
  return kv;
}

/**
 * Read PINATA_JWT (preferred) or PINATA_API_KEY + PINATA_API_SECRET from
 * `env` (defaults to `process.env` — the ONLY place either is read). Returns
 * null, rather than throwing, when nothing is configured so callers can
 * produce a clear, non-destructive "not configured" result.
 */
export function readPinataCredentials(env = process.env) {
  const jwt = env.PINATA_JWT;
  if (jwt) return { kind: "jwt", jwt };
  const apiKey = env.PINATA_API_KEY;
  const apiSecret = env.PINATA_API_SECRET;
  if (apiKey && apiSecret) return { kind: "apiKey", apiKey, apiSecret };
  return null;
}

function authHeadersFor(credentials) {
  if (credentials.kind === "jwt") return { Authorization: `Bearer ${credentials.jwt}` };
  return {
    pinata_api_key: credentials.apiKey,
    pinata_secret_api_key: credentials.apiSecret,
  };
}

/** Normalize whatever survived structured clone over IPC to a Buffer. */
function toBuffer(data) {
  if (Buffer.isBuffer(data)) return data;
  if (data instanceof Uint8Array) return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  if (data instanceof ArrayBuffer) return Buffer.from(data);
  if (Array.isArray(data)) return Buffer.from(data);
  throw new Error("Unsupported upload data type");
}

async function toReceiptResult(response) {
  if (!response.ok) {
    const errBody = await response.text().catch(() => "");
    return { ok: false, error: `Pinata upload failed (${response.status}): ${errBody}`.slice(0, 2000) };
  }
  const result = await response.json();
  const cid = result.IpfsHash;
  return {
    ok: true,
    transactionId: cid,
    timestamp: result.Timestamp,
    signature: null,
    url: `ipfs://${cid}`,
    gatewayUrl: `${PINATA_GATEWAY}/${cid}`,
    size: result.PinSize,
  };
}

/**
 * Publish content or JSON metadata to Pinata. `payload.kind` selects the
 * shape (every other field on `payload` is ignored — in particular there is
 * no headers/auth channel from the renderer at all):
 *   - "content": { data, contentType, fileName?, generation?, attribution? }
 *   - "file":    { filePath, contentType, generation?, attribution? } — read
 *                here, in the main process; the renderer never touches disk
 *                directly, but `filePath` is renderer-controlled, so it is
 *                run through the same P7 `authorizeRead` gate (owned
 *                model/files roots, or a live native-dialog grant bound to
 *                `deps.senderId`) as read-file-as-base64 in main.js before
 *                anything is stat'd or read. A renderer that never went
 *                through a native dialog for that exact path cannot get an
 *                arbitrary local file uploaded and CID'd this way.
 *   - "metadata": { metadata, generation?, attribution? }
 *
 * Returns `{ ok: true, transactionId, timestamp, signature, url, gatewayUrl,
 * size, tags }` or `{ ok: false, error }` — the error is always a plain
 * string that never embeds `credentials` (only the Pinata HTTP status/body,
 * which cannot contain a value this process didn't send). Never throws for
 * "expected" failures (missing credentials, oversized payload, policy
 * rejection) — a rejected publish is reported, not an unhandled rejection.
 *
 * `deps` is an injection seam for tests: `env` replaces process.env,
 * `readFile`/`statFile` replace disk I/O, `senderId`/`roots`/`grants` feed
 * the `authorizeRead` check for `kind: "file"` (mirroring the `fileGrants`
 * store and `fileAccessRoots()` main.js already wires into
 * read-file-as-base64 — see src/main/fileAccess.js), and `lookup`/
 * `fetchImpl`/`buildDispatcher`/`maxRedirects` (plus `performEgress` itself)
 * are forwarded to performEgressRequest exactly as in egressPolicy.js's own
 * tests.
 */
export async function publishToPinata(payload, deps = {}) {
  const {
    env = process.env,
    performEgress = performEgressRequest,
    readFile = fs.promises.readFile,
    statFile = fs.promises.stat,
    senderId = null,
    roots = [],
    grants = null,
    ...egressDeps
  } = deps;

  const credentials = readPinataCredentials(env);
  if (!credentials) {
    return {
      ok: false,
      error: "Pinata credentials not configured. Set PINATA_JWT (or PINATA_API_KEY + PINATA_API_SECRET) in the environment.",
    };
  }

  const kind = payload?.kind;
  const generation = (payload && typeof payload.generation === "object" && payload.generation) || {};
  const attribution = (payload && typeof payload.attribution === "object" && payload.attribution) || {};

  try {
    if (kind === "metadata") {
      const metadata = payload?.metadata;
      if (!metadata || typeof metadata !== "object") {
        throw new Error("metadata publish requires a JSON-serializable object");
      }
      const body = JSON.stringify({
        pinataContent: metadata,
        pinataMetadata: {
          name: `bonzai-metadata-${Date.now()}.json`,
          keyvalues: buildKeyValues(generation, attribution),
        },
        pinataOptions: { cidVersion: 1 },
      });
      if (Buffer.byteLength(body, "utf8") > MAX_METADATA_BYTES) {
        throw new Error(`Metadata payload too large (max ${MAX_METADATA_BYTES} bytes)`);
      }

      const response = await performEgress(
        {
          policy: PINATA_POLICY,
          url: `${PINATA_ORIGIN}/pinning/pinJSONToIPFS`,
          method: "POST",
          headers: {},
          body,
          mainHeaders: { "Content-Type": "application/json", ...authHeadersFor(credentials) },
        },
        egressDeps,
      );
      const receipt = await toReceiptResult(response);
      return receipt.ok ? { ...receipt, tags: [] } : receipt;
    }

    let buffer;
    const contentType = payload?.contentType || "application/octet-stream";

    if (kind === "file") {
      const filePath = payload?.filePath;
      if (typeof filePath !== "string" || !filePath) throw new Error("file publish requires filePath");
      // P7 gate: filePath is renderer-controlled, so it must sit inside an
      // owned root or be covered by a live native-dialog grant for this
      // exact sender before it is ever stat'd or read — same containment
      // read-file-as-base64 (main.js) applies, closing off arbitrary local
      // file exfiltration to public IPFS via a compromised/XSS'd renderer.
      const decision = authorizeRead({ requestedPath: filePath, senderId, roots, grants });
      if (!decision.ok) throw new Error("File access denied");
      const stat = await statFile(decision.canonicalPath);
      if (!stat.isFile()) throw new Error("filePath does not refer to a regular file");
      if (stat.size > MAX_UPLOAD_BYTES) {
        throw new Error(`File too large (${stat.size} bytes, max ${MAX_UPLOAD_BYTES})`);
      }
      buffer = await readFile(decision.canonicalPath);
    } else if (kind === "content") {
      buffer = toBuffer(payload?.data);
      if (buffer.byteLength > MAX_UPLOAD_BYTES) {
        throw new Error(`Upload too large (${buffer.byteLength} bytes, max ${MAX_UPLOAD_BYTES})`);
      }
    } else {
      throw new Error(`Unknown publish kind: ${String(kind)}`);
    }

    const ext = extFromContentType(contentType);
    const fileName = payload?.fileName || `bonzai-${generation.type || "content"}-${Date.now()}.${ext}`;
    const keyvalues = buildKeyValues(generation, attribution);

    const formData = new FormData();
    formData.append("file", new Blob([buffer], { type: contentType }), fileName);
    formData.append("pinataMetadata", JSON.stringify({ name: fileName, keyvalues }));
    formData.append("pinataOptions", JSON.stringify({ cidVersion: 1 }));

    const response = await performEgress(
      {
        policy: PINATA_POLICY,
        url: `${PINATA_ORIGIN}/pinning/pinFileToIPFS`,
        method: "POST",
        headers: {},
        body: formData,
        mainHeaders: authHeadersFor(credentials),
      },
      egressDeps,
    );
    const receipt = await toReceiptResult(response);
    return receipt.ok
      ? { ...receipt, tags: Object.entries(keyvalues).map(([name, value]) => ({ name, value })) }
      : receipt;
  } catch (err) {
    const message = err instanceof EgressPolicyError ? err.message : (err?.message || String(err));
    return { ok: false, error: message };
  }
}
