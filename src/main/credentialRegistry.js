// src/main/credentialRegistry.js
//
// Per-instance credential registry — the main-process trust primitive.
//
// Local services (Flask inference, orchestrator, OpenClaw) previously ran
// with no shared session credential, and Flask's signing secret fell back
// to a hardcoded default. This module mints, for each application launch:
//
//   - a scoped local-session credential with >= 128 bits of CSPRNG entropy,
//     bounded lifetime (<= 24h), a monotonic generation counter, and
//     explicit service/operation scopes;
//   - a separate, non-default Flask signing secret.
//
// Everything is memory-only: nothing here is written to disk, store, or
// logs. The registry is replaced on every application launch. Secrets are
// handed to child processes through their environment ONLY (see
// `childEnvSecrets`); they never appear in argv, URLs, logs, or storage.
//
// Deterministic seams: `rng` and `now` default to the CSPRNG and wall clock
// but are injectable so tests can produce controlled, repeatable credentials.
//
// This module is dependency-free (node `crypto` only) so it can be unit-tested
// under `node --test` without loading Electron.

import crypto from "crypto";

// >= 128 bits of entropy per R1. 32 bytes = 256 bits gives comfortable margin.
const SECRET_BYTES = 32;
// R1: lifetime must be no more than 24 hours.
export const MAX_LIFETIME_MS = 24 * 60 * 60 * 1000;
const DEFAULT_LIFETIME_MS = MAX_LIFETIME_MS;

// Default scopes attached to every issued credential. Callers may add more
// via `issue({ extraScopes })`; a credential validates only for scopes it
// actually carries, so broadening trust requires explicit re-issue.
const DEFAULT_SCOPES = ["local-session"];

// Environment variable names consumed by local child services. These names
// are the ONLY channel through which registry secrets leave this process.
//
//   SESSION          — the per-launch session credential (P2+ bridge / server auth).
//   SESSION_EXPIRES  — the credential's epoch-second expiry. bonzai_security.py's
//                       validate_startup_secrets() refuses to start Flask without
//                       this, and session_credential_active() fails closed on a
//                       missing/malformed value, so it MUST travel alongside SESSION.
//   FLASK_SIGNING     — non-default Flask signing secret; matches the
//                       `os.environ.get("SECRET_KEY", ...)` read already in
//                       src/server/diffuser.py, so a non-default value takes
//                       effect with no Python change in this step.
export const CREDENTIAL_ENV = Object.freeze({
  SESSION: "BONZAI_SESSION_CREDENTIAL",
  SESSION_EXPIRES: "BONZAI_SESSION_EXPIRES",
  FLASK_SIGNING: "SECRET_KEY",
});

function defaultRng(bytes) {
  return crypto.randomBytes(bytes);
}

const toHex = (bytes) => Buffer.from(bytes).toString("hex");

/**
 * Constant-time string comparison that fails closed (returns false) on
 * length mismatch instead of throwing. A same-length self-comparison is
 * still performed on the mismatch path so the two branches take roughly
 * equal time, avoiding a length-based timing oracle on the secret.
 */
function safeEqual(a, b) {
  const ab = Buffer.from(String(a ?? ""), "utf8");
  const bb = Buffer.from(String(b ?? ""), "utf8");
  if (ab.length !== bb.length) {
    crypto.timingSafeEqual(ab, ab);
    return false;
  }
  return crypto.timingSafeEqual(ab, bb);
}

/**
 * Create a fresh, memory-only per-instance credential registry.
 *
 * @param {object} [opts]
 * @param {(bytes:number)=>Buffer} [opts.rng]       CSPRNG source (injectable for tests).
 * @param {()=>number}              [opts.now]       Clock source (injectable for tests).
 * @param {number}                  [opts.lifetimeMs] Credential lifetime, <= 24h.
 * @param {string[]}                [opts.scopes]    Scopes attached to every credential.
 * @returns {object} A registry handle (see methods below).
 *
 * Registry API:
 *   issue({ type?, extraScopes? })   Mint/reissue the session credential.
 *                                    Returns a redacted descriptor (no raw secret).
 *   validate({ token, type, scope, generation })
 *                                    Constant-time validation; fails closed on
 *                                    wrong type / scope, expiry, or stale generation.
 *   invalidate()                     Drop the current credential; further use fails.
 *   getSessionCredential()           Raw session token (for env delivery only),
 *                                    or null when no credential is live or the
 *                                    live one has expired (mirrors validate()).
 *   getFlaskSigningSecret()          Raw Flask signing secret (for env delivery only).
 *   describe()                       Log-safe metadata (no secret values).
 */
export function createCredentialRegistry({
  rng = defaultRng,
  now = () => Date.now(),
  lifetimeMs = DEFAULT_LIFETIME_MS,
  scopes = DEFAULT_SCOPES,
} = {}) {
  if (typeof rng !== "function") throw new Error("rng must be a function");
  if (typeof now !== "function") throw new Error("now must be a function");
  if (!Number.isFinite(lifetimeMs) || lifetimeMs <= 0) {
    throw new Error("lifetimeMs must be a positive number of milliseconds");
  }
  if (lifetimeMs > MAX_LIFETIME_MS) {
    throw new Error(`credential lifetime must be <= 24h (${MAX_LIFETIME_MS}ms)`);
  }
  if (!Array.isArray(scopes) || scopes.length === 0) {
    throw new Error("credential registry requires at least one scope");
  }

  // The Flask signing secret is minted once per registry instance (per launch)
  // and never rotated in-process. It is distinct from the session credential.
  const flaskSigningSecret = toHex(rng(SECRET_BYTES));

  // Monotonic generation counter. Bumped on every (re)issue so callers can
  // reject credentials from a prior generation even if a token were reused.
  let generation = 0;
  // The live credential, or null when nothing issued / after invalidation.
  let current = null;

  function issue({ type = "local-session", extraScopes = [] } = {}) {
    if (typeof type !== "string" || !type) {
      throw new Error("credential type must be a non-empty string");
    }
    const extra = Array.isArray(extraScopes) ? extraScopes : [extraScopes];
    generation += 1;
    const issuedAt = now();
    current = {
      token: toHex(rng(SECRET_BYTES)),
      type,
      scopes: Array.from(new Set([...scopes, ...extra])).sort(),
      issuedAt,
      expiresAt: issuedAt + lifetimeMs,
      generation,
    };
    return describe();
  }

  // Validate every condition into a boolean FIRST, then combine. The
  // timing-sensitive comparisons (safeEqual) all run regardless of outcome
  // so a caller cannot learn which field failed from how long validate took.
  // Fails closed (returns false) when no credential is live.
  function validate({ token, type, scope, generation: gen } = {}) {
    const cred = current;
    if (!cred) return false;

    const tokenOk = safeEqual(token, cred.token);
    const typeOk = safeEqual(type, cred.type);
    const scopeOk = cred.scopes.some((s) => safeEqual(scope, s));
    const notExpired = now() < cred.expiresAt;
    const genOk = typeof gen === "number" ? gen === cred.generation : true;

    return tokenOk && typeOk && scopeOk && notExpired && genOk;
  }

  function invalidate() {
    current = null;
  }

  // Only ever return a credential the registry itself still considers valid.
  // validate() already rejects tokens past expiresAt; mirror that here so a
  // child service restarted after expiry is not handed a credential we know
  // to be invalid. Returns null exactly as after invalidation / no issue.
  function getSessionCredential() {
    if (!current) return null;
    if (now() >= current.expiresAt) return null;
    return current.token;
  }

  function getFlaskSigningSecret() {
    return flaskSigningSecret;
  }

  // Log-safe view: metadata only, never the raw token or signing secret.
  function describe() {
    if (!current) return { issued: false };
    return {
      issued: true,
      type: current.type,
      scopes: current.scopes.slice(),
      issuedAt: current.issuedAt,
      expiresAt: current.expiresAt,
      lifetimeMs,
      generation: current.generation,
      entropyBits: SECRET_BYTES * 8,
    };
  }

  return {
    issue,
    validate,
    invalidate,
    getSessionCredential,
    getFlaskSigningSecret,
    describe,
  };
}

/**
 * Build the environment-variable block that delivers registry secrets to a
 * local child process. Returned object is meant to be spread into a spawn's
 * `env`. Secrets travel ONLY through these env entries — never argv, URLs,
 * logs, or persistent storage.
 *
 * `flask` (default true) controls whether the Flask signing secret is
 * delivered. Only the local Flask/diffuser service consumes SECRET_KEY, so
 * an unrelated child (e.g. the network-facing rpc-server) is spawned with
 * `{ flask: false }` and receives the session credential alone — keeping
 * the signing secret scoped to the service that uses it.
 *
 * Entries whose source returns null (no live credential, or one that has
 * expired — see getSessionCredential) are omitted rather than serialized as
 * the string "null", so a restarted child past expiry receives no key at all.
 *
 * @param {ReturnType<createCredentialRegistry>} registry
 * @param {{ flask?: boolean }} [opts]
 * @returns {Record<string, string>} env entries (session credential, and
 *   optionally the Flask signing secret)
 */
export function childEnvSecrets(registry, { flask = true } = {}) {
  const env = {};
  const session = registry.getSessionCredential();
  if (session != null) {
    env[CREDENTIAL_ENV.SESSION] = session;
    // Same liveness check as getSessionCredential(), so expiresAt here is
    // always in the future — Flask's session_credential_active() re-derives
    // the same fail-closed check from this value on every request.
    const { expiresAt } = registry.describe();
    if (typeof expiresAt === "number") {
      env[CREDENTIAL_ENV.SESSION_EXPIRES] = String(Math.floor(expiresAt / 1000));
    }
  }
  if (flask) env[CREDENTIAL_ENV.FLASK_SIGNING] = registry.getFlaskSigningSecret();
  return env;
}
