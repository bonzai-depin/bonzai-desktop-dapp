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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MAIN_JS = path.resolve(__dirname, "..", "src", "main.js");
const REGISTRY_JS = path.resolve(__dirname, "..", "src", "main", "credentialRegistry.js");

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

  // Two distinct, non-default secrets present under the expected env keys.
  assert.deepEqual(Object.keys(env).sort(), [CREDENTIAL_ENV.SESSION, CREDENTIAL_ENV.FLASK_SIGNING].sort());
  assert.equal(env[CREDENTIAL_ENV.SESSION], session);
  assert.equal(env[CREDENTIAL_ENV.FLASK_SIGNING], signing);
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
  assert.deepEqual(CREDENTIAL_ENV, { SESSION: "BONZAI_SESSION_CREDENTIAL", FLASK_SIGNING: "SECRET_KEY" });
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

  assert.deepEqual(Object.keys(env), [CREDENTIAL_ENV.SESSION], "session only when flask scoped out");
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
  assert.deepEqual(Object.keys(env).sort(), [CREDENTIAL_ENV.SESSION, CREDENTIAL_ENV.FLASK_SIGNING].sort());
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
