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
// Everything this module produces starts memory-only: nothing here is
// written to disk, store, or logs BY THIS MODULE. The registry is replaced
// on every application launch. Session secrets are handed to spawned child
// processes through their environment ONLY (see `childEnvSecrets`); they
// never appear in argv, URLs, logs, or storage.
//
// The one deliberate exception a caller may make is `issueExternalCredential`
// — a second, independently-random secret, scoped narrowly, that a caller
// MAY persist to an external tool's own on-disk config when that tool is a
// process we don't spawn (so environment delivery isn't possible). It is
// never derived from, nor interchangeable with, the session credential or
// Flask signing secret above, so persisting it cannot disclose either.
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
//   MEDIA_SIGNING     — HMAC secret for short-lived signed /media/stream and
//                       /media/info URLs (media:sign-url IPC). Matches
//                       bonzai_security.MEDIA_SIGNING_SECRET_ENV.
export const CREDENTIAL_ENV = Object.freeze({
  SESSION: "BONZAI_SESSION_CREDENTIAL",
  SESSION_EXPIRES: "BONZAI_SESSION_EXPIRES",
  FLASK_SIGNING: "SECRET_KEY",
  MEDIA_SIGNING: "BONZAI_MEDIA_SIGNING_SECRET",
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
 *   invalidate({ scope })            Drop the credential(s) in `scope` ("session"
 *                                    [default], "external", or "all"); further
 *                                    use of the dropped credential(s) fails.
 *                                    Wallet logout must only kill the session
 *                                    credential — external integrations
 *                                    (OpenClaw/Hermes) keep validating.
 *   getSessionCredential()           Raw session token (for env delivery only),
 *                                    or null when no credential is live or the
 *                                    live one has expired (mirrors validate()).
 *   getFlaskSigningSecret()          Raw Flask signing secret (for env delivery only).
 *   issueExternalCredential(scope)   Mint/reissue a SEPARATE credential scoped
 *                                    to exactly one scope, independent of the
 *                                    session token. The only secret this
 *                                    registry considers safe to persist to
 *                                    disk (see module doc above `current`).
 *                                    Returns the raw token.
 *   getExternalCredential()          Raw external-credential token, or null
 *                                    when none is live/minted yet or it has
 *                                    expired.
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
  // Media-URL signing secret: also minted once per launch, independent of
  // both secrets above. Only media:sign-url (main.js) and Flask's
  // media_signature_valid (bonzai_security.py) ever see it.
  const mediaSigningSecret = toHex(rng(SECRET_BYTES));

  // Monotonic generation counter. Bumped on every (re)issue so callers can
  // reject credentials from a prior generation even if a token were reused.
  let generation = 0;
  // The live credential, or null when nothing issued / after invalidation.
  let current = null;

  // A SECOND, independent credential for callers that must hand a secret to
  // a process this registry cannot reach over an environment variable (e.g.
  // OpenClaw/Hermes: external tools we don't spawn, whose only integration
  // point is their own on-disk config — see hermes-set-enabled /
  // openclaw-set-enabled in src/main.js). Writing `current.token` itself to
  // disk would leak the exact credential Flask/rpc-server trust for every
  // local-session route, since that is the same string delivered to them via
  // `childEnvSecrets`. This external credential is a distinct random value,
  // carrying ONLY the scope it's issued for (never "local-session"), so a
  // leak of the file it's written to authenticates nothing beyond that one
  // scope — Flask's raw string comparison against its own env-delivered
  // token rejects it outright.
  let currentExternal = null;

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
  function matches(cred, { token, type, scope, generation: gen }) {
    if (!cred) {
      // Still spend the same comparison work as a real credential so a
      // missing `current` vs. missing `currentExternal` isn't distinguishable
      // by timing either.
      safeEqual(token, "");
      return false;
    }
    const tokenOk = safeEqual(token, cred.token);
    const typeOk = safeEqual(type, cred.type);
    const scopeOk = cred.scopes.some((s) => safeEqual(scope, s));
    const notExpired = now() < cred.expiresAt;
    const genOk = typeof gen === "number" ? gen === cred.generation : true;
    return tokenOk && typeOk && scopeOk && notExpired && genOk;
  }

  // Checked against BOTH the session credential and the external credential
  // (if any) — both branches always evaluated, so which one (if either)
  // matched is not observable from timing.
  function validate(opts = {}) {
    const sessionOk = matches(current, opts);
    const externalOk = matches(currentExternal, opts);
    return sessionOk || externalOk;
  }

  // Scope-aware: defaults to the session credential ONLY. Wallet logout calls
  // this with no arguments (see sessionBridge.js), and must NOT kill the
  // external OpenClaw/Hermes credential — those integrations are independent
  // of wallet auth and would otherwise go dead until the user re-toggles them.
  // Pass { scope: "external" } or { scope: "all" } for the rare caller that
  // actually needs to drop the external credential too.
  function invalidate({ scope = "session" } = {}) {
    if (scope !== "session" && scope !== "external" && scope !== "all") {
      throw new Error('invalidate scope must be "session", "external", or "all"');
    }
    if (scope === "session" || scope === "all") {
      current = null;
    }
    if (scope === "external" || scope === "all") {
      currentExternal = null;
    }
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

  function getMediaSigningSecret() {
    return mediaSigningSecret;
  }

  // Mint (or re-mint, on rotation) the external credential — a fresh random
  // value scoped to exactly `scope`, unrelated to the session token. This is
  // the ONLY credential this registry considers safe for a caller to persist
  // outside process memory (see `currentExternal` above). Re-issuing replaces
  // the old value outright, so a prior copy already written to disk stops
  // working the moment the caller refreshes that file with the new token —
  // mirroring how `issue()` retires the previous session generation.
  function issueExternalCredential(scope) {
    if (typeof scope !== "string" || !scope) {
      throw new Error("issueExternalCredential requires a non-empty scope string");
    }
    const issuedAt = now();
    currentExternal = {
      token: toHex(rng(SECRET_BYTES)),
      type: "local-session",
      scopes: [scope],
      issuedAt,
      expiresAt: issuedAt + lifetimeMs,
      generation: null, // not part of the session generation lineage
    };
    return currentExternal.token;
  }

  // Only ever return an external credential this registry still considers
  // valid — same expiry mirroring as getSessionCredential().
  function getExternalCredential() {
    if (!currentExternal) return null;
    if (now() >= currentExternal.expiresAt) return null;
    return currentExternal.token;
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
    getMediaSigningSecret,
    issueExternalCredential,
    getExternalCredential,
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
  if (flask) {
    env[CREDENTIAL_ENV.FLASK_SIGNING] = registry.getFlaskSigningSecret();
    env[CREDENTIAL_ENV.MEDIA_SIGNING] = registry.getMediaSigningSecret();
  }
  return env;
}
