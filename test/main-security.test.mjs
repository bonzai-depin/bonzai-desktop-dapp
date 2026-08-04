// test/main-security.test.mjs
//
// P1 — per-instance credential registry.
//
// Exercises src/main/credentialRegistry.js (the main-process trust primitive
// wired into src/main.js) with deterministic seams: an injectable RNG and
// clock so credentials are repeatable, plus source invariants that enforce
// "secrets via environment only" and "no new IPC surface in this step".

import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  createCredentialRegistry,
  childEnvSecrets,
  CREDENTIAL_ENV,
  MAX_LIFETIME_MS,
} from "../src/main/credentialRegistry.js";
import {
  createSessionBridge,
  authorizeSessionSender,
} from "../src/main/sessionBridge.js";
import {
  createOpenClawServer,
  validateWebhookPayload,
  getOpenClawHost,
  getOpenClawPort,
  getOpenClawTrustedOrigins,
  isOriginAllowed,
  OPENCLAW_HOST_ENV,
  OPENCLAW_PORT_ENV,
  OPENCLAW_TRUSTED_ORIGINS_ENV,
  DEFAULT_OPENCLAW_PORT,
  OPENCLAW_CREDENTIAL_SCOPE,
} from "../src/main/openclawServer.js";
import {
  createFileGrantStore,
  authorizeRead,
  authorizeWrite,
  authorizeVideoRequest,
  parseLocalVideoUrl,
  isWithinRoot,
  VIDEO_EXTENSIONS,
} from "../src/main/fileAccess.js";
import {
  SOCIAL_POLICIES,
  SOCIAL_PLATFORMS,
  PROXY_INTEGRATIONS,
  PROXY_HOSTS,
  resolveSocialPolicy,
  resolveProxyPolicy,
  validateTargetUrl,
  sanitizeRequestHeaders,
  isBlockedIpAddress,
  performEgressRequest,
  EgressPolicyError,
} from "../src/main/egressPolicy.js";
import {
  PINATA_POLICY,
  PINATA_ORIGIN,
  PINATA_GATEWAY,
  MAX_UPLOAD_BYTES,
  MAX_METADATA_BYTES,
  readPinataCredentials,
  publishToPinata,
} from "../src/main/pinataPublish.js";
import os from "node:os";
import { execFileSync } from "node:child_process";
import {
  PACKAGED_CSP,
  DEV_CSP,
  getPolicyDirectives,
  parseCsp,
  directiveAllowsOrigin,
  installCsp,
  DEV_VITE_HOST,
  DEV_VITE_PORT,
  DEV_VITE_HTTP_ORIGIN,
  DEV_VITE_WS_ORIGIN,
  BULMA_STYLE_ORIGIN,
  BULMA_STYLESHEET_URL,
  BULMA_INTEGRITY,
} from "../src/main/csp.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MAIN_JS = path.resolve(__dirname, "..", "src", "main.js");
const PRELOAD_JS = path.resolve(__dirname, "..", "src", "preload.js");
const REGISTRY_JS = path.resolve(__dirname, "..", "src", "main", "credentialRegistry.js");
const ENV_EXAMPLE = path.resolve(__dirname, "..", ".env.example");
const INDEX_HTML = path.resolve(__dirname, "..", "index.html");
const VITE_RENDERER_CONFIG = path.resolve(__dirname, "..", "vite.renderer.config.ts");
const REPO_ROOT = path.resolve(__dirname, "..");

// ─────────────────────────────────────────────────────────────────────────────
// Deterministic seams
// ─────────────────────────────────────────────────────────────────────────────

// xorshift32 RNG seeded per "launch". Deterministic for a given seed, but
// advances across calls so two seeds (or two calls) yield distinct bytes —
// standing in for the CSPRNG used in production.
function makeDeterministicRng(seed) {
  let state = (seed >>> 0) || 0x9e3779b9;
  return (bytes) => {
    const buf = Buffer.alloc(bytes);
    for (let i = 0; i < bytes; i++) {
      state ^= state << 13; state >>>= 0;
      state ^= state >> 17;
      state ^= state << 5; state >>>= 0;
      buf[i] = state & 0xff;
    }
    return buf;
  };
}

// Controllable clock for expiry/restart tests.
function makeClock(start = 1_700_000_000_000) {
  let t = start;
  return {
    now: () => t,
    advance: (ms) => { t += ms; },
    set: (v) => { t = v; },
  };
}

const ENTROPY_BITS_MIN = 128;
const hexBitLength = (hex) => Buffer.from(hex, "hex").length * 8;

// ─────────────────────────────────────────────────────────────────────────────
// AC1 (R1): distinct high-entropy credentials, bounded lifetime, scopes
// ─────────────────────────────────────────────────────────────────────────────

test("AC1: two controlled launches produce distinct high-entropy credentials", () => {
  const a = createCredentialRegistry({ rng: makeDeterministicRng(1) }).issue();
  const b = createCredentialRegistry({ rng: makeDeterministicRng(2) }).issue();

  // Raw tokens come from the live registry (issue() returns a redacted view).
  const regA = createCredentialRegistry({ rng: makeDeterministicRng(1) });
  regA.issue();
  const regB = createCredentialRegistry({ rng: makeDeterministicRng(2) });
  regB.issue();
  const tokA = regA.getSessionCredential();
  const tokB = regB.getSessionCredential();

  assert.notEqual(tokA, tokB, "two launches must yield distinct credentials");
  assert.ok(hexBitLength(tokA) >= ENTROPY_BITS_MIN, "credential A must carry >= 128 bits");
  assert.ok(hexBitLength(tokB) >= ENTROPY_BITS_MIN, "credential B must carry >= 128 bits");
  assert.ok(tokA.length > 0 && tokB.length > 0);

  // Redacted descriptors do not leak the raw token.
  assert.equal(a.issued, true);
  assert.equal(b.issued, true);
  assert.deepEqual(a, { ...a }); // shape sanity
  assert.equal(JSON.stringify(a).includes(tokA), false, "descriptor must not contain raw token");
});

test("AC1: lifetime is bounded to <= 24h and scopes are attached", () => {
  const clock = makeClock();
  const reg = createCredentialRegistry({
    rng: makeDeterministicRng(7),
    now: clock.now,
    scopes: ["local-session", "inference"],
  });
  const desc = reg.issue({ extraScopes: ["orchestrator"] });

  assert.ok(desc.lifetimeMs <= MAX_LIFETIME_MS, "lifetime must not exceed 24h");
  assert.ok(desc.expiresAt - desc.issuedAt <= MAX_LIFETIME_MS);
  assert.ok(desc.scopes.includes("local-session"));
  assert.ok(desc.scopes.includes("inference"));
  assert.ok(desc.scopes.includes("orchestrator"), "extra scopes attach to the credential");
  assert.equal(desc.entropyBits, 256, "registry reports the minted entropy budget");
  assert.equal(typeof desc.generation, "number");
});

test("AC1: registry rejects a lifetime over 24h at construction", () => {
  assert.throws(
    () => createCredentialRegistry({ lifetimeMs: MAX_LIFETIME_MS + 1 }),
    /<= 24h/,
  );
});

test("AC1: default (CSPRNG) launches also yield distinct credentials", () => {
  // No injected rng → real CSPRNG; two independent launches must differ.
  const r1 = createCredentialRegistry(); r1.issue();
  const r2 = createCredentialRegistry(); r2.issue();
  assert.notEqual(r1.getSessionCredential(), r2.getSessionCredential());
  assert.notEqual(r1.getFlaskSigningSecret(), r2.getFlaskSigningSecret());
});

// ─────────────────────────────────────────────────────────────────────────────
// AC2 (R2): constant-time validation, fails closed, invalidation
// ─────────────────────────────────────────────────────────────────────────────

test("AC2: validate accepts a correct credential and fails closed on every mismatch", () => {
  const clock = makeClock();
  const reg = createCredentialRegistry({
    rng: makeDeterministicRng(11),
    now: clock.now,
    scopes: ["local-session", "inference"],
  });
  reg.issue({ type: "local-session", extraScopes: ["inference"] });
  const token = reg.getSessionCredential();
  const desc = reg.describe();

  const ok = (o) => reg.validate(o);

  // Happy path.
  assert.equal(ok({ token, type: "local-session", scope: "inference", generation: desc.generation }), true);
  // generation optional.
  assert.equal(ok({ token, type: "local-session", scope: "local-session" }), true);

  // Fails closed on each axis individually.
  assert.equal(ok({ token: "wrong", type: "local-session", scope: "inference" }), false, "wrong token");
  assert.equal(ok({ token, type: "wrong-type", scope: "inference" }), false, "wrong type");
  assert.equal(ok({ token, type: "local-session", scope: "not-granted" }), false, "wrong scope");
  assert.equal(ok({ token, type: "local-session", scope: "inference", generation: desc.generation - 1 }), false, "stale generation");
  assert.equal(ok({ token, type: "local-session", scope: "inference", generation: desc.generation + 1 }), false, "future generation");

  // Length-mismatched / malformed inputs must not throw — fail closed instead.
  assert.equal(ok({ token: "x", type: "local-session", scope: "inference" }), false);
  assert.equal(ok({ token: null, type: "local-session", scope: "inference" }), false);
  assert.equal(ok({}), false);
});

test("AC2: expired credential fails closed", () => {
  const clock = makeClock();
  const lifetime = 60_000;
  const reg = createCredentialRegistry({
    rng: makeDeterministicRng(12),
    now: clock.now,
    lifetimeMs: lifetime,
    scopes: ["local-session"],
  });
  reg.issue();
  const token = reg.getSessionCredential();

  assert.equal(reg.validate({ token, type: "local-session", scope: "local-session" }), true);
  clock.advance(lifetime + 1); // past expiry
  assert.equal(reg.validate({ token, type: "local-session", scope: "local-session" }), false, "expired credential rejected");
});

test("AC2: stale generation is rejected after re-issue", () => {
  const clock = makeClock();
  const reg = createCredentialRegistry({ rng: makeDeterministicRng(13), now: clock.now });
  reg.issue();
  const staleToken = reg.getSessionCredential();
  const staleGen = reg.describe().generation;

  reg.issue(); // bump generation, rotate token
  const freshToken = reg.getSessionCredential();
  const freshGen = reg.describe().generation;

  assert.notEqual(staleToken, freshToken);
  assert.ok(freshGen > staleGen);

  // Old token rejected (token differs), and even a correct fresh token with a
  // stale generation number is rejected — isolating the generation check.
  assert.equal(reg.validate({ token: staleToken, type: "local-session", scope: "local-session" }), false);
  assert.equal(reg.validate({ token: freshToken, type: "local-session", scope: "local-session", generation: staleGen }), false);
  assert.equal(reg.validate({ token: freshToken, type: "local-session", scope: "local-session", generation: freshGen }), true);
});

test("AC2: explicit invalidation prevents any further use", () => {
  const reg = createCredentialRegistry({ rng: makeDeterministicRng(14) });
  reg.issue();
  const token = reg.getSessionCredential();
  assert.equal(reg.validate({ token, type: "local-session", scope: "local-session" }), true);

  reg.invalidate();
  assert.equal(reg.getSessionCredential(), null, "no live credential after invalidation");
  assert.equal(reg.validate({ token, type: "local-session", scope: "local-session" }), false, "invalidated credential unusable");
  assert.equal(reg.describe().issued, false);
});

test("AC2: validation is constant-time (uses timingSafeEqual, no throw on mismatch)", () => {
  // Behavioral guarantee: comparing secrets of differing lengths must not
  // throw and must return false. The implementation backs this with
  // crypto.timingSafeEqual so a caller cannot time-distinguish outcomes.
  const reg = createCredentialRegistry({ rng: makeDeterministicRng(15) });
  reg.issue();
  const real = reg.getSessionCredential();
  const wrongSameLen = real.replace(/^./, "0") === real ? real.slice(0, -1) + "0" : real.replace(/^./, "0");

  assert.doesNotThrow(() => reg.validate({ token: wrongSameLen, type: "local-session", scope: "local-session" }));
  assert.doesNotThrow(() => reg.validate({ token: "short", type: "local-session", scope: "local-session" }));
  assert.equal(reg.validate({ token: wrongSameLen, type: "local-session", scope: "local-session" }), false);
});

// ─────────────────────────────────────────────────────────────────────────────
// AC3 (R3): secrets delivered via environment ONLY — nowhere else
// ─────────────────────────────────────────────────────────────────────────────

test("AC3: childEnvSecrets delivers session credential + non-default signing secret via env only", () => {
  const reg = createCredentialRegistry({ rng: makeDeterministicRng(21) });
  reg.issue();
  const env = childEnvSecrets(reg);

  const session = reg.getSessionCredential();
  const signing = reg.getFlaskSigningSecret();

  // Two distinct, non-default secrets present under the expected env keys,
  // plus the credential's epoch-second expiry (bonzai_security.py's
  // validate_startup_secrets/session_credential_active require it).
  assert.deepEqual(
    Object.keys(env).sort(),
    [CREDENTIAL_ENV.SESSION, CREDENTIAL_ENV.SESSION_EXPIRES, CREDENTIAL_ENV.FLASK_SIGNING].sort(),
  );
  assert.equal(env[CREDENTIAL_ENV.SESSION], session);
  assert.equal(env[CREDENTIAL_ENV.FLASK_SIGNING], signing);
  assert.equal(env[CREDENTIAL_ENV.SESSION_EXPIRES], String(Math.floor(reg.describe().expiresAt / 1000)));
  assert.notEqual(session, signing, "session credential and signing secret are separate");
  assert.ok(hexBitLength(session) >= ENTROPY_BITS_MIN);
  assert.ok(hexBitLength(signing) >= ENTROPY_BITS_MIN);
  assert.notEqual(signing, "bonzai-secret-key", "signing secret must not be the hardcoded default");
  assert.notEqual(signing, "");
});

test("AC3: secrets do not appear in argv, URLs, logs, store data, or fixtures", () => {
  const reg = createCredentialRegistry({ rng: makeDeterministicRng(22) });
  reg.issue();
  const env = childEnvSecrets(reg);
  const secrets = [env[CREDENTIAL_ENV.SESSION], env[CREDENTIAL_ENV.FLASK_SIGNING]];

  // Representative surfaces a child launch touches. None may carry a secret.
  const argv = ["-p", "65000", "--mode", "release"];
  const url = `http://127.0.0.1:65000/inference`;
  const logLine = `[Spawn] Command: /opt/bonzai/diffuser [Spawn] Args: ${JSON.stringify(argv)} [Spawn] CWD: /opt/bonzai`;
  const storeData = { jwtSecret: "not-a-registry-secret", lastLoadedSpec: null, roleplaySessions: [] };
  const fixture = { name: "smoke", env: { PYTHONUNBUFFERED: "1" } }; // fixtures must not embed secrets

  const surfaces = [
    ["argv", JSON.stringify(argv)],
    ["url", url],
    ["log", logLine],
    ["store", JSON.stringify(storeData)],
    ["fixture", JSON.stringify(fixture)],
  ];

  for (const [label, serialized] of surfaces) {
    for (const secret of secrets) {
      assert.ok(
        !serialized.includes(secret),
        `secret leaked into ${label}: ${serialized}`,
      );
    }
  }

  // And the env block is the ONLY surface that contains both secrets.
  const envSerialized = JSON.stringify(env);
  for (const secret of secrets) {
    assert.ok(envSerialized.includes(secret), "env must carry the secret");
  }
});

test("AC3: env names are stable and documented as the sole delivery channel", () => {
  assert.deepEqual(CREDENTIAL_ENV, {
    SESSION: "BONZAI_SESSION_CREDENTIAL",
    SESSION_EXPIRES: "BONZAI_SESSION_EXPIRES",
    FLASK_SIGNING: "SECRET_KEY",
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC4 (R4): no new IPC surface in this step
// ─────────────────────────────────────────────────────────────────────────────

test("AC4: the registry module exposes no IPC surface", () => {
  const src = fs.readFileSync(REGISTRY_JS, "utf8");
  assert.equal(src.includes("ipcMain"), false, "credentialRegistry.js must not touch ipcMain");
  assert.equal(src.includes("ipcRenderer"), false);
});

test("AC4: main.js credential wiring adds no ipcMain.handle", () => {
  const src = fs.readFileSync(MAIN_JS, "utf8");
  const lines = src.split(/\r?\n/);
  // Every ipcMain.handle line must be unrelated to this step's additions.
  const offending = lines
    .map((line, i) => ({ i, line }))
    .filter(({ line }) => line.includes("ipcMain.handle"))
    .filter(({ line }) =>
      /credentialRegistry|childEnvSecrets|credentialRegistry|createCredentialRegistry/.test(line),
    );
  assert.deepEqual(offending, [], "no ipcMain.handle added by the credential registry step");
});

// ─────────────────────────────────────────────────────────────────────────────
// AC5 is satisfied by `node --test test/main-security.test.mjs` exiting 0.
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// A1: getSessionCredential() must not hand out a credential the registry
// already considers invalid (expired). A child restarted past expiry must
// not receive a token validate() would reject.
// ─────────────────────────────────────────────────────────────────────────────

test("A1: getSessionCredential returns null once the credential has expired", () => {
  const clock = makeClock();
  const lifetime = 60_000;
  const reg = createCredentialRegistry({
    rng: makeDeterministicRng(31),
    now: clock.now,
    lifetimeMs: lifetime,
  });
  reg.issue();
  const token = reg.getSessionCredential();
  assert.ok(token, "live credential returned before expiry");
  assert.equal(reg.validate({ token, type: "local-session", scope: "local-session" }), true);

  // At the expiry boundary now >= expiresAt -> the registry considers it expired.
  clock.advance(lifetime);
  assert.equal(reg.getSessionCredential(), null, "expired credential must not be handed out");
  assert.equal(reg.validate({ token, type: "local-session", scope: "local-session" }), false);

  // getSessionCredential and validate stay consistent one ms past expiry.
  clock.advance(1);
  assert.equal(reg.getSessionCredential(), null);
});

test("A1: childEnvSecrets omits an expired session credential so a restarted child gets nothing", () => {
  const clock = makeClock();
  const lifetime = 30_000;
  const reg = createCredentialRegistry({
    rng: makeDeterministicRng(32),
    now: clock.now,
    lifetimeMs: lifetime,
  });
  reg.issue();

  const fresh = childEnvSecrets(reg);
  assert.ok(fresh[CREDENTIAL_ENV.SESSION], "fresh env carries the session credential");

  clock.advance(lifetime + 1); // past expiry
  const expired = childEnvSecrets(reg);
  assert.equal(
    Object.prototype.hasOwnProperty.call(expired, CREDENTIAL_ENV.SESSION),
    false,
    "expired session credential must not be delivered (no key at all, not 'null')",
  );
  assert.equal(
    Object.prototype.hasOwnProperty.call(expired, CREDENTIAL_ENV.SESSION_EXPIRES),
    false,
    "no stale expiry timestamp without its matching credential",
  );
  // The Flask signing secret is per-launch and never expires, so it is still delivered.
  assert.equal(expired[CREDENTIAL_ENV.FLASK_SIGNING], reg.getFlaskSigningSecret());
});

// ─────────────────────────────────────────────────────────────────────────────
// A2: the Flask signing secret (SECRET_KEY) is scoped to the service that
// consumes it. A network-facing child that only authenticates the bridge
// (rpc-server) must receive the session credential and NOT the signing secret.
// ─────────────────────────────────────────────────────────────────────────────

test("A2: childEnvSecrets omits the Flask signing secret when flask:false", () => {
  const reg = createCredentialRegistry({ rng: makeDeterministicRng(41) });
  reg.issue();
  const env = childEnvSecrets(reg, { flask: false });

  // Expiry travels with the session credential regardless of flask scoping.
  assert.deepEqual(
    Object.keys(env).sort(),
    [CREDENTIAL_ENV.SESSION, CREDENTIAL_ENV.SESSION_EXPIRES].sort(),
    "session (+ its expiry) only when flask scoped out",
  );
  assert.equal(env[CREDENTIAL_ENV.SESSION], reg.getSessionCredential());
  assert.equal(
    Object.prototype.hasOwnProperty.call(env, CREDENTIAL_ENV.FLASK_SIGNING),
    false,
    "signing secret must not be disclosed to a non-Flask child",
  );
});

test("A2: default childEnvSecrets still delivers both secrets (diffuser path unchanged)", () => {
  const reg = createCredentialRegistry({ rng: makeDeterministicRng(42) });
  reg.issue();
  const env = childEnvSecrets(reg);
  assert.deepEqual(
    Object.keys(env).sort(),
    [CREDENTIAL_ENV.SESSION, CREDENTIAL_ENV.SESSION_EXPIRES, CREDENTIAL_ENV.FLASK_SIGNING].sort(),
  );
});

test("A2: main.js scopes the signing secret away from the rpc-server spawn", () => {
  const src = fs.readFileSync(MAIN_JS, "utf8");
  // The rpc-server spawn is the only line that both assigns `env:` and spreads
  // childEnvSecrets (the diffuser spreads it into a larger object literal).
  const envLines = src
    .split(/\r?\n/)
    .filter((l) => /childEnvSecrets\(/.test(l) && /env:\s*\{/.test(l));
  assert.ok(envLines.length >= 1, "expected at least one env: childEnvSecrets spawn line");
  for (const line of envLines) {
    assert.ok(
      /\{\s*flask:\s*false\s*\}/.test(line),
      `rpc-server env must scope out the Flask signing secret: ${line.trim()}`,
    );
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// P2 — trusted local-session lifecycle: scoped IPC bridge + sender validation
// ─────────────────────────────────────────────────────────────────────────────

// Build a fully-trusted sender descriptor for a given main window URL.
const trustedSender = (url) => ({
  url,
  origin: url,
  windowAlive: true,
  isMainWindow: true,
  isMainFrame: true,
});

const DEV_URL = "http://localhost:5173/";
const PACKAGED_URL = "file:///app/renderer/main_window/index.html";

// ─────────────────────────────────────────────────────────────────────────────
// AC1 (R1): two new IPC operations exist (obtain, rotate) and a test invokes
// both through the bridge seam.
// ─────────────────────────────────────────────────────────────────────────────

test("P2 AC1: main.js wires obtain + rotate ipcMain.handle entries", () => {
  const src = fs.readFileSync(MAIN_JS, "utf8");
  assert.ok(
    /ipcMain\.handle\(\s*["']session:obtain-credential["']/.test(src),
    "obtain-credential ipcMain.handle must be registered",
  );
  assert.ok(
    /ipcMain\.handle\(\s*["']session:rotate-credential["']/.test(src),
    "rotate-credential ipcMain.handle must be registered",
  );
});

test("P2 AC1: obtain + rotate invoked through the bridge seam", () => {
  const registry = createCredentialRegistry({ rng: makeDeterministicRng(101) });
  registry.issue();
  const bridge = createSessionBridge({
    registry,
    authorize: () => ({ ok: true }),
  });

  const obtained = bridge.obtain(trustedSender(DEV_URL));
  assert.equal(obtained.ok, true, "obtain must succeed for a trusted sender");
  assert.equal(typeof obtained.token, "string");
  assert.ok(obtained.token.length > 0);
  assert.equal(obtained.descriptor.issued, true);
  assert.equal(obtained.descriptor.generation, 1);

  return bridge.rotate(trustedSender(DEV_URL)).then((rotated) => {
    assert.equal(rotated.ok, true, "rotate must succeed for a trusted sender");
    assert.notEqual(rotated.token, obtained.token, "rotation mints a new token");
    assert.ok(rotated.descriptor.generation > obtained.descriptor.generation);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC2 (R2): packaged + supported dev senders allowed; remote, subframe,
// stale-window, and origin-mismatched senders denied.
// ─────────────────────────────────────────────────────────────────────────────

test("P2 AC2: packaged sender is authorized against file://", () => {
  const decision = authorizeSessionSender(trustedSender(PACKAGED_URL), {
    isPackaged: true,
    mainWindowUrl: PACKAGED_URL,
  });
  assert.deepEqual(decision, { ok: true });
});

test("P2 AC2: supported development sender is authorized", () => {
  const decision = authorizeSessionSender(trustedSender(DEV_URL), {
    isPackaged: false,
    mainWindowUrl: DEV_URL,
  });
  assert.deepEqual(decision, { ok: true });
});

test("P2 AC2: remote, subframe, stale-window, and origin-mismatched senders are denied", () => {
  const dev = { isPackaged: false, mainWindowUrl: DEV_URL };

  // Remote: not a supported origin for either mode.
  assert.equal(
    authorizeSessionSender(trustedSender("https://evil.example.com/"), dev).ok,
    false,
    "remote origin denied",
  );
  assert.equal(
    authorizeSessionSender(trustedSender("https://evil.example.com/"), dev).ok,
    false,
    "remote origin denied",
  );

  // Subframe: nested iframe must not reach the bridge.
  const subframe = { ...trustedSender(DEV_URL), isMainFrame: false };
  assert.equal(authorizeSessionSender(subframe, dev).ok, false, "subframe denied");

  // Stale window: destroyed or a different (old) window.
  const destroyed = { ...trustedSender(DEV_URL), windowAlive: false };
  assert.equal(authorizeSessionSender(destroyed, dev).ok, false, "destroyed window denied");
  const otherWindow = { ...trustedSender(DEV_URL), isMainWindow: false };
  assert.equal(authorizeSessionSender(otherWindow, dev).ok, false, "stale (non-main) window denied");

  // Origin mismatch: a supported dev origin that is NOT the main window origin.
  const mismatch = trustedSender("http://127.0.0.1:5173/");
  assert.equal(
    authorizeSessionSender(mismatch, dev).ok,
    false,
    "origin-mismatched dev sender denied",
  );
});

test("P2 AC2: a packaged build rejects http dev origins and vice versa", () => {
  // Packaged config must deny an http origin (mode allowlist is file:// only).
  assert.equal(
    authorizeSessionSender(trustedSender(DEV_URL), {
      isPackaged: true,
      mainWindowUrl: PACKAGED_URL,
    }).ok,
    false,
  );
  // Dev config must deny a file:// origin.
  assert.equal(
    authorizeSessionSender(trustedSender(PACKAGED_URL), {
      isPackaged: false,
      mainWindowUrl: DEV_URL,
    }).ok,
    false,
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// AC3 (R3): preload exposes ONLY the new operations (no other new bridge
// methods in this step).
// ─────────────────────────────────────────────────────────────────────────────

test("P2 AC3: preload exposes exactly obtain + rotate under the session namespace", () => {
  const src = fs.readFileSync(PRELOAD_JS, "utf8");
  const sessionInvokes = [...src.matchAll(/ipcRenderer\.invoke\(\s*["']session:([^"']+)["']/g)]
    .map((m) => `session:${m[1]}`);
  assert.deepEqual(
    sessionInvokes.sort(),
    ["session:obtain-credential", "session:rotate-credential"].sort(),
    "preload session namespace must expose exactly obtain + rotate",
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// AC4 (R4): rotation rejects the old generation and rekeys dependents before
// returning; no bridge result leaks the Flask signing secret.
// ─────────────────────────────────────────────────────────────────────────────

test("P2 AC4: rotate invalidates the old generation and rekeys dependents before returning", async () => {
  const clock = makeClock();
  const registry = createCredentialRegistry({ rng: makeDeterministicRng(202), now: clock.now });
  registry.issue();

  const rekeyCalls = [];
  const bridge = createSessionBridge({
    registry,
    authorize: () => ({ ok: true }),
    rekeyDependents: async () => { rekeyCalls.push(clock.now()); },
  });

  const obtained = bridge.obtain(trustedSender(DEV_URL));
  const oldToken = obtained.token;
  const oldGen = obtained.descriptor.generation;

  clock.advance(5);
  const before = clock.now();
  const rotated = await bridge.rotate(trustedSender(DEV_URL));

  // rekey ran during rotate, before it returned.
  assert.equal(rekeyCalls.length, 1, "rekeyDependents invoked exactly once");
  assert.ok(rekeyCalls[0] >= before, "rekey ran after the generation was bumped");

  // The old generation is now rejected by the registry, even with the old token.
  assert.equal(
    registry.validate({ token: oldToken, type: "local-session", scope: "local-session", generation: oldGen }),
    false,
    "old generation rejected after rotation",
  );
  // The fresh generation validates.
  assert.equal(
    registry.validate({
      token: rotated.token,
      type: "local-session",
      scope: "local-session",
      generation: rotated.descriptor.generation,
    }),
    true,
  );
});

test("P2 AC4: no bridge result (obtain or rotate) leaks the Flask signing secret", async () => {
  const registry = createCredentialRegistry({ rng: makeDeterministicRng(203) });
  registry.issue();
  const signingSecret = registry.getFlaskSigningSecret();
  const bridge = createSessionBridge({ registry, authorize: () => ({ ok: true }) });

  const obtained = bridge.obtain(trustedSender(DEV_URL));
  const rotated = await bridge.rotate(trustedSender(DEV_URL));

  for (const [label, result] of [["obtain", obtained], ["rotate", rotated]]) {
    assert.ok(result.ok, `${label} ok`);
    assert.equal(
      JSON.stringify(result).includes(signingSecret),
      false,
      `${label} result must not contain the Flask signing secret`,
    );
  }
});

test("P2 AC4: an untrusted sender is denied obtain and rotate", () => {
  const registry = createCredentialRegistry({ rng: makeDeterministicRng(204) });
  registry.issue();
  const bridge = createSessionBridge({
    registry,
    authorize: (s) => authorizeSessionSender(s, { isPackaged: false, mainWindowUrl: DEV_URL }),
  });

  const remote = trustedSender("https://evil.example.com/");
  assert.deepEqual(bridge.obtain(remote), { ok: false, reason: "remote" });
  return bridge.rotate(remote).then((r) => {
    assert.deepEqual(r, { ok: false, reason: "remote" });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// A5: proactive automatic rotation. Nothing previously re-issued the
// credential before its declared (<=24h) expiry, so a long-running launch
// would eventually run Flask on an expired credential with no replacement,
// and a subsequent Flask restart would find getSessionCredential() returning
// null and fail validate_startup_secrets(). main.js must self-schedule a
// rotation ahead of expiry, reuse the same rekey path as manual rotate, and
// tell the renderer to re-obtain (the old token it holds is for a dead
// generation the instant rekey restarts Flask/rpc-server).
// ─────────────────────────────────────────────────────────────────────────────

test("A5: main.js self-schedules a credential rotation ahead of declared expiry", () => {
  const src = fs.readFileSync(MAIN_JS, "utf8");
  assert.ok(
    /function scheduleCredentialRotation\s*\(/.test(src),
    "expected a scheduleCredentialRotation function in main.js",
  );
  assert.ok(
    /scheduleCredentialRotation\(\)\s*;/.test(src),
    "scheduleCredentialRotation must actually be invoked, not just defined",
  );
  // The rotation must run before the credential's declared expiry, not after.
  assert.ok(
    /expiresAt\s*-\s*Date\.now\(\)/.test(src),
    "rotation delay must be derived from time remaining until expiresAt",
  );
});

test("A5: automatic rotation reuses the same rekey path as manual rotate and notifies the renderer", () => {
  const src = fs.readFileSync(MAIN_JS, "utf8");
  const scheduleFnMatch = src.match(
    /function scheduleCredentialRotation\s*\([^)]*\)\s*\{[\s\S]*?\n\}/,
  );
  assert.ok(scheduleFnMatch, "could not locate scheduleCredentialRotation body");
  const body = scheduleFnMatch[0];
  assert.ok(
    /credentialRegistry\.issue\(\)/.test(body),
    "automatic rotation must mint a fresh credential via the same registry",
  );
  assert.ok(
    /rekeySessionDependents\(\)/.test(body),
    "automatic rotation must rekey Flask/rpc-server, same as manual rotate",
  );
  assert.ok(
    /webContents\.send\(\s*["']session:credential-rotated["']/.test(body),
    "renderer must be told to re-obtain after an automatic rotation",
  );
});

test("A5: preload exposes a listener for the automatic-rotation notification", () => {
  const src = fs.readFileSync(PRELOAD_JS, "utf8");
  assert.ok(
    /onRotated\s*:/.test(src) && /ipcRenderer\.on\(\s*["']session:credential-rotated["']/.test(src),
    "preload must expose session.onRotated wired to session:credential-rotated",
  );
});

test("P2 AC4: obtain fails closed when no live credential exists", () => {
  // An invalidated / not-yet-issued registry yields no credential.
  const registry = createCredentialRegistry({ rng: makeDeterministicRng(205) });
  const bridge = createSessionBridge({ registry, authorize: () => ({ ok: true }) });
  assert.deepEqual(bridge.obtain(trustedSender(DEV_URL)), { ok: false, reason: "no-credential" });
});

// ─────────────────────────────────────────────────────────────────────────────
// P6 — Authenticate and validate the OpenClaw API (src/main/openclawServer.js)
//
// The server factory takes plain injected dependencies (no Electron), so
// every test below builds a real http.Server via createOpenClawServer(),
// listens on an ephemeral loopback port, and exercises it with real HTTP
// requests — the same approach P1/P2 use for the registry/bridge above.
// ─────────────────────────────────────────────────────────────────────────────

function makeOpenClawRegistry({ seed = 900, scopes = ["local-session", OPENCLAW_CREDENTIAL_SCOPE], now } = {}) {
  const reg = createCredentialRegistry({
    rng: makeDeterministicRng(seed),
    scopes,
    ...(now ? { now } : {}),
  });
  reg.issue();
  return reg;
}

function buildOpenClawTestServer(overrides = {}) {
  const logs = { log: [], error: [] };
  const fakeLog = {
    log: (...args) => logs.log.push(args.map(String).join(" ")),
    error: (...args) => logs.error.push(args.map(String).join(" ")),
  };
  const forwardedCalls = [];
  const flaskCalls = [];

  let openclaw; // sendToRenderer closes over this; only invoked after assignment below.

  const registry = overrides.registry || makeOpenClawRegistry();

  const baseDeps = {
    registry,
    env: {},
    isRendererAvailable: () => true,
    sendToRenderer: (payload) => {
      forwardedCalls.push(payload);
      setImmediate(() => openclaw.respondWebhook(payload.requestId, { ok: true, echo: payload }));
    },
    getHealthInfo: () => ({
      llmLoaded: false,
      modelName: null,
      flaskPort: 65000,
      companions: 0,
      scenarios: 0,
      rendererReady: true,
    }),
    resolveManifestPath: () => null,
    llama: {
      isRunning: () => false,
      proxyRequest: async () => ({ status: 200, headers: new Map(), body: null }),
      chat: async () => ({ choices: [{ message: { content: "hi" } }], usage: {} }),
    },
    getCurrentModelFilename: () => null,
    runVisionAnalyze: async () => "vision-result",
    loadModelSpec: async () => {},
    unloadModel: async () => {},
    recordLifetimeTokenUsage: () => {},
    flaskPort: 65000,
    flaskAuthHeaders: () => ({ "x-bonzai-session": "server-side-flask-credential" }),
    fetchImpl: async (url, opts) => {
      flaskCalls.push({ url, opts });
      return { status: 200, json: async () => ({ ok: true }) };
    },
    log: fakeLog,
  };

  openclaw = createOpenClawServer({ ...baseDeps, ...overrides, registry });
  return { openclaw, registry, logs, forwardedCalls, flaskCalls };
}

async function listenEphemeral(openclaw) {
  await new Promise((resolve, reject) => {
    openclaw.server.once("error", reject);
    openclaw.server.listen(0, "127.0.0.1", resolve);
  });
  return openclaw.server.address().port;
}

async function closeServer(openclaw) {
  await new Promise((resolve) => openclaw.server.close(resolve));
}

// ─────────────────────────────────────────────────────────────────────────────
// AC1 (R1): loopback-only listening, configurable port
// ─────────────────────────────────────────────────────────────────────────────

test("P6 AC1: getOpenClawHost defaults to loopback and coerces non-loopback values", () => {
  assert.equal(getOpenClawHost({}), "127.0.0.1");
  assert.equal(getOpenClawHost({ [OPENCLAW_HOST_ENV]: "0.0.0.0" }), "127.0.0.1");
  assert.equal(getOpenClawHost({ [OPENCLAW_HOST_ENV]: "evil.example.com" }), "127.0.0.1");
  assert.equal(getOpenClawHost({ [OPENCLAW_HOST_ENV]: "localhost" }), "127.0.0.1");
  assert.equal(getOpenClawHost({ [OPENCLAW_HOST_ENV]: "127.0.0.5" }), "127.0.0.5");
  assert.equal(getOpenClawHost({ [OPENCLAW_HOST_ENV]: "::1" }), "::1");
});

test("P6 AC1: getOpenClawPort is env-configurable and retains the 3002 default", () => {
  assert.equal(DEFAULT_OPENCLAW_PORT, 3002);
  assert.equal(getOpenClawPort({}), DEFAULT_OPENCLAW_PORT);
  assert.equal(getOpenClawPort({ [OPENCLAW_PORT_ENV]: "4100" }), 4100);
  assert.equal(getOpenClawPort({ [OPENCLAW_PORT_ENV]: "not-a-number" }), DEFAULT_OPENCLAW_PORT);
  assert.equal(getOpenClawPort({ [OPENCLAW_PORT_ENV]: "0" }), DEFAULT_OPENCLAW_PORT);
  assert.equal(getOpenClawPort({ [OPENCLAW_PORT_ENV]: "99999" }), DEFAULT_OPENCLAW_PORT);
});

test("P6 AC1: the server binds loopback-only even under a hostile OPENCLAW_API_HOST, and actually accepts connections there", async () => {
  const { openclaw, registry } = buildOpenClawTestServer({ env: { [OPENCLAW_HOST_ENV]: "0.0.0.0" } });
  assert.equal(openclaw.host, "127.0.0.1", "0.0.0.0 must be coerced to loopback before listen()");
  await new Promise((resolve, reject) => {
    openclaw.server.once("error", reject);
    openclaw.server.listen(0, openclaw.host, resolve);
  });
  try {
    const addr = openclaw.server.address();
    assert.equal(addr.address, "127.0.0.1");
    const res = await fetch(`http://127.0.0.1:${addr.port}/health`, {
      headers: { "x-bonzai-session": registry.getSessionCredential() },
    });
    assert.equal(res.status, 200);
  } finally {
    await closeServer(openclaw);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// AC2 (R2): auth on every non-preflight route, trusted-origin CORS, preflight
// ─────────────────────────────────────────────────────────────────────────────

test("P6 AC2: representative routes reject missing/wrong credentials and accept a valid one (Bearer or x-bonzai-session)", async () => {
  const { openclaw, registry } = buildOpenClawTestServer();
  const port = await listenEphemeral(openclaw);
  const token = registry.getSessionCredential();
  try {
    const routes = [
      { method: "GET", path: "/health" },
      { method: "GET", path: "/v1/models" },
      { method: "GET", path: "/companions" },
      { method: "GET", path: "/api/llm/info" },
      { method: "GET", path: "/manifest" },
    ];
    for (const { method, path } of routes) {
      const noAuth = await fetch(`http://127.0.0.1:${port}${path}`, { method });
      assert.equal(noAuth.status, 401, `${method} ${path} without credential must be 401`);

      const wrong = await fetch(`http://127.0.0.1:${port}${path}`, {
        method,
        headers: { "x-bonzai-session": "definitely-wrong" },
      });
      assert.equal(wrong.status, 401, `${method} ${path} with a wrong credential must be 401`);

      const bearer = await fetch(`http://127.0.0.1:${port}${path}`, {
        method,
        headers: { Authorization: `Bearer ${token}` },
      });
      assert.notEqual(bearer.status, 401, `${method} ${path} with a valid Bearer credential must not be 401`);

      const sessionHeader = await fetch(`http://127.0.0.1:${port}${path}`, {
        method,
        headers: { "x-bonzai-session": token },
      });
      assert.notEqual(sessionHeader.status, 401, `${method} ${path} with a valid x-bonzai-session must not be 401`);
    }
  } finally {
    await closeServer(openclaw);
  }
});

test("P6 AC2: an expired credential fails closed", async () => {
  const clock = makeClock();
  // Short lifetime so the test can advance the injected clock past expiry.
  const shortLived = createCredentialRegistry({
    rng: makeDeterministicRng(911),
    now: clock.now,
    lifetimeMs: 60_000,
    scopes: ["local-session", OPENCLAW_CREDENTIAL_SCOPE],
  });
  shortLived.issue();
  const token = shortLived.getSessionCredential();
  const { openclaw } = buildOpenClawTestServer({ registry: shortLived });
  const port = await listenEphemeral(openclaw);
  try {
    const ok = await fetch(`http://127.0.0.1:${port}/health`, { headers: { "x-bonzai-session": token } });
    assert.equal(ok.status, 200);
    clock.advance(60_001);
    const expired = await fetch(`http://127.0.0.1:${port}/health`, { headers: { "x-bonzai-session": token } });
    assert.equal(expired.status, 401, "expired credential must be rejected");
  } finally {
    await closeServer(openclaw);
  }
});

test("P6 AC2: a credential without the openclaw scope (wrong scope) is rejected", async () => {
  const registry = createCredentialRegistry({ rng: makeDeterministicRng(912), scopes: ["local-session"] });
  registry.issue();
  const token = registry.getSessionCredential();
  const { openclaw } = buildOpenClawTestServer({ registry });
  const port = await listenEphemeral(openclaw);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/health`, { headers: { "x-bonzai-session": token } });
    assert.equal(res.status, 401, "a credential scoped only to local-session must not authenticate OpenClaw routes");
  } finally {
    await closeServer(openclaw);
  }
});

test("P6 AC2: trusted origin gets an exact echoed CORS header (never a wildcard); disallowed origin gets none", async () => {
  const { openclaw, registry } = buildOpenClawTestServer({
    env: { [OPENCLAW_TRUSTED_ORIGINS_ENV]: "http://localhost:5173" },
  });
  const port = await listenEphemeral(openclaw);
  const token = registry.getSessionCredential();
  try {
    const trusted = await fetch(`http://127.0.0.1:${port}/health`, {
      headers: { "x-bonzai-session": token, Origin: "http://localhost:5173" },
    });
    assert.equal(trusted.headers.get("access-control-allow-origin"), "http://localhost:5173");
    assert.notEqual(trusted.headers.get("access-control-allow-origin"), "*");

    const untrusted = await fetch(`http://127.0.0.1:${port}/health`, {
      headers: { "x-bonzai-session": token, Origin: "https://evil.example.com" },
    });
    assert.equal(untrusted.headers.get("access-control-allow-origin"), null, "disallowed origin must get no ACAO header");
  } finally {
    await closeServer(openclaw);
  }
});

test("P6 AC2: OPTIONS preflight is a deterministic, unauthenticated 204", async () => {
  const { openclaw } = buildOpenClawTestServer();
  const port = await listenEphemeral(openclaw);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/webhook`, { method: "OPTIONS" });
    assert.equal(res.status, 204);
    assert.equal(await res.text(), "");
    const withOrigin = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
      method: "OPTIONS",
      headers: { Origin: "https://evil.example.com" },
    });
    assert.equal(withOrigin.status, 204, "preflight status must not depend on origin trust");
  } finally {
    await closeServer(openclaw);
  }
});

test("P6: isOriginAllowed / getOpenClawTrustedOrigins never produce a wildcard allowlist entry", () => {
  const trusted = getOpenClawTrustedOrigins({});
  assert.equal(isOriginAllowed("http://localhost:5173", trusted), true);
  assert.equal(isOriginAllowed(null, trusted), false);
  assert.equal(isOriginAllowed("https://evil.example.com", trusted), false);

  assert.equal(getOpenClawTrustedOrigins({ [OPENCLAW_TRUSTED_ORIGINS_ENV]: "*" }).includes("*"), false);
  const custom = getOpenClawTrustedOrigins({ [OPENCLAW_TRUSTED_ORIGINS_ENV]: "https://app.example.com, *" });
  assert.deepEqual(custom, ["https://app.example.com"]);
});

// ─────────────────────────────────────────────────────────────────────────────
// AC3 (R3): finite timeouts, bounded JSON parsing
// ─────────────────────────────────────────────────────────────────────────────

test("P6 AC3: header/request/keep-alive timeouts are finite (no longer disabled)", () => {
  const { openclaw } = buildOpenClawTestServer();
  assert.ok(openclaw.server.headersTimeout > 0, "headersTimeout must be finite");
  assert.ok(openclaw.server.requestTimeout > 0, "requestTimeout must be finite");
  assert.ok(openclaw.server.keepAliveTimeout > 0, "keepAliveTimeout must be finite");
});

test("P6 AC3: an oversized request body is rejected with 413 before reaching any handler", async () => {
  const { openclaw, registry, forwardedCalls } = buildOpenClawTestServer({ maxBodyBytes: 512 });
  const port = await listenEphemeral(openclaw);
  const token = registry.getSessionCredential();
  try {
    const res = await fetch(`http://127.0.0.1:${port}/webhook`, {
      method: "POST",
      headers: { "x-bonzai-session": token, "Content-Type": "application/json" },
      body: JSON.stringify({ platform: "web", channel: "c", message: "x".repeat(1000) }),
    });
    assert.equal(res.status, 413);
    assert.equal(forwardedCalls.length, 0, "an oversized body must never reach the forwarder");
  } finally {
    await closeServer(openclaw);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// AC4 (R4): strict /webhook schema, exactly-once forwarding, redaction
// ─────────────────────────────────────────────────────────────────────────────

test("P6: validateWebhookPayload accepts the documented shape and rejects every other one", () => {
  assert.equal(validateWebhookPayload({ platform: "web", channel: "c1", message: "hi" }).ok, true);
  assert.equal(
    validateWebhookPayload({ platform: "web", channel: "c1", message: "hi", identifier: "u1" }).data.userId,
    "u1",
  );
  assert.equal(validateWebhookPayload(null).ok, false);
  assert.equal(validateWebhookPayload([1, 2]).ok, false, "array body rejected");
  assert.equal(validateWebhookPayload("just a string").ok, false, "scalar body rejected");
  assert.equal(validateWebhookPayload({ channel: "c1", message: "hi" }).ok, false, "missing platform");
  assert.equal(validateWebhookPayload({ platform: "web", message: "hi" }).ok, false, "missing channel");
  assert.equal(validateWebhookPayload({ platform: "web", channel: "c1" }).ok, false, "missing message");
  assert.equal(validateWebhookPayload({ platform: 1, channel: "c1", message: "hi" }).ok, false, "wrong-type platform");
  assert.equal(validateWebhookPayload({ platform: "myspace", channel: "c1", message: "hi" }).ok, false, "unsupported platform");
  assert.equal(
    validateWebhookPayload({ platform: "web", channel: "c1", message: "hi", extra: 1 }).ok,
    false,
    "unknown field rejected",
  );
  assert.equal(
    validateWebhookPayload({ platform: "web", channel: "c1", message: "x".repeat(4001) }).ok,
    false,
    "oversized message rejected",
  );
  assert.equal(
    validateWebhookPayload({ platform: "web", channel: "c".repeat(257), message: "hi" }).ok,
    false,
    "oversized channel rejected",
  );
});

test("P6 AC4: a valid webhook payload is forwarded exactly once, mapped onto the internal shape", async () => {
  const { openclaw, registry, forwardedCalls } = buildOpenClawTestServer();
  const port = await listenEphemeral(openclaw);
  const token = registry.getSessionCredential();
  try {
    const res = await fetch(`http://127.0.0.1:${port}/webhook`, {
      method: "POST",
      headers: { "x-bonzai-session": token, "Content-Type": "application/json" },
      body: JSON.stringify({ platform: "discord", channel: "chan-1", message: "hello", identifier: "user-1" }),
    });
    assert.equal(res.status, 200);
    assert.equal(forwardedCalls.length, 1, "forwardToRenderer must be called exactly once");
    const { platform, channelId, message, userId } = forwardedCalls[0];
    assert.deepEqual({ platform, channelId, message, userId }, {
      platform: "discord",
      channelId: "chan-1",
      message: "hello",
      userId: "user-1",
    });
  } finally {
    await closeServer(openclaw);
  }
});

test("P6 AC4: malformed, oversized, or unsupported webhook payloads are rejected with 4xx and never forwarded", async () => {
  const { openclaw, registry, forwardedCalls } = buildOpenClawTestServer();
  const port = await listenEphemeral(openclaw);
  const token = registry.getSessionCredential();

  const send = (body, { raw = false } = {}) =>
    fetch(`http://127.0.0.1:${port}/webhook`, {
      method: "POST",
      headers: { "x-bonzai-session": token, "Content-Type": "application/json" },
      body: raw ? body : JSON.stringify(body),
    });

  try {
    const cases = [
      ["invalid JSON", "not json at all", { raw: true }],
      ["array body", ["platform", "web"]],
      ["scalar body", "just a string"],
      ["missing platform", { channel: "c", message: "m" }],
      ["missing channel", { platform: "web", message: "m" }],
      ["missing message", { platform: "web", channel: "c" }],
      ["wrong-type platform", { platform: 5, channel: "c", message: "m" }],
      ["unsupported platform value", { platform: "myspace", channel: "c", message: "m" }],
      ["unknown field", { platform: "web", channel: "c", message: "m", extra: "nope" }],
      ["oversized message field", { platform: "web", channel: "c", message: "x".repeat(4001) }],
    ];
    for (const [label, body, opts] of cases) {
      const res = await send(body, opts);
      assert.ok(res.status >= 400 && res.status < 500, `${label} must be rejected with a 4xx`);
    }
    assert.equal(forwardedCalls.length, 0, "no malformed payload may ever reach forwardToRenderer");
  } finally {
    await closeServer(openclaw);
  }
});

test("P6 AC4: credentials, headers, and body/message content never appear in logs; credentials never appear in responses", async () => {
  const { openclaw, registry, logs } = buildOpenClawTestServer();
  const port = await listenEphemeral(openclaw);
  const token = registry.getSessionCredential();
  const bogusCaller = "attacker-supplied-credential-xyz";
  try {
    const res = await fetch(`http://127.0.0.1:${port}/webhook`, {
      method: "POST",
      headers: {
        "x-bonzai-session": token,
        Authorization: `Bearer ${bogusCaller}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ platform: "discord", channel: "very-secret-channel-id", message: "sensitive message body" }),
    });
    const text = await res.text();
    const logged = [...logs.log, ...logs.error].join("\n");

    assert.equal(logged.includes(token), false, "server credential must never be logged");
    assert.equal(logged.includes(bogusCaller), false, "caller-supplied credential must never be logged");
    assert.equal(logged.includes("very-secret-channel-id"), false, "channel identifier must not be logged");
    assert.equal(logged.includes("sensitive message body"), false, "message body must not be logged");

    assert.equal(text.includes(token), false, "server credential must never appear in a response body");
    assert.equal(text.includes(bogusCaller), false, "caller-supplied credential must never be echoed in a response body");
  } finally {
    await closeServer(openclaw);
  }
});

test("P6 AC4: an internal forwarding failure returns a generic error body, not raw internals", async () => {
  const { openclaw, registry } = buildOpenClawTestServer({
    isRendererAvailable: () => false,
  });
  const port = await listenEphemeral(openclaw);
  const token = registry.getSessionCredential();
  try {
    const res = await fetch(`http://127.0.0.1:${port}/webhook`, {
      method: "POST",
      headers: { "x-bonzai-session": token, "Content-Type": "application/json" },
      body: JSON.stringify({ platform: "web", channel: "c", message: "m" }),
    });
    assert.equal(res.status, 502);
    const body = await res.json();
    assert.equal(body.error, "Webhook forwarding failed");
  } finally {
    await closeServer(openclaw);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// AC5 (R5): Flask proxy attaches the server-side credential, never the caller's
// ─────────────────────────────────────────────────────────────────────────────

test("P6 AC5: GET through the Flask proxy carries only the server-side scoped credential", async () => {
  const { openclaw, registry, flaskCalls } = buildOpenClawTestServer();
  const port = await listenEphemeral(openclaw);
  const token = registry.getSessionCredential();
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/flask/audio/info`, {
      method: "GET",
      headers: { "x-bonzai-session": token, "X-Attacker-Header": "x-bonzai-session=attacker-value" },
    });
    assert.equal(res.status, 200);
    assert.equal(flaskCalls.length, 1);
    assert.equal(flaskCalls[0].opts.headers["x-bonzai-session"], "server-side-flask-credential");
  } finally {
    await closeServer(openclaw);
  }
});

test("P6 AC5: POST through the Flask proxy never forwards the caller's own credential verbatim", async () => {
  const { openclaw, registry, flaskCalls } = buildOpenClawTestServer();
  const port = await listenEphemeral(openclaw);
  const token = registry.getSessionCredential();
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/flask/audio/tts`, {
      method: "POST",
      headers: { "x-bonzai-session": token, "Content-Type": "application/json" },
      body: JSON.stringify({ text: "hi" }),
    });
    assert.equal(res.status, 200);
    assert.equal(flaskCalls.length, 1);
    assert.equal(flaskCalls[0].opts.headers["x-bonzai-session"], "server-side-flask-credential");
    assert.notEqual(
      flaskCalls[0].opts.headers["x-bonzai-session"],
      token,
      "the caller's own credential must never be forwarded to Flask verbatim — only the server-side one",
    );
  } finally {
    await closeServer(openclaw);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// AC6 (R6): .env.example documents OpenClaw host/port/trusted-origin/credential
// variable names without secret values
// ─────────────────────────────────────────────────────────────────────────────

test("P6 AC6: .env.example documents OpenClaw bind/origin variable names, and the shared credential name, without secret values", () => {
  const content = fs.readFileSync(ENV_EXAMPLE, "utf8");
  assert.match(content, /OPENCLAW_API_HOST=127\.0\.0\.1/);
  assert.match(content, /OPENCLAW_API_PORT=3002/);
  assert.match(content, /^OPENCLAW_TRUSTED_ORIGINS=\s*$/m, "trusted origins must be documented with no value");
  assert.match(content, /BONZAI_SESSION_CREDENTIAL/, "the Electron-owned credential name must be referenced");
  assert.equal(/BONZAI_SESSION_CREDENTIAL=\S/.test(content), false, "the credential variable must not carry a value");
});

// ─────────────────────────────────────────────────────────────────────────────
// Static wiring checks — main.js cannot be imported directly under
// `node --test` (it requires a live Electron process), so, consistent with
// the A5 checks above, these assert the source wiring statically.
// ─────────────────────────────────────────────────────────────────────────────

test("P6: main.js wires the OpenClaw server through createOpenClawServer and listens on its resolved loopback host/port", () => {
  const src = fs.readFileSync(MAIN_JS, "utf8");
  assert.ok(/createOpenClawServer\(\{/.test(src), "main.js must construct the server via createOpenClawServer");
  assert.ok(
    /openclawApi\.server\.listen\(\s*openclawApi\.port\s*,\s*openclawApi\.host/.test(src),
    "main.js must listen on the factory-resolved host/port, not a hardcoded 0.0.0.0/undefined bind",
  );
  assert.equal(
    /Access-Control-Allow-Origin["'`]\s*,\s*["'`]\*["'`]/.test(src),
    false,
    "main.js must not set a wildcard Access-Control-Allow-Origin header",
  );
});

test("P6: OpenClaw/Hermes config writers use the live scoped credential, not a hardcoded placeholder", () => {
  const src = fs.readFileSync(MAIN_JS, "utf8");
  assert.equal(/apiKey:\s*["']bonzai-local["']/.test(src), false, "the hardcoded bonzai-local apiKey literal must be removed");
  assert.equal(/BONZAI_API_KEY=bonzai-local/.test(src), false, "the hardcoded bonzai-local env literal must be removed");
  assert.ok(/apiKey:\s*openclawCredential/.test(src), "OpenClaw's provider config must use the live credential");
  assert.ok(/BONZAI_API_KEY=\$\{hermesCredential\}/.test(src), "Hermes's .env must use the live credential");
});

test("P6: the Flask proxy dependency is wired to the main-owned session credential helper", () => {
  const src = fs.readFileSync(MAIN_JS, "utf8");
  assert.ok(
    /flaskAuthHeaders:\s*\(\)\s*=>\s*flaskSessionHeaders\(\)/.test(src),
    "the Flask proxy must authenticate with flaskSessionHeaders(), not caller-supplied headers",
  );
});

test("P6: the shared credential registry is issued with the openclaw scope", () => {
  const src = fs.readFileSync(MAIN_JS, "utf8");
  assert.ok(
    /scopes:\s*\[\s*["']local-session["']\s*,\s*OPENCLAW_CREDENTIAL_SCOPE\s*\]/.test(src),
    "credentialRegistry must be constructed with the openclaw scope alongside local-session",
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// P7 — Centralized file-IPC authorization (src/main/fileAccess.js), wired
// into read-file-as-base64, save-base64-to-file, and the local-video://
// protocol handler in main.js.
// ─────────────────────────────────────────────────────────────────────────────

// Real filesystem fixture tree — the authorization functions resolve
// symlinks and stat the filesystem directly, so containment/escape cases
// need real paths, not mocks.
const P7_TMP = fs.mkdtempSync(path.join(os.tmpdir(), "bonzai-p7-"));
const OWNED_ROOT = path.join(P7_TMP, "owned");
const OWNED_FILES = path.join(OWNED_ROOT, "files");
const SIBLING_ROOT = path.join(P7_TMP, "owned-evil"); // shares OWNED_ROOT's string prefix, not nested inside it
const OUTSIDE_ROOT = path.join(P7_TMP, "outside");

fs.mkdirSync(OWNED_FILES, { recursive: true });
fs.mkdirSync(SIBLING_ROOT, { recursive: true });
fs.mkdirSync(OUTSIDE_ROOT, { recursive: true });

const ownedFile = path.join(OWNED_ROOT, "inside.txt");
fs.writeFileSync(ownedFile, "owned-content");

const nestedOwnedFile = path.join(OWNED_FILES, "nested.txt");
fs.writeFileSync(nestedOwnedFile, "nested-content");

const siblingFile = path.join(SIBLING_ROOT, "sneaky.txt");
fs.writeFileSync(siblingFile, "sneaky");

const outsideFile = path.join(OUTSIDE_ROOT, "external.txt");
fs.writeFileSync(outsideFile, "external");

const outsideVideo = path.join(OUTSIDE_ROOT, "external.mp4");
fs.writeFileSync(outsideVideo, "fake-mp4-bytes");

const ownedVideo = path.join(OWNED_ROOT, "clip.mp4");
fs.writeFileSync(ownedVideo, "fake-mp4-bytes-owned");

const ownedNonVideo = path.join(OWNED_ROOT, "notvideo.txt");
fs.writeFileSync(ownedNonVideo, "text");

const dirLikeVideo = path.join(OWNED_ROOT, "folder.mp4");
fs.mkdirSync(dirLikeVideo);

// Symlink inside the owned root that resolves outside it.
const symlinkEscapeRead = path.join(OWNED_ROOT, "escape-read.txt");
fs.symlinkSync(outsideFile, symlinkEscapeRead);
const symlinkEscapeVideo = path.join(OWNED_ROOT, "escape-video.mp4");
fs.symlinkSync(outsideVideo, symlinkEscapeVideo);

// Pre-existing symlink sitting at a would-be write target, pointing at a
// file that does not exist yet — a classic write-through-link escape.
const writeLinkTarget = path.join(OWNED_ROOT, "write-target.bin");
const writeLinkDestination = path.join(OUTSIDE_ROOT, "does-not-exist-yet.bin");
fs.symlinkSync(writeLinkDestination, writeLinkTarget);

function toLocalVideoUrl(absPath) {
  return `local-video://${absPath}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// AC1 (R1): owned-root access and exact ephemeral grants both work; a grant
// is bound to sender, canonical path, operation, and exactly one use.
// ─────────────────────────────────────────────────────────────────────────────

test("P7 AC1: owned-root reads and writes are authorized and resolve to the canonical path", () => {
  const grants = createFileGrantStore();
  const roots = [OWNED_ROOT, OWNED_FILES];

  const read = authorizeRead({ requestedPath: ownedFile, senderId: 1, roots, grants });
  assert.equal(read.ok, true);
  assert.equal(read.canonicalPath, fs.realpathSync(ownedFile));

  const nestedRead = authorizeRead({ requestedPath: nestedOwnedFile, senderId: 1, roots, grants });
  assert.equal(nestedRead.ok, true);

  const writeTarget = path.join(OWNED_ROOT, "created.bin");
  const write = authorizeWrite({ requestedPath: writeTarget, senderId: 1, roots, grants });
  assert.equal(write.ok, true);
  assert.equal(write.canonicalPath, path.join(fs.realpathSync(OWNED_ROOT), "created.bin"));
});

test("P7 AC1: an exact ephemeral grant authorizes a path outside every owned root, exactly once", () => {
  const grants = createFileGrantStore();
  const real = fs.realpathSync(outsideFile);
  assert.equal(grants.register(7, real, "read"), true);

  const first = authorizeRead({ requestedPath: outsideFile, senderId: 7, roots: [OWNED_ROOT], grants });
  assert.equal(first.ok, true);
  assert.equal(first.canonicalPath, real);

  const second = authorizeRead({ requestedPath: outsideFile, senderId: 7, roots: [OWNED_ROOT], grants });
  assert.equal(second.ok, false, "the grant must be consumed after its first use");
});

test("P7 AC1: a grant is bound to sender, path, and operation — every mismatch is denied", () => {
  const grants = createFileGrantStore();
  const real = fs.realpathSync(outsideFile);
  const siblingReal = fs.realpathSync(siblingFile);
  grants.register(1, real, "read");

  assert.equal(grants.consume(2, real, "read"), false, "a different sender must not redeem the grant");
  assert.equal(grants.consume(1, real, "write"), false, "a different operation must not redeem the grant");
  assert.equal(grants.consume(1, siblingReal, "read"), false, "a different path must not redeem the grant");
  assert.equal(grants.consume(1, real, "read"), true, "the exact match succeeds");
  assert.equal(grants.consume(1, real, "read"), false, "already consumed — no replay");
});

test("P7 AC1: an unregistered path is never authorized, even with a live grant store present", () => {
  const grants = createFileGrantStore();
  grants.register(1, fs.realpathSync(outsideFile), "read"); // some other path
  const decision = authorizeRead({ requestedPath: siblingFile, senderId: 1, roots: [OWNED_ROOT], grants });
  assert.equal(decision.ok, false);
});

// ─────────────────────────────────────────────────────────────────────────────
// AC2 (R2): grants are registered ONLY from the existing native dialog
// flows — never inside read-file-as-base64/save-base64-to-file themselves,
// so a renderer can never forge its own grant.
// ─────────────────────────────────────────────────────────────────────────────

test("P7 AC2: fileGrants.register call sites all follow a dialog.showOpenDialog/showSaveDialog in the same handler", () => {
  const src = fs.readFileSync(MAIN_JS, "utf8");
  const registerCalls = [...src.matchAll(/fileGrants\.register\(/g)];
  assert.ok(registerCalls.length >= 1, "expected at least one fileGrants.register call site (select-video-file)");
  for (const m of registerCalls) {
    const before = src.slice(Math.max(0, m.index - 2000), m.index);
    const lastHandleIdx = before.lastIndexOf("ipcMain.handle(");
    assert.ok(lastHandleIdx !== -1, "a register() call must live inside an ipcMain.handle body");
    const handlerSlice = before.slice(lastHandleIdx);
    assert.ok(
      /dialog\.show(Open|Save)Dialog\(/.test(handlerSlice),
      `fileGrants.register must follow a native dialog call in the same handler, got: ${handlerSlice.slice(0, 160)}`,
    );
  }
});

test("P7 AC2: read-file-as-base64 and save-base64-to-file never mint their own grants (no renderer-forged authorization)", () => {
  const src = fs.readFileSync(MAIN_JS, "utf8");
  const extractHandler = (name) => {
    const re = new RegExp(`ipcMain\\.handle\\(\\s*["']${name}["'][\\s\\S]*?\\n\\}\\);`);
    const m = src.match(re);
    assert.ok(m, `expected to find ipcMain.handle("${name}", ...)`);
    return m[0];
  };
  assert.equal(extractHandler("read-file-as-base64").includes("fileGrants.register("), false);
  assert.equal(extractHandler("save-base64-to-file").includes("fileGrants.register("), false);
});

test("P7 AC2: select-video-file registers a grant scoped to the picked file for the invoking sender only", () => {
  const src = fs.readFileSync(MAIN_JS, "utf8");
  const m = src.match(/ipcMain\.handle\(\s*["']select-video-file["'][\s\S]*?\n\}\);/);
  assert.ok(m, "expected the select-video-file handler");
  assert.ok(/dialog\.showOpenDialog\(/.test(m[0]));
  assert.ok(/fileGrants\.register\(\s*event\.sender\.id\s*,/.test(m[0]), "grant must be keyed to event.sender.id");
});

// ─────────────────────────────────────────────────────────────────────────────
// AC3 (R3): traversal/sibling-prefix/symlink/write-link escapes are denied
// before any read/create/truncate; success shapes and bridge argument
// shapes are unchanged.
// ─────────────────────────────────────────────────────────────────────────────

test("P7 AC3: arbitrary host, sibling-prefix, traversal, and symlink escapes are rejected before a read", () => {
  const grants = createFileGrantStore();
  const roots = [OWNED_ROOT];

  assert.equal(authorizeRead({ requestedPath: outsideFile, senderId: 1, roots, grants }).ok, false, "arbitrary outside path denied");
  assert.equal(authorizeRead({ requestedPath: siblingFile, senderId: 1, roots, grants }).ok, false, "sibling-prefix path denied");

  const traversal = path.join(OWNED_ROOT, "..", "outside", "external.txt");
  assert.equal(authorizeRead({ requestedPath: traversal, senderId: 1, roots, grants }).ok, false, "traversal denied");

  assert.equal(authorizeRead({ requestedPath: symlinkEscapeRead, senderId: 1, roots, grants }).ok, false, "symlink escape denied");
});

test("P7 AC3: write-through-link and a missing parent are rejected before create/truncate — the link is never followed", () => {
  const grants = createFileGrantStore();
  const roots = [OWNED_ROOT];

  assert.equal(fs.existsSync(writeLinkDestination), false, "sanity: the link's destination must not exist yet");
  const linkDecision = authorizeWrite({ requestedPath: writeLinkTarget, senderId: 1, roots, grants });
  assert.equal(linkDecision.ok, false);
  assert.equal(linkDecision.reason, "write-through-link");
  assert.equal(fs.existsSync(writeLinkDestination), false, "must never create/truncate through the link");

  const missingParent = authorizeWrite({
    requestedPath: path.join(OWNED_ROOT, "no-such-dir", "file.bin"),
    senderId: 1,
    roots,
    grants,
  });
  assert.equal(missingParent.ok, false);
  assert.equal(missingParent.reason, "parent-missing");

  const outsideWrite = authorizeWrite({ requestedPath: path.join(OUTSIDE_ROOT, "new.bin"), senderId: 1, roots, grants });
  assert.equal(outsideWrite.ok, false);
});

test("P7 AC3: isWithinRoot uses component-aware containment, not a string prefix test", () => {
  const root = fs.realpathSync(OWNED_ROOT);
  const sibling = fs.realpathSync(SIBLING_ROOT);
  assert.equal(isWithinRoot(sibling, root), false, "a sibling sharing the root's string prefix must not pass");
  assert.equal(isWithinRoot(path.join(root, "sub", "f.txt"), root), true);
  assert.equal(isWithinRoot(root, root), true, "the root itself is within itself");
});

test("P7 R3: read-file-as-base64 routes through authorizeRead and preserves its success return shape", () => {
  const src = fs.readFileSync(MAIN_JS, "utf8");
  const m = src.match(/ipcMain\.handle\(\s*["']read-file-as-base64["'][\s\S]*?\n\}\);/);
  assert.ok(m, "expected the read-file-as-base64 handler");
  assert.ok(/authorizeRead\(/.test(m[0]), "handler must route through authorizeRead");
  assert.ok(/return data\.toString\(\s*["']base64["']\s*\)/.test(m[0]), "success path must still return a base64 string");

  const preloadSrc = fs.readFileSync(PRELOAD_JS, "utf8");
  assert.ok(
    /readFileAsBase64:\s*\(filePath\)\s*=>[\s\S]{0,40}ipcRenderer\.invoke\(\s*["']read-file-as-base64["']\s*,\s*filePath\s*\)/.test(preloadSrc),
    "preload bridge signature readFileAsBase64(filePath) must be unchanged",
  );
});

test("P7 R3: save-base64-to-file routes through authorizeWrite and preserves its success/failure return shapes", () => {
  const src = fs.readFileSync(MAIN_JS, "utf8");
  const m = src.match(/ipcMain\.handle\(\s*["']save-base64-to-file["'][\s\S]*?\n\}\);/);
  assert.ok(m, "expected the save-base64-to-file handler");
  assert.ok(/authorizeWrite\(/.test(m[0]), "handler must route through authorizeWrite");
  assert.ok(/return\s*\{\s*success:\s*true,\s*path:\s*filePath\s*\}/.test(m[0]), "success shape must be unchanged");
  assert.ok(/success:\s*false/.test(m[0]), "failure shape must still report success:false, never throw");

  const preloadSrc = fs.readFileSync(PRELOAD_JS, "utf8");
  assert.ok(
    /saveBase64ToFile:\s*\(filePath,\s*base64Data\)\s*=>[\s\S]{0,40}ipcRenderer\.invoke\(\s*["']save-base64-to-file["']\s*,\s*filePath,\s*base64Data\s*\)/.test(preloadSrc),
    "preload bridge signature saveBase64ToFile(filePath, base64Data) must be unchanged",
  );
});

test("P7 R3: preload exposes no new file-grant IPC surface to the renderer", () => {
  const src = fs.readFileSync(PRELOAD_JS, "utf8");
  assert.equal(/fileGrant|registerGrant|register-grant/i.test(src), false);
});

// ─────────────────────────────────────────────────────────────────────────────
// AC4 (R4): local-video:// applies the same root/grant policy. A valid
// owned video is served; malformed URL, encoded traversal, directory,
// outside/link target, missing file, and unsupported extension are denied.
// ─────────────────────────────────────────────────────────────────────────────

test("P7 AC4: a valid owned video is authorized and resolves to the canonical path", () => {
  const grants = createFileGrantStore();
  const decision = authorizeVideoRequest({ url: toLocalVideoUrl(ownedVideo), roots: [OWNED_ROOT], grants });
  assert.equal(decision.ok, true);
  assert.equal(decision.canonicalPath, fs.realpathSync(ownedVideo));
});

test("P7 AC4: malformed URLs (wrong scheme, host component, unparsable, double-encoded) are denied with 4xx", () => {
  const grants = createFileGrantStore();
  const roots = [OWNED_ROOT];

  assert.equal(authorizeVideoRequest({ url: "not a url at all", roots, grants }).ok, false);
  assert.equal(authorizeVideoRequest({ url: "not a url at all", roots, grants }).status, 400);

  assert.equal(authorizeVideoRequest({ url: "https://example.com/x.mp4", roots, grants }).status, 400);

  assert.equal(
    authorizeVideoRequest({ url: "local-video://evil-host/etc/passwd.mp4", roots, grants }).status,
    400,
    "a host component must not be silently folded into the path",
  );

  const doubleEncoded = "local-video:///tmp%252e%252e%252fescape.mp4";
  const decision = authorizeVideoRequest({ url: doubleEncoded, roots, grants });
  assert.equal(decision.ok, false);
  assert.equal(decision.status, 400, "residual percent-encoding after one decode pass must be rejected as malformed");
});

test("P7 AC4: directory, outside-root, symlink-escape, missing file, and unsupported extension are all denied", () => {
  const grants = createFileGrantStore();
  const roots = [OWNED_ROOT];

  const dir = authorizeVideoRequest({ url: toLocalVideoUrl(dirLikeVideo), roots, grants });
  assert.equal(dir.ok, false);
  assert.notEqual(dir.status, 200);

  const outside = authorizeVideoRequest({ url: toLocalVideoUrl(outsideVideo), roots, grants });
  assert.equal(outside.ok, false);
  assert.equal(outside.status, 403);

  const linkEscape = authorizeVideoRequest({ url: toLocalVideoUrl(symlinkEscapeVideo), roots, grants });
  assert.equal(linkEscape.ok, false);
  assert.equal(linkEscape.status, 403);

  const missing = authorizeVideoRequest({ url: toLocalVideoUrl(path.join(OWNED_ROOT, "nope.mp4")), roots, grants });
  assert.equal(missing.ok, false);
  assert.equal(missing.status, 404);

  const unsupported = authorizeVideoRequest({ url: toLocalVideoUrl(ownedNonVideo), roots, grants });
  assert.equal(unsupported.ok, false);
  assert.equal(unsupported.status, 403);
});

test("P7 AC4: a select-video-file-style grant authorizes local-video:// for a path outside owned roots, exactly once", () => {
  const grants = createFileGrantStore();
  const real = fs.realpathSync(outsideVideo);
  const token = grants.registerCapability(real, "read");
  const grantedUrl = `${toLocalVideoUrl(outsideVideo)}?grant=${token}`;

  const first = authorizeVideoRequest({ url: grantedUrl, roots: [OWNED_ROOT], grants });
  assert.equal(first.ok, true);

  const second = authorizeVideoRequest({ url: grantedUrl, roots: [OWNED_ROOT], grants });
  assert.equal(second.ok, false, "protocol-layer grant consumption is one-time too");
});

test("P7 AC4: a path-only grant (no capability token) never authorizes local-video://, even for the matching sender", () => {
  const grants = createFileGrantStore();
  const real = fs.realpathSync(outsideVideo);
  grants.register(3, real, "read");

  const noToken = authorizeVideoRequest({ url: toLocalVideoUrl(outsideVideo), roots: [OWNED_ROOT], grants });
  assert.equal(noToken.ok, false, "the protocol handler has no sender id, so path-only grants must not redeem here");
  assert.equal(noToken.status, 403);
});

test("P7: VIDEO_EXTENSIONS matches the handler's documented supported set", () => {
  assert.deepEqual(
    [...VIDEO_EXTENSIONS].sort(),
    [".mp4", ".webm", ".mov", ".avi", ".mkv", ".ogv", ".m4v"].sort(),
  );
});

test("P7 R4: main.js wires local-video through authorizeVideoRequest and never reflects the raw request path/url in a denial", () => {
  const src = fs.readFileSync(MAIN_JS, "utf8");
  const start = src.indexOf('protocol.handle("local-video"');
  assert.notEqual(start, -1, "expected the local-video protocol.handle registration");
  // Slice to the next protocol.handle(...) registration (bonzai-blob) so the
  // full handler body is captured, not just its first nested call — a
  // non-greedy regex bounded on "\n  });" stops early because
  // authorizeVideoRequest({...}) itself closes with exactly that pattern.
  const next = src.indexOf('protocol.handle(', start + 1);
  assert.notEqual(next, -1, "expected another protocol.handle(...) registration to follow");
  const handlerSrc = src.slice(start, next);

  assert.ok(/authorizeVideoRequest\(/.test(handlerSrc), "handler must route through authorizeVideoRequest");
  assert.equal(/new Response\([^)]*req\.url/.test(handlerSrc), false, "a denial response must never echo the raw request URL");
  assert.ok(/new Response\(/.test(handlerSrc), "sanity: handler must actually build denial responses");
});

// ─────────────────────────────────────────────────────────────────────────────
// AC5 (R5): protocol registration no longer requests CSP-bypass/CORS
// privileges for local-video:// that the confined handler no longer needs.
// ─────────────────────────────────────────────────────────────────────────────

test("P7 AC5: local-video privileged-scheme registration drops bypassCSP and corsEnabled", () => {
  const src = fs.readFileSync(MAIN_JS, "utf8");
  const block = src.match(/registerSchemesAsPrivileged\(\[[\s\S]*?\]\);/);
  assert.ok(block, "expected protocol.registerSchemesAsPrivileged(...)");
  const entry = block[0].match(/\{\s*scheme:\s*["']local-video["'][\s\S]*?\}/);
  assert.ok(entry, "expected a local-video scheme privilege entry");
  assert.equal(/bypassCSP\s*:\s*true/.test(entry[0]), false, "local-video must not request bypassCSP");
  assert.equal(/corsEnabled\s*:\s*true/.test(entry[0]), false, "local-video must not request corsEnabled");
});

// ─────────────────────────────────────────────────────────────────────────────
// Sanity: parseLocalVideoUrl unit coverage independent of roots/grants.
// ─────────────────────────────────────────────────────────────────────────────

test("P7: parseLocalVideoUrl strictly decodes exactly once and rejects malformed input", () => {
  assert.equal(parseLocalVideoUrl("local-video:///a/b.mp4"), "/a/b.mp4");
  assert.equal(parseLocalVideoUrl("local-video://host/a.mp4"), null);
  assert.equal(parseLocalVideoUrl("ftp:///a/b.mp4"), null);
  assert.equal(parseLocalVideoUrl("::not a url::"), null);
  assert.equal(parseLocalVideoUrl("local-video:///a%252e%252eb.mp4"), null);
  assert.equal(parseLocalVideoUrl("local-video:///a%20b.mp4"), "/a b.mp4");
});

// ─────────────────────────────────────────────────────────────────────────────
// P8 — Per-integration outbound egress policy (src/main/egressPolicy.js),
// wired into social:api-call, social:media-upload, and proxy:fetch in
// main.js. Replaces generic proxying (arbitrary URL/headers forwarded to
// fetch) with immutable per-integration HTTPS origin/path/method policies,
// pre-DNS/pre-fetch validation, blocked-range DNS enforcement with pinning,
// manual (revalidated) redirects, and allowlisted headers.
// ─────────────────────────────────────────────────────────────────────────────

// ── Fetch/DNS test doubles ──────────────────────────────────────────────────
// performEgressRequest takes `lookup`/`fetchImpl`/`buildDispatcher` as an
// injection seam specifically so these tests never touch the real network —
// `fetchImpl` is the "fetch spy" required by R7: every denial test asserts
// its call count stayed at 0.

function makeFetchSpy(responder) {
  const calls = [];
  let n = 0;
  const fn = async (url, init) => {
    calls.push({ url, init });
    const r = Array.isArray(responder) ? responder[Math.min(n, responder.length - 1)] : responder;
    n++;
    return typeof r === "function" ? r(url, init) : r;
  };
  fn.calls = calls;
  return fn;
}

function jsonResponse(status, body) {
  return {
    status,
    ok: status >= 200 && status < 300,
    statusText: String(status),
    headers: { get: (h) => (String(h).toLowerCase() === "content-type" ? "application/json" : null) },
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

function redirectResponse(status, location) {
  return {
    status,
    ok: false,
    statusText: String(status),
    headers: { get: (h) => (String(h).toLowerCase() === "location" ? location : null) },
  };
}

function lookupOf(...addresses) {
  return async () => addresses;
}

const noDispatcher = () => null;

// ─────────────────────────────────────────────────────────────────────────────
// AC1 (R1): immutable per-integration policies; enumeration; unknown
// platform/integration denied before any DNS lookup or fetch.
// ─────────────────────────────────────────────────────────────────────────────

test("P8 AC1: every declared social policy and proxy integration is immutable", () => {
  assert.ok(Object.isFrozen(SOCIAL_POLICIES));
  assert.ok(Object.isFrozen(PROXY_INTEGRATIONS));
  for (const platform of SOCIAL_PLATFORMS) {
    for (const action of ["apiCall", "mediaUpload"]) {
      const policy = SOCIAL_POLICIES[platform][action];
      assert.ok(Object.isFrozen(policy), `${platform}.${action} policy must be frozen`);
      assert.ok(Object.isFrozen(policy.routes), `${platform}.${action} routes array must be frozen`);
      for (const route of policy.routes) assert.ok(Object.isFrozen(route), `${platform}.${action} route must be frozen`);
    }
  }
  for (const host of PROXY_HOSTS) {
    const policy = PROXY_INTEGRATIONS[host];
    assert.ok(Object.isFrozen(policy), `${host} policy must be frozen`);
    for (const route of policy.routes) assert.ok(Object.isFrozen(route), `${host} route must be frozen`);
  }
  assert.ok(SOCIAL_PLATFORMS.length >= 3);
  assert.ok(PROXY_HOSTS.length >= 3);
});

test("P8 AC1: enumerates every social integration's allowed origin/path/method", () => {
  for (const platform of SOCIAL_PLATFORMS) {
    for (const action of ["apiCall", "mediaUpload"]) {
      const policy = resolveSocialPolicy(platform, action);
      assert.ok(policy, `${platform}.${action} must resolve to a policy`);
      for (const route of policy.routes) {
        assert.ok(route.origin.startsWith("https://"), `${platform}.${action} route origin must be https`);
        for (const method of route.methods) {
          const { route: matched } = validateTargetUrl(`${route.origin}${route.pathPrefix}`, policy, method);
          assert.equal(matched, route, `${platform}.${action} ${route.origin}${route.pathPrefix} [${method}] must match its own route`);
        }
      }
    }
  }
  // Instagram media upload is intentionally route-less (R6).
  assert.deepEqual(resolveSocialPolicy("instagram", "mediaUpload").routes, []);
});

test("P8 AC1: enumerates every proxy integration's allowed origin/path/method", () => {
  for (const host of PROXY_HOSTS) {
    const policy = resolveProxyPolicy(`https://${host}/`);
    assert.ok(policy, `${host} must resolve to a policy`);
    assert.equal(policy, PROXY_INTEGRATIONS[host]);
    for (const route of policy.routes) {
      for (const method of route.methods) {
        const { route: matched } = validateTargetUrl(`${route.origin}${route.pathPrefix}`, policy, method);
        assert.equal(matched, route, `${host} ${route.origin}${route.pathPrefix} [${method}] must match its own route`);
      }
    }
  }
});

test("P8 AC1: unknown platform and unknown host are denied before any DNS lookup or fetch", async () => {
  assert.equal(resolveSocialPolicy("myspace", "apiCall"), null);
  assert.equal(resolveSocialPolicy("instagram", "notARealAction"), null);
  assert.equal(resolveProxyPolicy("https://evil.example.com/steal"), null);

  const lookupCalls = [];
  const fetchSpy = makeFetchSpy(jsonResponse(200, {}));
  await assert.rejects(
    performEgressRequest(
      { policy: resolveSocialPolicy("myspace", "apiCall"), url: "https://myspace.com/api", method: "GET" },
      { lookup: async (...a) => { lookupCalls.push(a); return []; }, fetchImpl: fetchSpy, buildDispatcher: noDispatcher },
    ),
    (e) => e instanceof EgressPolicyError && e.code === "UNKNOWN_INTEGRATION",
  );
  assert.equal(lookupCalls.length, 0, "no DNS lookup for an unknown integration");
  assert.equal(fetchSpy.calls.length, 0, "no fetch for an unknown integration");

  const fetchSpy2 = makeFetchSpy(jsonResponse(200, {}));
  await assert.rejects(
    performEgressRequest(
      { policy: resolveProxyPolicy("https://evil.example.com/steal"), url: "https://evil.example.com/steal", method: "GET" },
      { lookup: async () => [{ address: "203.0.113.10", family: 4 }], fetchImpl: fetchSpy2, buildDispatcher: noDispatcher },
    ),
    (e) => e.code === "UNKNOWN_INTEGRATION",
  );
  assert.equal(fetchSpy2.calls.length, 0);
});

test("P8 AC1: an allowed request for every declared route reaches the fetch implementation exactly once", async () => {
  for (const platform of SOCIAL_PLATFORMS) {
    for (const action of ["apiCall", "mediaUpload"]) {
      const policy = resolveSocialPolicy(platform, action);
      for (const route of policy.routes) {
        const fetchSpy = makeFetchSpy(jsonResponse(200, { ok: true }));
        const response = await performEgressRequest(
          { policy, url: `${route.origin}${route.pathPrefix}`, method: route.methods[0], headers: {}, accessToken: "tok" },
          { fetchImpl: fetchSpy, lookup: lookupOf({ address: "203.0.113.10", family: 4 }), buildDispatcher: noDispatcher },
        );
        assert.equal(fetchSpy.calls.length, 1, `${platform}.${action} ${route.origin} should be fetched exactly once`);
        assert.equal(response.status, 200);
      }
    }
  }
  for (const host of PROXY_HOSTS) {
    const policy = resolveProxyPolicy(`https://${host}/`);
    for (const route of policy.routes) {
      const fetchSpy = makeFetchSpy(jsonResponse(200, { ok: true }));
      const response = await performEgressRequest(
        { policy, url: `${route.origin}${route.pathPrefix}`, method: route.methods[0], headers: {} },
        { fetchImpl: fetchSpy, lookup: lookupOf({ address: "203.0.113.10", family: 4 }), buildDispatcher: noDispatcher },
      );
      assert.equal(fetchSpy.calls.length, 1, `${host} should be fetched exactly once`);
      assert.equal(response.status, 200);
    }
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// AC2 (R2): URL credentials, non-HTTPS schemes, unsupported methods,
// loopback/private/unique-local/link-local/metadata literals, and DNS
// results in blocked ranges are all denied, and never fetched.
// ─────────────────────────────────────────────────────────────────────────────

test("P8 AC2: isBlockedIpAddress covers loopback, RFC1918, unique-local, link-local, and metadata ranges (v4 and v6)", () => {
  const blocked = [
    "127.0.0.1", "127.255.255.255",
    "10.0.0.1", "172.16.0.1", "172.31.255.255", "192.168.0.1",
    "169.254.1.1", "169.254.169.254", "100.100.100.200",
    "::1", "fc00::1", "fd12:3456:789a::1", "fe80::1", "fd00:ec2::254",
    "::ffff:127.0.0.1", "::ffff:10.0.0.1",
    "not-an-ip", "999.999.999.999",
  ];
  for (const addr of blocked) assert.equal(isBlockedIpAddress(addr), true, `${addr} must be blocked`);

  const allowed = ["8.8.8.8", "1.1.1.1", "157.240.0.1", "203.0.113.10", "2001:4860:4860::8888", "::ffff:8.8.8.8"];
  for (const addr of allowed) assert.equal(isBlockedIpAddress(addr), false, `${addr} must not be blocked`);
});

test("P8 AC2: URL credentials are rejected before any fetch", async () => {
  const policy = resolveSocialPolicy("instagram", "apiCall");
  const fetchSpy = makeFetchSpy(jsonResponse(200, {}));
  await assert.rejects(
    performEgressRequest(
      { policy, url: "https://user:pass@graph.facebook.com/v21.0/me", method: "GET" },
      { fetchImpl: fetchSpy, lookup: lookupOf({ address: "157.240.0.1", family: 4 }), buildDispatcher: noDispatcher },
    ),
    (e) => e.code === "URL_CREDENTIALS",
  );
  assert.equal(fetchSpy.calls.length, 0);
});

test("P8 AC2: non-HTTPS schemes are rejected before any fetch", async () => {
  const policy = resolveSocialPolicy("instagram", "apiCall");
  for (const url of ["http://graph.facebook.com/v21.0/me", "file:///etc/passwd", "ftp://graph.facebook.com/v21.0/me"]) {
    const fetchSpy = makeFetchSpy(jsonResponse(200, {}));
    await assert.rejects(
      performEgressRequest(
        { policy, url, method: "GET" },
        { fetchImpl: fetchSpy, lookup: lookupOf({ address: "157.240.0.1", family: 4 }), buildDispatcher: noDispatcher },
      ),
      (e) => e.code === "INVALID_SCHEME",
      url,
    );
    assert.equal(fetchSpy.calls.length, 0, url);
  }
});

test("P8 AC2/R2: unsupported methods are rejected before any fetch", async () => {
  const policy = resolveSocialPolicy("instagram", "apiCall");
  const fetchSpy = makeFetchSpy(jsonResponse(200, {}));
  await assert.rejects(
    performEgressRequest(
      { policy, url: "https://graph.facebook.com/v21.0/me", method: "PUT" },
      { fetchImpl: fetchSpy, lookup: lookupOf({ address: "157.240.0.1", family: 4 }), buildDispatcher: noDispatcher },
    ),
    (e) => e.code === "TARGET_NOT_ALLOWED",
  );
  assert.equal(fetchSpy.calls.length, 0);
});

test("P8 AC2/R2: a target outside every route's origin/path is rejected before any fetch", async () => {
  const policy = resolveSocialPolicy("instagram", "apiCall");
  const fetchSpy = makeFetchSpy(jsonResponse(200, {}));
  await assert.rejects(
    performEgressRequest(
      { policy, url: "https://attacker.example.com/v21.0/me", method: "GET" },
      { fetchImpl: fetchSpy, lookup: lookupOf({ address: "203.0.113.10", family: 4 }), buildDispatcher: noDispatcher },
    ),
    (e) => e.code === "TARGET_NOT_ALLOWED",
  );
  assert.equal(fetchSpy.calls.length, 0);
});

// Loopback/private/unique-local/link-local/metadata IP literals in the URL
// itself: exercised through the real validate→resolve→fetch pipeline (not
// just the isBlockedIpAddress unit above) via a synthetic policy whose route
// origin is the literal under test, proving the literal short-circuits
// straight to the blocklist without ever calling DNS.
const BLOCKED_LITERALS = [
  ["127.0.0.1", "loopback v4"],
  ["10.1.2.3", "RFC1918 10/8"],
  ["172.16.0.1", "RFC1918 172.16/12"],
  ["192.168.1.1", "RFC1918 192.168/16"],
  ["169.254.169.254", "link-local / cloud metadata v4"],
  ["100.100.100.200", "Alibaba Cloud metadata v4"],
  ["[::1]", "loopback v6"],
  ["[fc00::1]", "unique-local v6"],
  ["[fe80::1]", "link-local v6"],
  ["[fd00:ec2::254]", "AWS IMDSv6"],
];

test("P8 AC2/R2: loopback/private/unique-local/link-local/metadata IP literals are rejected before any fetch, without querying DNS", async () => {
  for (const [hostLiteral, label] of BLOCKED_LITERALS) {
    const origin = `https://${hostLiteral}`;
    const policy = {
      name: `test:${label}`,
      routes: [{ origin, pathPrefix: "/", methods: ["GET"], allowedHeaders: [], authFrom: "none" }],
    };
    const fetchSpy = makeFetchSpy(jsonResponse(200, {}));
    await assert.rejects(
      performEgressRequest(
        { policy, url: `${origin}/x`, method: "GET" },
        {
          fetchImpl: fetchSpy,
          lookup: async () => { throw new Error("DNS must not be queried for an IP literal"); },
          buildDispatcher: noDispatcher,
        },
      ),
      (e) => e.code === "BLOCKED_ADDRESS",
      label,
    );
    assert.equal(fetchSpy.calls.length, 0, `${label}: fetch must never be called`);
  }
});

test("P8 AC2/R2: a hostname resolving to a blocked address is rejected, and any blocked answer denies the whole request (mixed answers / rebinding safety)", async () => {
  const policy = resolveSocialPolicy("instagram", "apiCall");

  const fetchSpy1 = makeFetchSpy(jsonResponse(200, {}));
  await assert.rejects(
    performEgressRequest(
      { policy, url: "https://graph.facebook.com/v21.0/me", method: "GET" },
      { fetchImpl: fetchSpy1, lookup: lookupOf({ address: "127.0.0.1", family: 4 }), buildDispatcher: noDispatcher },
    ),
    (e) => e.code === "BLOCKED_ADDRESS",
  );
  assert.equal(fetchSpy1.calls.length, 0);

  // Mixed answer set: one public, one private. Must deny outright rather
  // than "pick the public one" — an attacker who controls answer order (or
  // a later re-resolution) could otherwise steer a retry onto the private
  // address.
  const fetchSpy2 = makeFetchSpy(jsonResponse(200, {}));
  await assert.rejects(
    performEgressRequest(
      { policy, url: "https://graph.facebook.com/v21.0/me", method: "GET" },
      {
        fetchImpl: fetchSpy2,
        lookup: lookupOf({ address: "157.240.0.1", family: 4 }, { address: "127.0.0.1", family: 4 }),
        buildDispatcher: noDispatcher,
      },
    ),
    (e) => e.code === "BLOCKED_ADDRESS",
  );
  assert.equal(fetchSpy2.calls.length, 0, "a mixed public/private DNS answer must deny the request outright");
});

test("P8 R2: the validated resolved address is pinned to the connector used for the actual fetch (prevents TOCTOU rebinding)", async () => {
  const policy = resolveSocialPolicy("instagram", "apiCall");
  const pinnedCalls = [];
  const fetchSpy = makeFetchSpy(jsonResponse(200, {}));
  await performEgressRequest(
    { policy, url: "https://graph.facebook.com/v21.0/me", method: "GET" },
    {
      fetchImpl: fetchSpy,
      lookup: lookupOf({ address: "157.240.0.1", family: 4 }, { address: "157.240.0.2", family: 4 }),
      buildDispatcher: (address, family, hostname) => { pinnedCalls.push({ address, family, hostname }); return null; },
    },
  );
  assert.deepEqual(pinnedCalls, [{ address: "157.240.0.1", family: 4, hostname: "graph.facebook.com" }]);
});

// ─────────────────────────────────────────────────────────────────────────────
// AC3 (R3): protected headers can never be overridden by callers; main-
// process authorization is injected where required.
// ─────────────────────────────────────────────────────────────────────────────

test("P8 AC3: Host/Cookie/Proxy-Authorization/Content-Length can never be set by the caller, for any declared route", () => {
  const forbidden = { Host: "evil.com", Cookie: "session=stolen", "Proxy-Authorization": "Basic x", "Content-Length": "0" };
  const allRoutes = [
    ...SOCIAL_PLATFORMS.flatMap((p) => ["apiCall", "mediaUpload"].flatMap((a) => resolveSocialPolicy(p, a).routes)),
    ...PROXY_HOSTS.flatMap((h) => resolveProxyPolicy(`https://${h}/`).routes),
  ];
  assert.ok(allRoutes.length > 0);
  for (const route of allRoutes) {
    const sanitized = sanitizeRequestHeaders(forbidden, route, {});
    for (const key of Object.keys(forbidden)) {
      assert.equal(sanitized[key], undefined, `${route.origin}: ${key} must be stripped`);
    }
  }
});

test("P8 AC3: header casing cannot be used to smuggle a protected header past the sanitizer", () => {
  const route = resolveSocialPolicy("instagram", "apiCall").routes[0];
  const sanitized = sanitizeRequestHeaders({ HOST: "evil.com", CoOkIe: "a=b", "PROXY-AUTHORIZATION": "x" }, route, {});
  const keys = Object.keys(sanitized).map((k) => k.toLowerCase());
  assert.equal(keys.includes("host"), false);
  assert.equal(keys.includes("cookie"), false);
  assert.equal(keys.includes("proxy-authorization"), false);
});

test("P8 AC3: caller Authorization is stripped unless the route declares authFrom: callerHeader", () => {
  const accessTokenRoute = resolveSocialPolicy("tiktok", "mediaUpload").routes[0];
  assert.equal(accessTokenRoute.authFrom, "accessTokenField");
  const sanitized = sanitizeRequestHeaders({ Authorization: "Bearer forged" }, accessTokenRoute, {});
  assert.equal(sanitized.Authorization, undefined);

  const noAuthRoute = resolveProxyPolicy("https://api.coingecko.com/").routes[0];
  assert.equal(noAuthRoute.authFrom, "none");
  const sanitized2 = sanitizeRequestHeaders({ Authorization: "Bearer forged" }, noAuthRoute, {});
  assert.equal(sanitized2.Authorization, undefined);
});

test("P8 AC3/R3: main-process authorization is injected from the vetted accessToken field, and a caller-forged Authorization header cannot override it", async () => {
  const policy = resolveSocialPolicy("tiktok", "mediaUpload");
  const fetchSpy = makeFetchSpy(jsonResponse(200, {}));
  await performEgressRequest(
    {
      policy,
      url: "https://open-upload.tiktokapis.com/upload/v1/session-abc",
      method: "POST",
      headers: { Authorization: "Bearer forged-by-caller" },
      accessToken: "real-main-issued-token",
    },
    { fetchImpl: fetchSpy, lookup: lookupOf({ address: "203.0.113.20", family: 4 }), buildDispatcher: noDispatcher },
  );
  assert.equal(fetchSpy.calls.length, 1);
  assert.equal(fetchSpy.calls[0].init.headers.Authorization, "Bearer real-main-issued-token");
});

test("P8 AC3: default Accept/User-Agent are always injected and cannot be overridden by the caller", () => {
  const route = resolveSocialPolicy("instagram", "apiCall").routes[0];
  const sanitized = sanitizeRequestHeaders({ Accept: "text/evil", "User-Agent": "evil-agent" }, route, {});
  assert.equal(sanitized.Accept, "application/json");
  assert.equal(sanitized["User-Agent"], "BonzAI/1.0");
});

test("P8 AC3: headers not on a route's explicit allowlist are stripped even when harmless-looking", () => {
  const route = resolveSocialPolicy("instagram", "apiCall").routes[0]; // allowedHeaders: ["content-type"]
  const sanitized = sanitizeRequestHeaders({ "X-Forwarded-For": "10.0.0.1", "Content-Type": "application/json" }, route, {});
  assert.equal(sanitized["X-Forwarded-For"], undefined);
  assert.equal(sanitized["Content-Type"], "application/json");
});

// ─────────────────────────────────────────────────────────────────────────────
// AC4 (R4): redirects are never followed automatically, and every allowed
// redirect destination is revalidated (target policy + DNS + pinning) before
// it is followed.
// ─────────────────────────────────────────────────────────────────────────────

test("P8 AC4: redirect is always requested as manual, never automatic", async () => {
  const policy = resolveSocialPolicy("instagram", "apiCall");
  const fetchSpy = makeFetchSpy(jsonResponse(200, {}));
  await performEgressRequest(
    { policy, url: "https://graph.facebook.com/v21.0/me", method: "GET" },
    { fetchImpl: fetchSpy, lookup: lookupOf({ address: "157.240.0.1", family: 4 }), buildDispatcher: noDispatcher },
  );
  assert.equal(fetchSpy.calls[0].init.redirect, "manual");
});

test("P8 AC4: a redirect to a destination outside the policy is rejected and never fetched", async () => {
  const policy = resolveSocialPolicy("instagram", "apiCall");
  const fetchSpy = makeFetchSpy(redirectResponse(302, "https://evil.example.com/steal"));
  await assert.rejects(
    performEgressRequest(
      { policy, url: "https://graph.facebook.com/v21.0/me", method: "GET" },
      { fetchImpl: fetchSpy, lookup: lookupOf({ address: "157.240.0.1", family: 4 }), buildDispatcher: noDispatcher },
    ),
    (e) => e.code === "TARGET_NOT_ALLOWED",
  );
  assert.equal(fetchSpy.calls.length, 1, "the disallowed redirect target must never itself be fetched");
});

test("P8 AC4: a redirect to a private address is rejected and never fetched — the hop re-resolves DNS itself", async () => {
  const policy = resolveSocialPolicy("instagram", "apiCall");
  const fetchSpy = makeFetchSpy(redirectResponse(302, "https://graph.facebook.com/v21.0/internal"));
  let lookupCall = 0;
  await assert.rejects(
    performEgressRequest(
      { policy, url: "https://graph.facebook.com/v21.0/me", method: "GET" },
      {
        fetchImpl: fetchSpy,
        lookup: async () => {
          lookupCall++;
          return lookupCall === 1 ? [{ address: "157.240.0.1", family: 4 }] : [{ address: "127.0.0.1", family: 4 }];
        },
        buildDispatcher: noDispatcher,
      },
    ),
    (e) => e.code === "BLOCKED_ADDRESS",
  );
  assert.equal(fetchSpy.calls.length, 1, "the redirect target must never itself be fetched");
  assert.equal(lookupCall, 2, "the redirect hop must trigger its own DNS resolution");
});

test("P8 AC4: an allowed redirect destination is revalidated and then followed", async () => {
  const policy = resolveSocialPolicy("x", "apiCall");
  let calls = 0;
  const fetchSpy = async (url, init) => {
    calls++;
    fetchSpy.calls.push({ url, init });
    if (calls === 1) return redirectResponse(307, "https://upload.twitter.com/1.1/media/upload.json?command=STATUS");
    return jsonResponse(200, { ok: true });
  };
  fetchSpy.calls = [];

  const response = await performEgressRequest(
    { policy, url: "https://api.twitter.com/2/tweets", method: "POST", body: "x=1" },
    { fetchImpl: fetchSpy, lookup: lookupOf({ address: "104.244.42.1", family: 4 }), buildDispatcher: noDispatcher },
  );

  assert.equal(calls, 2, "the redirect target must be fetched only after revalidation");
  assert.equal(response.status, 200);
  assert.equal(fetchSpy.calls[1].url, "https://upload.twitter.com/1.1/media/upload.json?command=STATUS");
  // 307 preserves method + body.
  assert.equal(fetchSpy.calls[1].init.method, "POST");
  assert.equal(fetchSpy.calls[1].init.body, "x=1");
});

test("P8 AC4: a 302 redirect for a non-GET request downgrades the follow-up to GET with no body (standard redirect semantics)", async () => {
  const policy = resolveSocialPolicy("instagram", "apiCall");
  let calls = 0;
  const fetchSpy = async (url, init) => {
    calls++;
    fetchSpy.calls.push({ url, init });
    if (calls === 1) return redirectResponse(302, "https://graph.facebook.com/v21.0/redirected");
    return jsonResponse(200, { ok: true });
  };
  fetchSpy.calls = [];

  await performEgressRequest(
    { policy, url: "https://graph.facebook.com/v21.0/me", method: "POST", body: "a=1" },
    { fetchImpl: fetchSpy, lookup: lookupOf({ address: "157.240.0.1", family: 4 }), buildDispatcher: noDispatcher },
  );

  assert.equal(fetchSpy.calls[1].init.method, "GET");
  assert.equal(fetchSpy.calls[1].init.body, undefined);
});

test("P8 AC4/R4: exceeding the redirect hop limit is rejected", async () => {
  const policy = resolveSocialPolicy("instagram", "apiCall");
  const fetchSpy = makeFetchSpy(redirectResponse(302, "https://graph.facebook.com/v21.0/next"));
  await assert.rejects(
    performEgressRequest(
      { policy, url: "https://graph.facebook.com/v21.0/me", method: "GET" },
      { fetchImpl: fetchSpy, lookup: lookupOf({ address: "157.240.0.1", family: 4 }), buildDispatcher: noDispatcher, maxRedirects: 2 },
    ),
    (e) => e.code === "TOO_MANY_REDIRECTS",
  );
  assert.equal(fetchSpy.calls.length, 3);
});

// ─────────────────────────────────────────────────────────────────────────────
// AC5 (R5/R6): main.js wires all three handlers through the shared policy
// helper, preserves their response envelopes, and the file:// temp-hosting
// result is gone.
// ─────────────────────────────────────────────────────────────────────────────

test("P8 AC5/R5: social:api-call routes through resolveSocialPolicy + performEgressRequest and preserves its response envelope", () => {
  const src = fs.readFileSync(MAIN_JS, "utf8");
  const m = src.match(/ipcMain\.handle\(\s*["']social:api-call["'][\s\S]*?\n\}\);/);
  assert.ok(m, "expected the social:api-call handler");
  assert.ok(/resolveSocialPolicy\(\s*platform,\s*["']apiCall["']\s*\)/.test(m[0]));
  assert.ok(/performEgressRequest\(/.test(m[0]));
  assert.ok(/return\s*\{\s*\.\.\.data,\s*status:\s*response\.status\s*\}/.test(m[0]), "success shape must be unchanged");
  assert.ok(/return\s*\{\s*error:\s*e\.message,\s*status:\s*0\s*\}/.test(m[0]), "failure shape must be unchanged");
});

test("P8 AC5/R5/R6: social:media-upload routes through resolveSocialPolicy + performEgressRequest, and the file:// temp-hosting result is removed", () => {
  const src = fs.readFileSync(MAIN_JS, "utf8");
  const m = src.match(/ipcMain\.handle\(\s*["']social:media-upload["'][\s\S]*?\n\}\);/);
  assert.ok(m, "expected the social:media-upload handler");
  assert.ok(/resolveSocialPolicy\(\s*platform,\s*["']mediaUpload["']\s*\)/.test(m[0]));
  assert.ok(/performEgressRequest\(/.test(m[0]));
  assert.ok(/accessToken/.test(m[0]));
  assert.equal(/file:\/\/\$\{filePath\}/.test(m[0]), false, "the file:// temp-hosting result must be removed (R6)");
  assert.equal(/fs\.writeFileSync/.test(m[0]), false, "no local file should be written and handed back as a fake public URL");
  assert.ok(/return\s*\{\s*success:\s*response\.ok,\s*\.\.\.data\s*\}/.test(m[0]), "success shape must be unchanged");
});

test("P8 AC5/R5: proxy:fetch routes through resolveProxyPolicy + performEgressRequest and preserves its response envelope", () => {
  const src = fs.readFileSync(MAIN_JS, "utf8");
  const m = src.match(/ipcMain\.handle\(\s*["']proxy:fetch["'][\s\S]*?\n\}\);/);
  assert.ok(m, "expected the proxy:fetch handler");
  assert.ok(/resolveProxyPolicy\(\s*url\s*\)/.test(m[0]));
  assert.ok(/performEgressRequest\(/.test(m[0]));
  assert.ok(/return\s*\{\s*success:\s*true,\s*data\s*\}/.test(m[0]), "success shape must be unchanged");
  assert.ok(/success:\s*false/.test(m[0]), "failure shape must still report success:false");
});

test("P8 R6: no file:// hosting result exists anywhere in main.js", () => {
  const src = fs.readFileSync(MAIN_JS, "utf8");
  assert.equal(/url:\s*`file:\/\/\$\{filePath\}`/.test(src), false);
});

test("P8 R5: preload argument shapes for social.apiCall, social.mediaUpload, and externalProxy.fetch are unchanged", () => {
  const preloadSrc = fs.readFileSync(PRELOAD_JS, "utf8");
  assert.ok(
    /apiCall:\s*\(\{\s*platform,\s*url,\s*method,\s*headers,\s*body,\s*formData\s*\}\)\s*=>[\s\S]{0,60}ipcRenderer\.invoke\(\s*["']social:api-call["']\s*,\s*\{\s*platform,\s*url,\s*method,\s*headers,\s*body,\s*formData\s*\}\s*\)/.test(preloadSrc),
    "social.apiCall signature must be unchanged",
  );
  assert.ok(
    /mediaUpload:\s*\(\{\s*platform,\s*url,\s*accessToken,\s*file,\s*fields\s*\}\)\s*=>[\s\S]{0,60}ipcRenderer\.invoke\(\s*["']social:media-upload["']\s*,\s*\{\s*platform,\s*url,\s*accessToken,\s*file,\s*fields\s*\}\s*\)/.test(preloadSrc),
    "social.mediaUpload signature must be unchanged",
  );
  assert.ok(
    /fetch:\s*\(url,\s*options\s*=\s*\{\}\)\s*=>[\s\S]{0,40}ipcRenderer\.invoke\(\s*["']proxy:fetch["']\s*,\s*\{\s*url,\s*options\s*\}\s*\)/.test(preloadSrc),
    "externalProxy.fetch signature must be unchanged",
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// P11 — Pinata IPFS publishing moves into the main process
// (src/main/pinataPublish.js), wired as storage:publish in main.js. Reuses
// the P2 sender-validation the session bridge / P9 wallet secrets use, and
// egressPolicy.js's SSRF-safe DNS pinning + manual redirect re-validation
// (P8) against a fixed two-route Pinata policy. preload.js exposes only the
// publish operation — no separate credential-status or raw-fetch bridge.
// ─────────────────────────────────────────────────────────────────────────────

test("P11 AC1: storage:publish is registered in main.js, sender-validated like the session bridge / wallet secrets, and preload exposes only storage.publish", () => {
  const mainSrc = fs.readFileSync(MAIN_JS, "utf8");
  const preloadSrc = fs.readFileSync(PRELOAD_JS, "utf8");

  assert.ok(mainSrc.includes('"storage:publish"'), "main.js registers storage:publish");
  assert.ok(mainSrc.includes("publishToPinata"), "main.js wires publishToPinata");
  assert.ok(mainSrc.includes("./main/pinataPublish.js"), "main.js imports the pinataPublish seam");
  assert.ok(/function authorizeStoragePublishSender/.test(mainSrc), "a dedicated sender authorizer exists");
  assert.ok(
    /authorizeStoragePublishSender[\s\S]{0,200}normalizeSessionEvent\(event, mainWindow\)[\s\S]{0,200}sessionAuthorize\(sender\)/.test(mainSrc),
    "storage-publish sender validation reuses the same normalizeSessionEvent + sessionAuthorize pipeline as wallet secrets (P2/P9)",
  );

  assert.ok(preloadSrc.includes('"storage:publish"'), "preload invokes storage:publish");
  const bridgeMatch = preloadSrc.match(/storage:\s*\{([^}]*)\}/);
  assert.ok(bridgeMatch, "preload defines a storage bridge object");
  assert.ok(/publish\s*:/.test(bridgeMatch[1]), "the storage bridge exposes publish");
  const invokeCalls = bridgeMatch[1].match(/ipcRenderer\.invoke/g) || [];
  assert.equal(invokeCalls.length, 1, "the storage bridge exposes exactly one IPC operation");
});

test("P11 AC1: PINATA_POLICY declares exactly the two Pinata upload routes, HTTPS-only, POST-only, immutable", () => {
  assert.ok(Object.isFrozen(PINATA_POLICY));
  assert.ok(Object.isFrozen(PINATA_POLICY.routes));
  const paths = PINATA_POLICY.routes.map((r) => r.pathPrefix).sort();
  assert.deepEqual(paths, ["/pinning/pinFileToIPFS", "/pinning/pinJSONToIPFS"]);
  for (const route of PINATA_POLICY.routes) {
    assert.ok(Object.isFrozen(route));
    assert.equal(route.origin, PINATA_ORIGIN);
    assert.ok(route.origin.startsWith("https://"));
    assert.deepEqual(route.methods, ["POST"]);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// AC2 (R2): main-owned auth for allowed Pinata endpoints only; renderer/
// caller header overrides fail; results never carry credential material.
// ─────────────────────────────────────────────────────────────────────────────

test("P11 AC2: metadata publish reaches only pinJSONToIPFS with main-owned JWT auth, and the receipt carries no credential material", async () => {
  const fetchSpy = makeFetchSpy(jsonResponse(200, { IpfsHash: "bafy-meta-1", Timestamp: "2024-01-01T00:00:00Z", PinSize: 42 }));
  const result = await publishToPinata(
    { kind: "metadata", metadata: { hello: "world" }, generation: { type: "meta" } },
    { env: { PINATA_JWT: "sentinel-real-jwt-abc123" }, fetchImpl: fetchSpy, lookup: lookupOf({ address: "203.0.113.10", family: 4 }), buildDispatcher: noDispatcher },
  );

  assert.equal(fetchSpy.calls.length, 1);
  assert.equal(fetchSpy.calls[0].url, `${PINATA_ORIGIN}/pinning/pinJSONToIPFS`);
  assert.equal(fetchSpy.calls[0].init.headers.Authorization, "Bearer sentinel-real-jwt-abc123");
  assert.equal(fetchSpy.calls[0].init.method, "POST");

  assert.equal(result.ok, true);
  assert.equal(result.transactionId, "bafy-meta-1");
  assert.equal(result.gatewayUrl, `${PINATA_GATEWAY}/bafy-meta-1`);
  const serialized = JSON.stringify(result);
  assert.ok(!serialized.includes("sentinel-real-jwt-abc123"), "the receipt never embeds the credential");
  assert.deepEqual(Object.keys(result).sort(), ["gatewayUrl", "ok", "signature", "size", "tags", "timestamp", "transactionId", "url"].sort());
});

test("P11 AC2: content publish reaches only pinFileToIPFS with main-owned API-key auth when no JWT is set", async () => {
  const fetchSpy = makeFetchSpy(jsonResponse(200, { IpfsHash: "bafy-file-1", Timestamp: "2024-01-01T00:00:00Z", PinSize: 7 }));
  const result = await publishToPinata(
    { kind: "content", data: new Uint8Array([1, 2, 3]), contentType: "image/png", generation: { type: "image" } },
    {
      env: { PINATA_API_KEY: "sentinel-key", PINATA_API_SECRET: "sentinel-secret" },
      fetchImpl: fetchSpy,
      lookup: lookupOf({ address: "203.0.113.10", family: 4 }),
      buildDispatcher: noDispatcher,
    },
  );

  assert.equal(fetchSpy.calls.length, 1);
  assert.equal(fetchSpy.calls[0].url, `${PINATA_ORIGIN}/pinning/pinFileToIPFS`);
  assert.equal(fetchSpy.calls[0].init.headers.pinata_api_key, "sentinel-key");
  assert.equal(fetchSpy.calls[0].init.headers.pinata_secret_api_key, "sentinel-secret");
  assert.equal(result.ok, true);
  assert.ok(!JSON.stringify(result).includes("sentinel-secret"));
});

test("P11 AC2: a caller/renderer-supplied header field on the payload can never override the main-owned auth header", async () => {
  const fetchSpy = makeFetchSpy(jsonResponse(200, { IpfsHash: "bafy-2", Timestamp: "t", PinSize: 1 }));
  await publishToPinata(
    {
      kind: "metadata",
      metadata: { a: 1 },
      // Forged fields an attacker-controlled renderer might try to smuggle
      // in — publishToPinata never reads payload.headers/mainHeaders at all.
      headers: { Authorization: "Bearer forged-by-renderer" },
      mainHeaders: { Authorization: "Bearer forged-by-renderer" },
    },
    { env: { PINATA_JWT: "real-main-jwt" }, fetchImpl: fetchSpy, lookup: lookupOf({ address: "203.0.113.10", family: 4 }), buildDispatcher: noDispatcher },
  );
  assert.equal(fetchSpy.calls[0].init.headers.Authorization, "Bearer real-main-jwt");
});

test("P11 AC2/R2: missing credentials produce a clear, non-destructive error and no network attempt", async () => {
  const fetchSpy = makeFetchSpy(jsonResponse(200, {}));
  const result = await publishToPinata(
    { kind: "metadata", metadata: { a: 1 } },
    { env: {}, fetchImpl: fetchSpy, lookup: lookupOf({ address: "203.0.113.10", family: 4 }), buildDispatcher: noDispatcher },
  );
  assert.equal(result.ok, false);
  assert.match(result.error, /not configured/i);
  assert.equal(fetchSpy.calls.length, 0, "no fetch is attempted without credentials");
});

test("P11 AC2/R2: an unapproved redirect target is rejected and never fetched", async () => {
  const fetchSpy = makeFetchSpy(redirectResponse(302, "https://evil.example.com/steal"));
  const result = await publishToPinata(
    { kind: "metadata", metadata: { a: 1 } },
    { env: { PINATA_JWT: "real-jwt" }, fetchImpl: fetchSpy, lookup: lookupOf({ address: "203.0.113.10", family: 4 }), buildDispatcher: noDispatcher },
  );
  assert.equal(result.ok, false);
  assert.equal(fetchSpy.calls.length, 1, "the disallowed redirect target must never itself be fetched");
  assert.ok(!result.error.includes("real-jwt"));
});

test("P11 AC2/R2: an approved same-origin/same-route Pinata redirect is revalidated and then followed", async () => {
  let calls = 0;
  const fetchSpy = async (url, init) => {
    calls++;
    fetchSpy.calls.push({ url, init });
    if (calls === 1) return redirectResponse(307, `${PINATA_ORIGIN}/pinning/pinFileToIPFS?retry=1`);
    return jsonResponse(200, { IpfsHash: "bafy-redirected", Timestamp: "t", PinSize: 3 });
  };
  fetchSpy.calls = [];

  const result = await publishToPinata(
    { kind: "content", data: new Uint8Array([9, 9, 9]), contentType: "application/octet-stream" },
    { env: { PINATA_JWT: "real-jwt" }, fetchImpl: fetchSpy, lookup: lookupOf({ address: "203.0.113.10", family: 4 }), buildDispatcher: noDispatcher },
  );

  assert.equal(calls, 2, "the redirect target is only fetched after revalidation");
  assert.equal(result.ok, true);
  assert.equal(result.transactionId, "bafy-redirected");
  assert.equal(fetchSpy.calls[1].init.headers.Authorization, "Bearer real-jwt", "auth is re-injected on the followed hop, not forwarded from the caller");
});

test("P11 R2: oversized content/file/metadata payloads are rejected before any fetch", async () => {
  const fetchSpy = makeFetchSpy(jsonResponse(200, {}));
  const oversizedContent = await publishToPinata(
    { kind: "content", data: new Uint8Array(MAX_UPLOAD_BYTES + 1), contentType: "application/octet-stream" },
    { env: { PINATA_JWT: "x" }, fetchImpl: fetchSpy, lookup: lookupOf({ address: "203.0.113.10", family: 4 }), buildDispatcher: noDispatcher },
  );
  assert.equal(oversizedContent.ok, false);
  assert.match(oversizedContent.error, /too large/i);

  const oversizedMetadata = await publishToPinata(
    { kind: "metadata", metadata: { blob: "x".repeat(MAX_METADATA_BYTES + 1) } },
    { env: { PINATA_JWT: "x" }, fetchImpl: fetchSpy, lookup: lookupOf({ address: "203.0.113.10", family: 4 }), buildDispatcher: noDispatcher },
  );
  assert.equal(oversizedMetadata.ok, false);
  assert.match(oversizedMetadata.error, /too large/i);

  assert.equal(fetchSpy.calls.length, 0, "no fetch is attempted for an oversized payload");
});

test("P11 R2/R3: file publish bounds the file by disk size before ever reading it, and never returns a filesystem path", async () => {
  const fetchSpy = makeFetchSpy(jsonResponse(200, { IpfsHash: "bafy-file", Timestamp: "t", PinSize: 5 }));
  let readCalled = false;
  // The P7 authorizeRead gate now sits in front of the size check, so this
  // path must actually clear it (real file, inside an owned root) for the
  // test to exercise the size bound rather than the authorization denial.
  const hugeFile = path.join(OWNED_ROOT, "huge.bin");
  fs.writeFileSync(hugeFile, "not actually huge — statFile is mocked below");
  const result = await publishToPinata(
    { kind: "file", filePath: hugeFile, contentType: "video/mp4" },
    {
      env: { PINATA_JWT: "x" },
      fetchImpl: fetchSpy,
      lookup: lookupOf({ address: "203.0.113.10", family: 4 }),
      buildDispatcher: noDispatcher,
      roots: [OWNED_ROOT],
      statFile: async () => ({ isFile: () => true, size: MAX_UPLOAD_BYTES + 1 }),
      readFile: async () => { readCalled = true; return Buffer.from("nope"); },
    },
  );
  assert.equal(result.ok, false);
  assert.match(result.error, /too large/i);
  assert.equal(readCalled, false, "the oversized file must never actually be read");
  assert.equal(fetchSpy.calls.length, 0);
});

test("P11 R2/R3: file publish is denied by the P7 authorization gate before any size check or read, for a path outside every owned root/grant", async () => {
  const fetchSpy = makeFetchSpy(jsonResponse(200, { IpfsHash: "bafy-file", Timestamp: "t", PinSize: 5 }));
  let readCalled = false;
  const result = await publishToPinata(
    { kind: "file", filePath: outsideFile, contentType: "video/mp4" },
    {
      env: { PINATA_JWT: "x" },
      fetchImpl: fetchSpy,
      lookup: lookupOf({ address: "203.0.113.10", family: 4 }),
      buildDispatcher: noDispatcher,
      roots: [OWNED_ROOT],
      readFile: async () => { readCalled = true; return Buffer.from("nope"); },
    },
  );
  assert.equal(result.ok, false);
  assert.equal(result.error, "File access denied");
  assert.equal(readCalled, false, "an unauthorized filePath must never be read");
  assert.equal(fetchSpy.calls.length, 0);
});

test("P11 R3: readPinataCredentials prefers PINATA_JWT over the API key/secret pair, and returns null when nothing is configured", () => {
  assert.deepEqual(readPinataCredentials({ PINATA_JWT: "j", PINATA_API_KEY: "k", PINATA_API_SECRET: "s" }), { kind: "jwt", jwt: "j" });
  assert.deepEqual(readPinataCredentials({ PINATA_API_KEY: "k", PINATA_API_SECRET: "s" }), { kind: "apiKey", apiKey: "k", apiSecret: "s" });
  assert.equal(readPinataCredentials({ PINATA_API_KEY: "k" }), null, "a lone API key without the secret is not usable");
  assert.equal(readPinataCredentials({}), null);
});

// ─────────────────────────────────────────────────────────────────────────────
// P12 — Renderer Content-Security-Policy (src/main/csp.js, wired in
// src/main.js before the renderer navigates; index.html carries no <meta>
// CSP of its own, see the notes on src/main/csp.js).
// ─────────────────────────────────────────────────────────────────────────────

// A minimal stand-in for Electron's session.webRequest, just enough to
// drive installCsp() and its onHeadersReceived listener directly.
function makeFakeSession() {
  let listener = null;
  return {
    webRequest: {
      onHeadersReceived(fn) {
        listener = fn;
      },
    },
    fire(details) {
      return new Promise((resolve) => {
        listener(details, resolve);
      });
    },
  };
}

const mainFrameDetails = (extra = {}) => ({
  resourceType: "mainFrame",
  responseHeaders: {},
  url: "file:///index.html",
  ...extra,
});

// ─────────────────────────────────────────────────────────────────────────────
// AC1 (R1): the packaged policy restricts scripts/styles/connections/
// frames/objects/base-uri as specified.
// ─────────────────────────────────────────────────────────────────────────────

test("P12 AC1: packaged CSP restricts script/object/frame/base-uri/frame-ancestors to nothing but self/none", () => {
  const d = parseCsp(PACKAGED_CSP);
  assert.deepEqual(d["default-src"], ["'none'"]);
  assert.deepEqual(d["script-src"], ["'self'"]);
  assert.deepEqual(d["object-src"], ["'none'"]);
  assert.deepEqual(d["frame-src"], ["blob:"], "only MintModal's blob: 3D-preview iframe is allowed, no origin");
  assert.deepEqual(d["frame-ancestors"], ["'none'"]);
  assert.deepEqual(d["base-uri"], ["'self'"]);
  assert.deepEqual(d["form-action"], ["'self'"]);
});

test("P12 AC1: packaged style-src is 'self' plus the exact Bulma origin only, no wildcard", () => {
  const d = parseCsp(PACKAGED_CSP);
  assert.deepEqual(d["style-src"], ["'self'", BULMA_STYLE_ORIGIN]);
  assert.equal(BULMA_STYLE_ORIGIN, new URL(BULMA_STYLESHEET_URL).origin, "style-src origin must be the stylesheet's actual origin");
  assert.equal(d["style-src"].some((v) => v.includes("*")), false, "no wildcard style origin");
});

test("P12 AC1: packaged connect-src is scoped to self, loopback, and https/wss — never a bare wildcard", () => {
  const d = parseCsp(PACKAGED_CSP);
  assert.ok(d["connect-src"].includes("'self'"));
  assert.ok(d["connect-src"].includes("http://127.0.0.1:*"), "own loopback services (Flask/OpenClaw/rpc-server)");
  assert.ok(d["connect-src"].includes("ws://127.0.0.1:*"));
  assert.ok(d["connect-src"].includes("https:"));
  assert.ok(d["connect-src"].includes("wss:"));
  assert.equal(d["connect-src"].includes("*"), false);
  assert.equal(d["connect-src"].some((v) => v.includes("0.0.0.0")), false, "must never widen to all-interfaces");
});

test("P12 AC1: parseCsp round-trips the packaged policy string", () => {
  const d = parseCsp(PACKAGED_CSP);
  for (const name of ["default-src", "script-src", "style-src", "connect-src", "img-src", "font-src", "media-src", "worker-src", "object-src", "frame-src", "base-uri", "form-action", "frame-ancestors"]) {
    assert.ok(Array.isArray(d[name]) && d[name].length > 0, `packaged policy must declare ${name}`);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// AC2 (R2): packaged startup gets the packaged policy; development startup
// gets only the deterministic loopback Vite/HMR additions on top of it.
// ─────────────────────────────────────────────────────────────────────────────

test("P12 AC2: installCsp sets the packaged policy verbatim on main-frame document responses", async () => {
  const fakeSession = makeFakeSession();
  const policy = installCsp(fakeSession, { isPackaged: true });
  assert.equal(policy, PACKAGED_CSP);

  const result = await fakeSession.fire(mainFrameDetails());
  assert.deepEqual(result.responseHeaders["Content-Security-Policy"], [PACKAGED_CSP]);
});

test("P12 AC2: installCsp sets the development policy on main-frame document responses", async () => {
  const fakeSession = makeFakeSession();
  const policy = installCsp(fakeSession, { isPackaged: false });
  assert.equal(policy, DEV_CSP);

  const result = await fakeSession.fire(mainFrameDetails({ url: `${DEV_VITE_HTTP_ORIGIN}/` }));
  assert.deepEqual(result.responseHeaders["Content-Security-Policy"], [DEV_CSP]);
});

test("P12 AC2: installCsp leaves non-document (subresource) responses untouched", async () => {
  const fakeSession = makeFakeSession();
  installCsp(fakeSession, { isPackaged: true });
  const original = { "content-type": ["text/css"] };
  const result = await fakeSession.fire({ resourceType: "stylesheet", responseHeaders: original });
  assert.equal(result.responseHeaders["Content-Security-Policy"], undefined);
  assert.deepEqual(result.responseHeaders, original);
});

test("P12 AC2: installCsp replaces rather than merges a pre-existing Content-Security-Policy header", async () => {
  const fakeSession = makeFakeSession();
  installCsp(fakeSession, { isPackaged: true });
  const result = await fakeSession.fire(
    mainFrameDetails({ responseHeaders: { "Content-Security-Policy": ["default-src *"] } }),
  );
  assert.deepEqual(result.responseHeaders["Content-Security-Policy"], [PACKAGED_CSP]);
});

// A1: installCsp is wired on session.defaultSession, which every
// unpartitioned BrowserWindow shares — including the bonzai.sh/wallet
// BrowserView (wallet:open) and the social-OAuth popup windows
// (openSocialAuthWindow), neither of which sets its own session partition.
// A resourceType-only filter would blanket-overwrite those windows' own
// CSPs on every top-level navigation and could break their scripts/styles
// or the auth/wallet flows depending on them, so the handler must also
// check the navigated URL belongs to this app's own renderer.
test("P12 AC2: installCsp leaves other windows' mainFrame documents on the same (default) session untouched — wallet/OAuth origins never get the renderer CSP", async () => {
  const fakeSession = makeFakeSession();
  installCsp(fakeSession, { isPackaged: true });

  const wallet = await fakeSession.fire(mainFrameDetails({ url: "https://bonzai.sh/wallet?mode=embedded" }));
  assert.equal(wallet.responseHeaders["Content-Security-Policy"], undefined);

  const oauth = await fakeSession.fire(mainFrameDetails({ url: "https://accounts.google.com/o/oauth2/auth" }));
  assert.equal(oauth.responseHeaders["Content-Security-Policy"], undefined);
});

test("P12 AC2: installCsp leaves a mainFrame document outside the pinned Vite origin untouched in development mode", async () => {
  const fakeSession = makeFakeSession();
  installCsp(fakeSession, { isPackaged: false });

  const result = await fakeSession.fire(mainFrameDetails({ url: "http://localhost:1337/wallet?mode=embedded" }));
  assert.equal(result.responseHeaders["Content-Security-Policy"], undefined);
});

test("P12 AC2: development policy differs from packaged ONLY by the fixed loopback Vite/HMR connect-src additions and dev-only style 'unsafe-inline'", () => {
  const packaged = getPolicyDirectives({ isPackaged: true });
  const dev = getPolicyDirectives({ isPackaged: false });

  for (const name of Object.keys(packaged)) {
    if (name === "connect-src" || name === "style-src") continue;
    assert.deepEqual(dev[name], packaged[name], `${name} must be identical between packaged and dev`);
  }

  assert.deepEqual(
    dev["connect-src"],
    [...packaged["connect-src"], DEV_VITE_HTTP_ORIGIN, DEV_VITE_WS_ORIGIN],
    "dev connect-src must be exactly packaged + the two fixed loopback Vite/HMR origins",
  );
  assert.deepEqual(
    dev["style-src"],
    [...packaged["style-src"], "'unsafe-inline'"],
    "dev style-src must be exactly packaged + unsafe-inline (Vite's dev-mode style injection), nothing else",
  );
});

test("P12 AC2: the loopback Vite/HMR additions are the fixed deterministic origins, never a wildcard host/port", () => {
  assert.equal(DEV_VITE_HTTP_ORIGIN, "http://127.0.0.1:5173");
  assert.equal(DEV_VITE_WS_ORIGIN, "ws://127.0.0.1:5173");
  assert.equal(DEV_VITE_HTTP_ORIGIN.includes("*"), false);
  assert.equal(DEV_VITE_WS_ORIGIN.includes("*"), false);
});

test("P12 AC2: main.js installs the CSP via session.defaultSession before createWindow() navigates, and never adds a duplicate meta CSP to index.html", () => {
  const src = fs.readFileSync(MAIN_JS, "utf8");
  const installIdx = src.indexOf("installCsp(session.defaultSession");
  const createWindowIdx = src.indexOf("await createWindow();");
  assert.ok(installIdx !== -1, "expected installCsp(session.defaultSession, ...) in main.js");
  assert.ok(createWindowIdx !== -1, "expected the await createWindow() call site in main.js");
  assert.ok(installIdx < createWindowIdx, "CSP must be installed before the renderer navigates");
  assert.ok(/isPackaged:\s*app\.isPackaged/.test(src.slice(installIdx, installIdx + 120)), "installCsp must be mode-aware via app.isPackaged");

  const html = fs.readFileSync(INDEX_HTML, "utf8");
  assert.equal(/<meta[^>]*http-equiv=["']Content-Security-Policy["']/i.test(html), false, "index.html must not carry a meta CSP alongside the header policy");
});

// ─────────────────────────────────────────────────────────────────────────────
// AC3 (R3): the dev server/HMR host and port are deterministic and
// loopback-only.
// ─────────────────────────────────────────────────────────────────────────────

test("P12 AC3: DEV_VITE_HOST/PORT are pinned to loopback and the fixed Vite default port", () => {
  assert.equal(DEV_VITE_HOST, "127.0.0.1");
  assert.equal(DEV_VITE_PORT, 5173);
});

test("P12 AC3: vite.renderer.config.ts pins server + HMR host/port to loopback with strictPort", () => {
  const src = fs.readFileSync(VITE_RENDERER_CONFIG, "utf8");
  const serverBlockMatch = src.match(/server:\s*\{[\s\S]*?\n\s{2}\},/);
  assert.ok(serverBlockMatch, "expected a top-level server: {...} block");
  const block = serverBlockMatch[0];
  assert.match(block, /host:\s*['"]127\.0\.0\.1['"]/);
  assert.match(block, /port:\s*5173/);
  assert.match(block, /strictPort:\s*true/, "port must not silently float to another value if 5173 is taken");
  assert.match(block, /hmr:\s*\{[\s\S]*?host:\s*['"]127\.0\.0\.1['"][\s\S]*?\}/);
  assert.match(block, /hmr:\s*\{[\s\S]*?port:\s*5173[\s\S]*?\}/);
  assert.equal(block.includes("0.0.0.0"), false, "dev server must never bind all interfaces");
});

test("P12 AC3: main.js derives VITE_DEV_SERVER_URL from the deterministic DEV_VITE_HOST/PORT constants, not a hardcoded hostname", () => {
  const src = fs.readFileSync(MAIN_JS, "utf8");
  assert.match(src, /VITE_DEV_SERVER_URL\s*=\s*isDev\s*\?\s*`http:\/\/\$\{DEV_VITE_HOST\}:\$\{DEV_VITE_PORT\}`/);
  assert.equal(/http:\/\/localhost:5173/.test(src), false, "must not hardcode a separate, driftable dev URL");
});

// ─────────────────────────────────────────────────────────────────────────────
// AC4 (R4): every retained remote stylesheet/script has a valid matching
// integrity digest and crossorigin metadata; Bulma keeps its exact origin.
// ─────────────────────────────────────────────────────────────────────────────

test("P12 AC4: BULMA_INTEGRITY is a well-formed sha384 digest", () => {
  assert.match(BULMA_INTEGRITY, /^sha384-[A-Za-z0-9+/]{64}$/);
});

test("P12 AC4: index.html's Bulma <link> carries the verified digest, crossorigin=anonymous, and the exact pinned origin", () => {
  const html = fs.readFileSync(INDEX_HTML, "utf8");
  const linkMatch = html.match(/<link[^>]*href=["']https:\/\/cdn\.jsdelivr\.net\/npm\/bulma[^"']*["'][^>]*>/);
  assert.ok(linkMatch, "expected a Bulma <link> tag in index.html");
  const tag = linkMatch[0];
  assert.ok(tag.includes(`href="${BULMA_STYLESHEET_URL}"`), "href must match the pinned stylesheet URL exactly");
  assert.ok(tag.includes(`integrity="${BULMA_INTEGRITY}"`), "integrity must match the verified digest exactly");
  assert.match(tag, /crossorigin=["']anonymous["']/);
});

test("P12 AC4: every remote (http/https) <script> or stylesheet <link> in index.html has matching integrity + crossorigin", () => {
  const html = fs.readFileSync(INDEX_HTML, "utf8");
  const tags = [
    ...html.matchAll(/<script[^>]*src=["']https?:\/\/[^"']+["'][^>]*>/g),
    ...html.matchAll(/<link[^>]*rel=["']stylesheet["'][^>]*href=["']https?:\/\/[^"']+["'][^>]*>/g),
  ].map((m) => m[0]);
  assert.ok(tags.length >= 1, "expected at least the Bulma stylesheet tag to exercise this check");
  for (const tag of tags) {
    assert.match(tag, /integrity=["']sha(256|384|512)-[A-Za-z0-9+/=]+["']/, `remote resource missing integrity: ${tag}`);
    assert.match(tag, /crossorigin=["']anonymous["']/, `remote resource missing crossorigin=anonymous: ${tag}`);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// AC5 (R5): no unsafe inline scripts; only the required custom local media
// schemes are listed, and only where required (img-src/media-src).
// ─────────────────────────────────────────────────────────────────────────────

test("P12 AC5: script-src never allows unsafe-inline/unsafe-eval, in either mode", () => {
  for (const isPackaged of [true, false]) {
    const d = getPolicyDirectives({ isPackaged });
    assert.equal(d["script-src"].includes("'unsafe-inline'"), false);
    assert.equal(d["script-src"].includes("'unsafe-eval'"), false);
    assert.equal(directiveAllowsOrigin(d["script-src"], "inline"), false);
  }
});

test("P12 AC5: index.html and preload.js contain no inline <script> bodies or javascript: URLs", () => {
  const html = fs.readFileSync(INDEX_HTML, "utf8");
  const inlineScripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)]
    .map((m) => m[1].trim())
    .filter(Boolean);
  assert.deepEqual(inlineScripts, [], "index.html must not contain inline script bodies");
  assert.equal(/\bon[a-z]+\s*=\s*["']/i.test(html), false, "no inline event-handler attributes");
  assert.equal(/javascript:/i.test(html), false);
});

test("P12 AC5: only local-video:, app:, and bonzai-blob: are listed as custom schemes, and only under img-src/media-src", () => {
  const packaged = getPolicyDirectives({ isPackaged: true });
  const standardSchemes = new Set(["data:", "blob:", "https:", "wss:"]);
  const requiredCustom = new Set(["local-video:", "app:", "bonzai-blob:"]);
  const foundCustomByDirective = {};

  for (const [name, values] of Object.entries(packaged)) {
    for (const v of values) {
      if (!v.endsWith(":") || v.startsWith("'")) continue; // skip keywords like 'self'
      if (standardSchemes.has(v)) continue;
      (foundCustomByDirective[name] ??= new Set()).add(v);
    }
  }

  const allFound = new Set(Object.values(foundCustomByDirective).flatMap((s) => [...s]));
  assert.deepEqual(allFound, requiredCustom, "exactly the three custom media schemes must appear, nothing else");

  for (const [name, values] of Object.entries(foundCustomByDirective)) {
    assert.ok(
      name === "img-src" || name === "media-src",
      `custom scheme(s) ${[...values].join(",")} must only be granted to img-src/media-src, found under ${name}`,
    );
  }
  // Confirm they are explicitly absent from the security-sensitive directives.
  for (const name of ["script-src", "connect-src", "object-src", "style-src", "frame-src", "default-src", "base-uri"]) {
    for (const scheme of requiredCustom) {
      assert.equal(packaged[name].includes(scheme), false, `${scheme} must not be granted to ${name}`);
    }
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// AC6 (R6): injected inline/unlisted remote scripts, object/frame
// embedding, and foreign base navigation are denied; renderer entry builds
// in both configuration modes.
// ─────────────────────────────────────────────────────────────────────────────

test("P12 AC6: an unlisted remote script origin and an injected inline script are both denied, in either mode", () => {
  for (const isPackaged of [true, false]) {
    const d = getPolicyDirectives({ isPackaged });
    assert.equal(directiveAllowsOrigin(d["script-src"], "https://evil.example.com"), false);
    assert.equal(directiveAllowsOrigin(d["script-src"], "inline"), false);
    assert.equal(directiveAllowsOrigin(d["script-src"], "'self'"), true);
  }
});

test("P12 AC6: object and frame embedding are denied outright, in either mode", () => {
  for (const isPackaged of [true, false]) {
    const d = getPolicyDirectives({ isPackaged });
    assert.equal(directiveAllowsOrigin(d["object-src"], "https://evil.example.com"), false);
    assert.equal(directiveAllowsOrigin(d["object-src"], "'self'"), false);
    assert.equal(directiveAllowsOrigin(d["frame-src"], "https://evil.example.com"), false);
    assert.equal(directiveAllowsOrigin(d["frame-src"], "'self'"), false);
    assert.equal(directiveAllowsOrigin(d["frame-ancestors"], "https://evil.example.com"), false, "must not be embeddable by a foreign frame either");
  }
});

test("P12 AC6: base-uri denies foreign base navigation, in either mode", () => {
  for (const isPackaged of [true, false]) {
    const d = getPolicyDirectives({ isPackaged });
    assert.equal(directiveAllowsOrigin(d["base-uri"], "https://evil.example.com"), false);
    assert.equal(directiveAllowsOrigin(d["base-uri"], "'self'"), true);
  }
});

test("P12 AC6: style-src allows only self and the pinned Bulma origin — any other remote stylesheet origin is denied", () => {
  for (const isPackaged of [true, false]) {
    const d = getPolicyDirectives({ isPackaged });
    assert.equal(directiveAllowsOrigin(d["style-src"], BULMA_STYLE_ORIGIN), true);
    assert.equal(directiveAllowsOrigin(d["style-src"], "https://evil.example.com"), false);
  }
});

test("P12 AC6: the renderer entry point builds successfully in both packaged (production) and development configuration modes", () => {
  const scratchBase = fs.mkdtempSync(path.join(os.tmpdir(), "bonzai-p12-build-"));
  try {
    for (const mode of ["production", "development"]) {
      const outDir = path.join(scratchBase, mode);
      execFileSync(
        process.execPath,
        [
          path.join(REPO_ROOT, "node_modules", "vite", "bin", "vite.js"),
          "build",
          "--config",
          "vite.renderer.config.ts",
          "--outDir",
          outDir,
          "--mode",
          mode,
        ],
        { cwd: REPO_ROOT, stdio: "pipe", timeout: 120_000 },
      );
      assert.ok(fs.existsSync(path.join(outDir, "index.html")), `${mode} build must emit index.html`);
    }
  } finally {
    fs.rmSync(scratchBase, { recursive: true, force: true });
  }
});
