// src/main/openclawServer.js
//
// P6 — Authenticate and validate the OpenClaw API.
//
// The OpenClaw gateway (src/main.js) used to listen on all interfaces with
// Access-Control-Allow-Origin: * and an unauthenticated POST /webhook that
// forwarded arbitrary JSON straight into the companion pipeline. This module
// is the security- and route-bearing core of that server, pulled out of
// main.js (which owns Electron-only state like `mainWindow` and `store`) so
// it can be constructed with plain injected dependencies and exercised end
// to end under `node --test`, without an Electron process.
//
// Design, mirrored from src/server/bonzai_security.py (P3/P5) and
// src/main/credentialRegistry.js (P1):
//   - loopback-only bind host, coerced even under misconfiguration (R1);
//   - one central auth guard in front of every non-preflight route, using
//     constant-time validation of the P1 credential registry's session
//     credential under a dedicated "openclaw" scope (R2);
//   - exact trusted-origin CORS allowlist, never a wildcard, deterministic
//     204 preflight regardless of auth/origin trust (R2);
//   - finite header/request timeouts (Node's own sane defaults, restored by
//     simply not overriding them) and one shared bounded JSON body reader
//     used by every route (R3);
//   - a strict allowlisted schema for /webhook — unknown keys, wrong types,
//     unsupported values, and oversized fields are all rejected before
//     forwardToRenderer is ever called (R4);
//   - no header dumps, no raw-body previews, and generic error bodies, so
//     credentials/headers/bodies/stack-ish detail never reach logs or
//     responses (R4);
//   - the Flask proxy attaches the main-owned scoped credential itself;
//     nothing from the caller's own headers is ever forwarded (R5).
//
// This module imports nothing from Electron.

import http from "node:http";
import fs from "node:fs";

// ─────────────────────────────────────────────────────────────────────────────
// Bind configuration (R1)
// ─────────────────────────────────────────────────────────────────────────────

export const OPENCLAW_HOST_ENV = "OPENCLAW_API_HOST";
export const OPENCLAW_PORT_ENV = "OPENCLAW_API_PORT";
export const OPENCLAW_TRUSTED_ORIGINS_ENV = "OPENCLAW_TRUSTED_ORIGINS";

// Non-privileged default port, unchanged from the pre-hardening server.
export const DEFAULT_OPENCLAW_PORT = 3002;
export const DEFAULT_OPENCLAW_HOST = "127.0.0.1";

// The scope every OpenClaw route validates against on the shared P1 session
// credential (see credentialRegistry.js). Flask validates the same raw
// token by plain equality and knows nothing about scopes; this scope only
// gates the in-process registry.validate() calls this module makes.
export const OPENCLAW_CREDENTIAL_SCOPE = "openclaw";

const DEFAULT_TRUSTED_ORIGINS = Object.freeze([
  "http://localhost:5173", // Vite dev server
  "http://127.0.0.1:5173",
  "app://.", // packaged Electron renderer scheme
  "file://", // packaged Electron renderer (file:// path)
  "null", // opaque Origin Chromium emits for the packaged file:// renderer
]);

function isLoopbackHost(host) {
  return (
    host === "localhost" ||
    host === "::1" ||
    host === "0:0:0:0:0:0:0:1" ||
    host.startsWith("127.")
  );
}

/** Loopback-only bind host. Any non-loopback value (including 0.0.0.0) is
 * coerced back to 127.0.0.1 so the server never binds all interfaces, even
 * under misconfiguration (R1). */
export function getOpenClawHost(env = process.env) {
  const raw = String(env[OPENCLAW_HOST_ENV] || DEFAULT_OPENCLAW_HOST)
    .trim()
    .toLowerCase();
  if (!raw || !isLoopbackHost(raw)) return DEFAULT_OPENCLAW_HOST;
  return raw === "localhost" ? DEFAULT_OPENCLAW_HOST : raw;
}

/** Environment-configurable port, retaining the non-privileged 3002 default. */
export function getOpenClawPort(env = process.env) {
  const port = parseInt(env[OPENCLAW_PORT_ENV], 10);
  if (!Number.isFinite(port) || port <= 0 || port >= 65536) return DEFAULT_OPENCLAW_PORT;
  return port;
}

/** Trusted-origin allowlist. A wildcard would re-enable credentialed CORS
 * for every origin, so any '*' in the configured value is dropped and we
 * fall back to the loopback defaults rather than fail open. */
export function getOpenClawTrustedOrigins(env = process.env) {
  const raw = String(env[OPENCLAW_TRUSTED_ORIGINS_ENV] || "").trim();
  if (!raw) return [...DEFAULT_TRUSTED_ORIGINS];
  const origins = raw
    .split(",")
    .map((o) => o.trim())
    .filter((o) => o && o !== "*");
  return origins.length ? origins : [...DEFAULT_TRUSTED_ORIGINS];
}

export function isOriginAllowed(origin, trusted) {
  if (!origin) return false;
  for (const entry of trusted) {
    if (origin === entry) return true;
    if (entry.endsWith("://") && origin.startsWith(entry)) return true;
    if (origin.replace(/\/$/, "") === entry.replace(/\/$/, "")) return true;
  }
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// Central authentication (R2) — constant-time via credentialRegistry.validate
// ─────────────────────────────────────────────────────────────────────────────

/** Read the presented credential from either an OpenAI-client-style
 * `Authorization: Bearer` header or the app's own `x-bonzai-session`
 * header, so both OpenClaw/Hermes (configured with the live credential as
 * their provider apiKey) and in-app callers (auth.service.js) authenticate
 * the same way. `x-bonzai-session` is checked first: auth.service.js's
 * authFetch() deliberately sends both headers for wallet-connected users
 * (the wallet JWT as Bearer, the local session as x-bonzai-session), and
 * only the latter is ever a valid credential for this server — preferring
 * Bearer would shadow a valid local session with an unrelated wallet token. */
export function extractPresentedToken(req) {
  const session = req.headers["x-bonzai-session"];
  if (typeof session === "string" && session) {
    return session;
  }
  const auth = req.headers["authorization"];
  if (typeof auth === "string" && auth.startsWith("Bearer ")) {
    return auth.slice(7).trim();
  }
  return "";
}

/** True iff the request carries a live, correctly-scoped credential.
 * Delegates the actual comparison to credentialRegistry.validate(), which
 * is constant-time and fails closed on every mismatch axis. */
export function isRequestAuthenticated(req, registry) {
  if (!registry) return false;
  const token = extractPresentedToken(req);
  return registry.validate({
    token,
    type: "local-session",
    scope: OPENCLAW_CREDENTIAL_SCOPE,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared bounded JSON body reading (R3)
// ─────────────────────────────────────────────────────────────────────────────

function bodyTooLargeError() {
  return Object.assign(new Error("Request body too large"), { statusCode: 413 });
}

function invalidJsonError() {
  return Object.assign(new Error("Invalid JSON"), { statusCode: 400 });
}

/** Accumulate a request body up to `maxBytes`, rejecting (without buffering
 * any further) the moment the bound is exceeded. Deliberately does NOT
 * destroy the socket itself — the caller still owns `res` at that point and
 * needs the connection alive long enough to write a 413 response; see
 * `respondBodyError` below, which closes the connection only after that
 * response has actually been flushed. */
export function readRequestBody(req, { maxBytes }) {
  return new Promise((resolve, reject) => {
    let data = "";
    let settled = false;
    req.on("data", (chunk) => {
      if (settled) return;
      data += chunk;
      if (Buffer.byteLength(data) > maxBytes) {
        settled = true;
        reject(bodyTooLargeError());
      }
    });
    req.on("end", () => {
      if (settled) return;
      settled = true;
      resolve(data);
    });
    req.on("error", () => {
      if (settled) return;
      settled = true;
      reject(Object.assign(new Error("Request error"), { statusCode: 400 }));
    });
  });
}

/** Write the 4xx/413 body-error response, then — only for the oversized-body
 * case, and only once the response has actually finished writing — force
 * the connection closed so bytes still arriving from an over-limit upload
 * are never left to be misread as the start of the next keep-alive request. */
function respondBodyError(req, res, err) {
  const status = err.statusCode || 400;
  res.writeHead(status, { "Content-Type": "application/json", Connection: "close" });
  res.end(JSON.stringify({ error: status === 413 ? "Request body too large" : "Invalid JSON" }));
  if (status === 413) {
    res.once("finish", () => req.socket?.destroy());
  }
  return status;
}

/** Bounded body read + JSON parse, shared by every POST route. */
export async function readJsonBody(req, { maxBytes }) {
  const raw = await readRequestBody(req, { maxBytes });
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw invalidJsonError();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// /webhook payload validation (R4) — strict allowlisted schema
// ─────────────────────────────────────────────────────────────────────────────

// Documented, supported values for the `platform` field. An OpenClaw/Hermes
// gateway sends one of these; anything else is rejected before it ever
// reaches forwardToRenderer. "openclaw" and "hermes" are the values the
// bundled openclaw/SKILL.md and hermes/SKILL.md gateways actually send;
// the rest cover chat platforms those gateways can themselves be bridging.
export const WEBHOOK_SUPPORTED_PLATFORMS = Object.freeze([
  "openclaw",
  "hermes",
  "discord",
  "telegram",
  "whatsapp",
  "slack",
  "web",
  "api",
]);

// The ONLY keys a /webhook payload may contain. Anything else is rejected —
// this is the boundary that keeps arbitrary attacker JSON from reaching the
// companion pipeline. `channelId`/`userId` are what openclaw/SKILL.md,
// hermes/SKILL.md, and openclaw/bridge.js actually send on the wire;
// `channel`/`identifier` are accepted as the same fields under their
// documented API contract name, so either a gateway sending the SKILL.md
// shape or a caller using the generic contract names authenticates and
// validates identically. Both spellings map onto the same internal
// { channelId, userId } shape below.
const WEBHOOK_ALLOWED_KEYS = Object.freeze([
  "platform",
  "channelId",
  "channel",
  "message",
  "userId",
  "identifier",
  "imageBase64",
]);

const WEBHOOK_FIELD_LIMITS = Object.freeze({
  platform: 32,
  channelId: 256,
  channel: 256,
  message: 4000,
  userId: 256,
  identifier: 256,
  // Base64 image data for `!bonzai generate vision`; bounded well under
  // maxBodyBytes so the limit below is a belt-and-braces sanity check, not
  // the primary bound (readRequestBody already rejects an oversized body).
  imageBase64: 16 * 1024 * 1024,
});

function isBoundedString(value, maxLen) {
  return typeof value === "string" && value.length > 0 && value.length <= maxLen;
}

/**
 * Validate a decoded /webhook JSON body against the documented schema:
 * platform (enum), a channel id, message (bounded strings), and an optional
 * user id / imageBase64 (bounded strings). The channel id may arrive as
 * `channelId` (the SKILL.md/bridge.js wire shape) or `channel` (the generic
 * contract name); same for the user id as `userId` or `identifier` — never
 * both spellings of the same field at once, so there is exactly one source
 * of truth per request. Returns { ok:true, data } with `data` mapped onto
 * the internal shape forwardToRenderer/openclaw.handler.js already expect
 * ({ platform, channelId, message, userId?, imageBase64? }), or
 * { ok:false, error } with a safe, static message.
 */
export function validateWebhookPayload(body) {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Payload must be a JSON object" };
  }

  for (const key of Object.keys(body)) {
    if (!WEBHOOK_ALLOWED_KEYS.includes(key)) {
      return { ok: false, error: "Payload contains an unsupported field" };
    }
  }

  if (body.channelId !== undefined && body.channel !== undefined) {
    return { ok: false, error: "Payload contains an unsupported field" };
  }
  if (body.userId !== undefined && body.identifier !== undefined) {
    return { ok: false, error: "Payload contains an unsupported field" };
  }

  const { platform, message, imageBase64 } = body;
  const channelId = body.channelId !== undefined ? body.channelId : body.channel;
  const channelField = body.channelId !== undefined ? "channelId" : "channel";
  const userId = body.userId !== undefined ? body.userId : body.identifier;
  const userField = body.userId !== undefined ? "userId" : "identifier";

  if (!isBoundedString(platform, WEBHOOK_FIELD_LIMITS.platform)) {
    return { ok: false, error: "platform is required" };
  }
  if (!WEBHOOK_SUPPORTED_PLATFORMS.includes(platform)) {
    return { ok: false, error: "platform is not supported" };
  }
  if (!isBoundedString(channelId, WEBHOOK_FIELD_LIMITS[channelField])) {
    return { ok: false, error: `${channelField} is required` };
  }
  if (!isBoundedString(message, WEBHOOK_FIELD_LIMITS.message)) {
    return { ok: false, error: "message is required" };
  }
  if (userId !== undefined && !isBoundedString(userId, WEBHOOK_FIELD_LIMITS[userField])) {
    return { ok: false, error: `${userField} must be a bounded string` };
  }
  if (
    imageBase64 !== undefined &&
    imageBase64 !== null &&
    !isBoundedString(imageBase64, WEBHOOK_FIELD_LIMITS.imageBase64)
  ) {
    return { ok: false, error: "imageBase64 must be a bounded string" };
  }

  return {
    ok: true,
    data: {
      platform,
      channelId,
      message,
      ...(userId !== undefined ? { userId } : {}),
      ...(imageBase64 ? { imageBase64 } : {}),
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Webhook → renderer forwarder
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build the forward()/respond() pair that bridges an HTTP /webhook (or
 * companion/scenario/skill) request to the renderer over IPC and back.
 * Pure aside from the injected `sendToRenderer`/`isRendererAvailable`
 * callbacks, so it is unit-testable without Electron.
 */
export function createWebhookForwarder({
  isRendererAvailable,
  sendToRenderer,
  maxPending = 50,
  timeoutMs = 5 * 60 * 1000,
}) {
  const pending = new Map();
  let nextId = 0;

  function forward(data) {
    return new Promise((resolve, reject) => {
      if (!isRendererAvailable()) {
        reject(new Error("Renderer not available"));
        return;
      }
      if (pending.size > maxPending) {
        reject(new Error(`Webhook queue full (>${maxPending} pending requests)`));
        return;
      }
      const requestId = ++nextId;
      const timeout = setTimeout(() => {
        pending.delete(requestId);
        reject(new Error(`Webhook request timed out after ${Math.round(timeoutMs / 60000)} minutes`));
      }, timeoutMs);
      pending.set(requestId, {
        resolve: (result) => {
          clearTimeout(timeout);
          resolve(result);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        },
      });
      sendToRenderer({ requestId, ...data });
    });
  }

  function respond(requestId, result) {
    const p = pending.get(requestId);
    if (p) {
      p.resolve(result);
      pending.delete(requestId);
    }
  }

  return { forward, respond, pendingCount: () => pending.size };
}

// ─────────────────────────────────────────────────────────────────────────────
// Server factory
// ─────────────────────────────────────────────────────────────────────────────

const PARSE_FAILED = Symbol("openclaw-parse-failed");

/**
 * Build the OpenClaw HTTP server (not yet listening) plus the pieces main.js
 * needs to wire up around it. All Electron-owned state (mainWindow, store,
 * llamaServer, currentLoadedModel, etc.) is injected — this module touches
 * only `node:http`/`node:fs` and the credential registry's plain object API.
 *
 * @param {object} deps
 * @param {object} deps.registry               P1 credential registry (required).
 * @param {object} [deps.env]                   Defaults to process.env.
 * @param {() => boolean} deps.isRendererAvailable
 * @param {(payload:object) => void} deps.sendToRenderer
 * @param {() => object} deps.getHealthInfo     { llmLoaded, modelName, flaskPort, companions, scenarios, rendererReady }
 * @param {(agent:string) => (string|null)} deps.resolveManifestPath
 * @param {(path:string) => string} [deps.readManifestFile]
 * @param {object} deps.llama                   { isRunning, proxyRequest, chat } (llamaServer.manager.js namespace)
 * @param {() => (string|null)} deps.getCurrentModelFilename
 * @param {(body:object) => Promise<string>} deps.runVisionAnalyze
 * @param {(spec:object) => Promise<void>} deps.loadModelSpec
 * @param {() => Promise<void>} deps.unloadModel
 * @param {(opts:object) => void} deps.recordLifetimeTokenUsage
 * @param {number} deps.flaskPort
 * @param {() => Record<string,string>} deps.flaskAuthHeaders  Server-side scoped credential header(s) for the Flask proxy (R5) — never derived from caller headers.
 * @param {typeof fetch} [deps.fetchImpl]
 * @param {Console} [deps.log]
 * @returns {{ server: import('node:http').Server, host: string, port: number, trustedOrigins: string[], respondWebhook: (id:number, result:any)=>void }}
 */
export function createOpenClawServer(deps) {
  const {
    registry,
    env = process.env,
    isRendererAvailable,
    sendToRenderer,
    getHealthInfo,
    resolveManifestPath,
    readManifestFile = (p) => fs.readFileSync(p, "utf8"),
    llama,
    getCurrentModelFilename,
    runVisionAnalyze,
    loadModelSpec,
    unloadModel,
    recordLifetimeTokenUsage,
    flaskPort,
    flaskAuthHeaders,
    fetchImpl = fetch,
    log = console,
    maxBodyBytes = 10 * 1024 * 1024,
    maxVisionBodyBytes = 32 * 1024 * 1024,
    webhookMaxPending = 50,
    webhookTimeoutMs = 5 * 60 * 1000,
  } = deps || {};

  if (!registry) throw new Error("createOpenClawServer requires a credential registry");

  const trustedOrigins = getOpenClawTrustedOrigins(env);
  const forwarder = createWebhookForwarder({
    isRendererAvailable,
    sendToRenderer,
    maxPending: webhookMaxPending,
    timeoutMs: webhookTimeoutMs,
  });

  async function parseJsonOrRespond(req, res, maxBytes) {
    try {
      return await readJsonBody(req, { maxBytes });
    } catch (err) {
      respondBodyError(req, res, err);
      return PARSE_FAILED;
    }
  }

  const server = http.createServer(async (req, res) => {
    // ── CORS: exact trusted-origin allowlist, never a wildcard (R2) ──
    const origin = req.headers.origin;
    if (origin && isOriginAllowed(origin, trustedOrigins)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.setHeader("Vary", "Origin");
    }
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-bonzai-session");

    // ── Preflight: deterministic 204, never authenticated (browsers never
    // attach credentials to an OPTIONS preflight) ──
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    // ── Central auth guard: every non-preflight route (R2) ──
    if (!isRequestAuthenticated(req, registry)) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Unauthorized" }));
      return;
    }

    let url;
    try {
      url = new URL(req.url, "http://127.0.0.1");
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid request" }));
      return;
    }

    // Health check
    if (req.method === "GET" && url.pathname === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", ...getHealthInfo() }));
      return;
    }

    // Manifest discovery — serves the SKILL.md files so an authenticated
    // agent harness can GET the BonzAI capability description without
    // needing the repo on disk. `?agent=openclaw` (default) or `?agent=hermes`.
    if (req.method === "GET" && url.pathname === "/manifest") {
      const agent = (url.searchParams.get("agent") || "openclaw").toLowerCase();
      const manifestName = agent === "hermes" ? "hermes" : "openclaw";
      const manifestPath = resolveManifestPath(manifestName);
      if (!manifestPath) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: `manifest not found for ${agent}` }));
        return;
      }
      try {
        const content = readManifestFile(manifestPath);
        res.writeHead(200, {
          "Content-Type": "text/markdown; charset=utf-8",
          "X-Manifest-Agent": manifestName,
        });
        res.end(content);
      } catch {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Failed to read manifest" }));
      }
      return;
    }

    // ═══════════════════════════════════════════════════════════════════
    // OpenClaw Gateway Webhook (R4)
    // ═══════════════════════════════════════════════════════════════════
    if (req.method === "POST" && url.pathname === "/webhook") {
      const body = await parseJsonOrRespond(req, res, maxBodyBytes);
      if (body === PARSE_FAILED) return;

      const validated = validateWebhookPayload(body);
      if (!validated.ok) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: validated.error }));
        return;
      }

      // Never log message content or channel/sender identifiers — only
      // non-sensitive routing metadata.
      log.log(`[OpenClaw Webhook] platform=${validated.data.platform} messageLength=${validated.data.message.length}`);

      try {
        const result = await forwarder.forward(validated.data);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result));
      } catch (error) {
        log.error("[OpenClaw Webhook] forwarding failed:", error?.message || "unknown error");
        res.writeHead(502, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Webhook forwarding failed" }));
      }
      return;
    }

    // ═══════════════════════════════════════════════════════════════════
    // Companion & Scenario REST API (forwards to renderer for dynamic data)
    // ═══════════════════════════════════════════════════════════════════
    if (req.method === "GET" && url.pathname === "/companions") {
      try {
        const result = await forwarder.forward({ type: "get-companions" });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result));
      } catch {
        res.writeHead(503, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Renderer not available", companions: [] }));
      }
      return;
    }

    if (req.method === "GET" && url.pathname === "/scenarios") {
      try {
        const result = await forwarder.forward({ type: "get-scenarios" });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result));
      } catch {
        res.writeHead(503, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Renderer not available", scenarios: [] }));
      }
      return;
    }

    if (req.method === "GET" && url.pathname.startsWith("/companion/")) {
      const id = url.pathname.split("/")[2];
      try {
        const result = await forwarder.forward({ type: "get-companion", id });
        if (result) {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(result));
        } else {
          res.writeHead(404, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Companion not found" }));
        }
      } catch {
        res.writeHead(503, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Renderer not available" }));
      }
      return;
    }

    // ═══════════════════════════════════════════════════════════════════
    // Skills REST API (for OpenClaw skill discovery and execution)
    // ═══════════════════════════════════════════════════════════════════
    if (req.method === "GET" && url.pathname === "/api/skills") {
      try {
        const category = url.searchParams.get("category");
        const result = await forwarder.forward({ type: "get-skills", category });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result || []));
      } catch {
        res.writeHead(503, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Renderer not available", skills: [] }));
      }
      return;
    }

    if (req.method === "GET" && url.pathname.startsWith("/api/skills/")) {
      const id = url.pathname.split("/")[3];
      if (id && id !== "execute") {
        try {
          const result = await forwarder.forward({ type: "get-skill", id });
          if (result) {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify(result));
          } else {
            res.writeHead(404, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Skill not found" }));
          }
        } catch {
          res.writeHead(503, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Renderer not available" }));
        }
        return;
      }
    }

    if (req.method === "POST" && /^\/api\/skills\/[^/]+\/execute$/.test(url.pathname)) {
      const skillId = url.pathname.split("/")[3];
      const body = await parseJsonOrRespond(req, res, maxBodyBytes);
      if (body === PARSE_FAILED) return;
      try {
        const result = await forwarder.forward({ type: "execute-skill", skillId, inputs: body });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result));
      } catch (error) {
        log.error("[OpenClaw API] Skill execute failed:", error?.message || "unknown error");
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Skill execution failed" }));
      }
      return;
    }

    // ═══════════════════════════════════════════════════════════════════
    // Vision analyze
    // ═══════════════════════════════════════════════════════════════════
    if (req.method === "POST" && url.pathname === "/api/vision/analyze") {
      const body = await parseJsonOrRespond(req, res, maxVisionBodyBytes);
      if (body === PARSE_FAILED) return;
      try {
        const text = await runVisionAnalyze(body);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true, response: text }));
      } catch (error) {
        log.error("[OpenClaw API] Vision analyze failed:", error?.message || "unknown error");
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Vision analyze failed" }));
      }
      return;
    }

    // ═══════════════════════════════════════════════════════════════════
    // OpenAI-Compatible API (for OpenClaw and other clients)
    // ═══════════════════════════════════════════════════════════════════
    if (req.method === "GET" && url.pathname === "/v1/models") {
      const modelName = getCurrentModelFilename() || "bonzai-sovereign";
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        object: "list",
        data: [
          { id: "bonzai-sovereign", object: "model", created: Date.now(), owned_by: "bonzai" },
          { id: modelName, object: "model", created: Date.now(), owned_by: "bonzai" },
        ],
      }));
      return;
    }

    if (req.method === "POST" && url.pathname === "/v1/chat/completions") {
      const body = await parseJsonOrRespond(req, res, maxBodyBytes);
      if (body === PARSE_FAILED) return;

      const { messages } = body;
      if (!messages || !Array.isArray(messages)) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: { message: "messages array is required", type: "invalid_request_error" } }));
        return;
      }
      if (!llama.isRunning()) {
        res.writeHead(503, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: { message: "No model loaded. Please load a model in BonzAI first.", type: "server_error" } }));
        return;
      }

      try {
        // Transparent proxy to the llama-server subprocess. This preserves
        // every OpenAI feature (tool_calls, json_mode, logprobs, vision via
        // image_url, etc.) without re-implementing them. The `model` field
        // is rewritten to match whichever GGUF is actually loaded.
        const actualModel = getCurrentModelFilename() || "unknown";
        const upstreamBody = { ...body, model: actualModel };

        const upstream = await llama.proxyRequest("/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(upstreamBody),
        });

        res.writeHead(upstream.status, Object.fromEntries(upstream.headers.entries()));

        if (!upstream.body) {
          res.end();
          return;
        }

        const reader = upstream.body.getReader();
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          if (!res.write(Buffer.from(value))) {
            await new Promise((resolve) => res.once("drain", resolve));
          }
        }
        res.end();
      } catch (error) {
        log.error("[OpenAI API] Chat completions failed:", error?.message || "unknown error");
        if (!res.headersSent) {
          res.writeHead(500, { "Content-Type": "application/json" });
        }
        res.end(JSON.stringify({ error: { message: "Chat completion failed", type: "server_error" } }));
      }
      return;
    }

    // ═══════════════════════════════════════════════════════════════════
    // LLM API (for direct access without roleplay context)
    // ═══════════════════════════════════════════════════════════════════
    if (req.method === "POST" && url.pathname === "/api/llm/chat") {
      const body = await parseJsonOrRespond(req, res, maxBodyBytes);
      if (body === PARSE_FAILED) return;
      try {
        const { prompt } = body;
        if (!prompt) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "prompt is required" }));
          return;
        }
        if (!llama.isRunning()) {
          res.writeHead(503, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "LLM not loaded. Load a model first." }));
          return;
        }
        const completion = await llama.chat({ messages: [{ role: "user", content: prompt }] });
        const response = completion.choices?.[0]?.message?.content ?? "";
        recordLifetimeTokenUsage({
          messages: [{ role: "user", content: prompt }],
          output: response,
          usage: completion.usage,
        });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true, response }));
      } catch (error) {
        log.error("[OpenClaw API] LLM chat failed:", error?.message || "unknown error");
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "LLM chat failed" }));
      }
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/llm/load") {
      const body = await parseJsonOrRespond(req, res, maxBodyBytes);
      if (body === PARSE_FAILED) return;
      try {
        const { modelname, filename, url: modelUrl } = body;
        await loadModelSpec({ modelname, filename, url: modelUrl });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true, modelName: modelname || filename }));
      } catch (error) {
        log.error("[OpenClaw API] LLM load failed:", error?.message || "unknown error");
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "LLM load failed" }));
      }
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/llm/unload") {
      try {
        await unloadModel();
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true }));
      } catch (error) {
        log.error("[OpenClaw API] LLM unload failed:", error?.message || "unknown error");
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "LLM unload failed" }));
      }
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/llm/info") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        loaded: llama.isRunning(),
        modelName: getCurrentModelFilename(),
        hasSession: llama.isRunning(),
      }));
      return;
    }

    // ═══════════════════════════════════════════════════════════════════
    // Flask Proxy — server-side scoped credential only (R5)
    // ═══════════════════════════════════════════════════════════════════
    if (url.pathname.startsWith("/api/flask/")) {
      const flaskPath = url.pathname.replace("/api/flask", "");
      const flaskUrl = `http://127.0.0.1:${flaskPort}${flaskPath}`;

      let raw = null;
      if (req.method === "POST") {
        try {
          raw = await readRequestBody(req, { maxBytes: maxBodyBytes });
        } catch (err) {
          respondBodyError(req, res, err);
          return;
        }
      }

      try {
        if (req.method === "POST") {
          const response = await fetchImpl(flaskUrl, {
            method: "POST",
            // The caller's own Authorization/x-bonzai-session headers are
            // never read here — Flask is authenticated with the main
            // process's own scoped credential, not whatever the caller sent.
            headers: { "Content-Type": "application/json", ...flaskAuthHeaders() },
            body: raw,
          });
          const data = await response.json();
          res.writeHead(response.status, { "Content-Type": "application/json" });
          res.end(JSON.stringify(data));
        } else {
          const response = await fetchImpl(flaskUrl, { headers: { ...flaskAuthHeaders() } });
          const data = await response.json();
          res.writeHead(response.status, { "Content-Type": "application/json" });
          res.end(JSON.stringify(data));
        }
      } catch (error) {
        log.error("[OpenClaw API] Flask proxy failed:", error?.message || "unknown error");
        res.writeHead(502, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Flask proxy error" }));
      }
      return;
    }

    // Not found
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
  });

  // Finite header/request timeouts (R3). Deliberately NOT overridden to 0
  // here (the pre-hardening server disabled all three): Node's own defaults
  // (headersTimeout 60s, requestTimeout 5min) are already sane bounds on
  // *receiving* a request. `server.timeout` (the whole-connection inactivity
  // timeout, which WOULD also cover time spent writing a long streaming
  // response) is intentionally left at Node's default of 0 (no timeout) so
  // long-running /v1/chat/completions generations keep working.
  server.keepAliveTimeout = 60_000;

  return {
    server,
    host: getOpenClawHost(env),
    port: getOpenClawPort(env),
    trustedOrigins,
    respondWebhook: forwarder.respond,
  };
}
