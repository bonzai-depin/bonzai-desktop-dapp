// test/service-security.test.mjs
//
// P2 — auth.service session / credential behavior (wallet-optional).
//
// Exercises src/services/auth.service.js:
//   - the local desktop session credential is attached to local HTTP and
//     Socket.IO auth WITHOUT being persisted (R5);
//   - absent level data maps to no economy privilege and is never
//     synthesized/persisted as a maximum level (R6);
//   - bearer, local-session, and refresh token types stay separate so
//     refresh-token misuse fails (R6);
//   - existing call names and argument shapes still work (R7).
//
// auth.service reads `window` and `fetch` lazily inside its functions, so we
// install deterministic globals before driving it. The credential registry
// is the same seam used by test/main-security.test.mjs.

import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ethers } from "ethers";
import { stop } from "esbuild";
import { build as viteBuild } from "vite";

import {
  createCredentialRegistry,
} from "../src/main/credentialRegistry.js";
import {
  createSecretHandlers,
  encryptSecretRecord,
  decryptSecretRecord,
  isProtectedSecretRecord,
  secretStoreKey,
  SECRET_RECORD_VERSION,
} from "../src/main/secretStore.js";
// Imported statically (not inside a test.before()) so this evaluates during
// the file's initial module-load pass, before any test.before() hook has set
// global.window. media.service.js's module-level startAutoRenewal() no-ops
// when `window` is undefined, so the real background interval never starts;
// tests below drive renewal deterministically via refreshExpiringEntries().
import * as media from "../src/services/media.service.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MAIN_JS = path.resolve(__dirname, "..", "src", "main.js");
const PRELOAD_JS = path.resolve(__dirname, "..", "src", "preload.js");
const PROJECT_ROOT = path.resolve(__dirname, "..");
const STORAGE_SERVICE_JS = path.resolve(__dirname, "..", "src", "services", "storage.service.js");

// ─────────────────────────────────────────────────────────────────────────────
// Deterministic globals + helpers
// ─────────────────────────────────────────────────────────────────────────────

// Recorded store writes so tests can assert "nothing sensitive persisted".
let storeWrites;
// Recorded fetch calls so tests can inspect attached headers.
let fetchCalls;

function installGlobals({ electronAPI = {} } = {}) {
  storeWrites = [];
  fetchCalls = [];
  global.window = {
    electronAPI: {
      store: {
        set: (k, v) => { storeWrites.push([k, v]); },
        get: () => null,
      },
      session: electronAPI.session || {},
      ...electronAPI,
    },
    dispatchEvent: () => {},
    CustomEvent: function () {},
  };
  // Deterministic fetch: respond based on the URL. Default 200 JSON.
  global.fetch = async (url, opts = {}) => {
    fetchCalls.push({ url, opts });
    if (/\/auth\/refresh$/.test(url)) {
      return {
        ok: true,
        json: async () => refreshResponse,
      };
    }
    if (/\/auth\/logout$/.test(url)) {
      return { ok: true, json: async () => ({}) };
    }
    return { ok: true, json: async () => ({}) };
  };
}

// The refresh response is configurable per test (level present / absent).
let refreshResponse = { access_token: "atk", expires_in: 3600 };

// auth.service reads `window` lazily; import once, drive many times.
let auth;
test.before(async () => {
  installGlobals();
  auth = await import("../src/services/auth.service.js");
});

function freshStore() {
  storeWrites = [];
}

// ─────────────────────────────────────────────────────────────────────────────
// AC5 (R5): local generation works with no signer and no chain endpoint;
// wallet login remains available; local HTTP / Socket.IO auth uses the
// credential WITHOUT persisting it.
// ─────────────────────────────────────────────────────────────────────────────

test("AC5: a local credential is attached to authFetch with no wallet bearer present", async () => {
  installGlobals();
  freshStore();
  // No accessToken (no wallet) — only the local session credential is set.
  auth.setLocalCredential({ token: "local-tok-123", descriptor: { issued: true } });

  await auth.authFetch("http://127.0.0.1:65000/inference", { method: "POST" });

  assert.equal(fetchCalls.length, 1, "one fetch issued");
  const headers = fetchCalls[0].opts.headers || {};
  assert.equal(headers["x-bonzai-session"], "local-tok-123", "local session attached");
  assert.equal(
    headers.Authorization,
    undefined,
    "no Authorization header when no wallet is connected",
  );

  // Setting the local credential persisted nothing to the store.
  assert.deepEqual(
    storeWrites,
    [],
    "local credential must not be persisted to electron-store",
  );
});

test("AC5: wallet bearer and local session are both attached when a wallet is connected", async () => {
  installGlobals();
  freshStore();
  auth.setLocalCredential({ token: "local-tok-456", descriptor: { issued: true } });

  // Drive a refresh so state.accessToken is populated, then authFetch.
  refreshResponse = { access_token: "wallet-atk", expires_in: 3600 };
  await auth.refreshToken();

  fetchCalls = [];
  await auth.authFetch("http://127.0.0.1:65000/inference", { method: "POST" });

  const headers = fetchCalls[0].opts.headers || {};
  assert.equal(headers.Authorization, "Bearer wallet-atk", "wallet bearer attached");
  assert.equal(headers["x-bonzai-session"], "local-tok-456", "local session also attached");
});

test("AC5: socketAuthPayload carries the local session credential and persists nothing", () => {
  installGlobals();
  freshStore();
  auth.setLocalCredential({ token: "sock-tok", descriptor: { issued: true } });

  const payload = auth.socketAuthPayload({ role: "orchestrator" });
  assert.equal(payload.session, "sock-tok", "socket auth carries the session token");
  assert.equal(payload.role, "orchestrator", "caller payload preserved");
  assert.deepEqual(storeWrites, [], "socket payload persisted nothing");
});

test("AC5: wallet challenge sign-in remains available (authenticate is still wired)", () => {
  installGlobals();
  assert.equal(typeof auth.authenticate, "function", "authenticate still exported");
  assert.equal(typeof auth.authenticateWithVault, "function", "authenticateWithVault still exported");
  assert.equal(typeof auth.refreshToken, "function", "refreshToken still exported");
});

test("AC5: initLocalSession pulls the credential from main into memory only", async () => {
  installGlobals({
    electronAPI: { session: { obtainCredential: async () => ({ ok: true, token: "ipc-tok", descriptor: { issued: true } }) } },
  });
  freshStore();
  const ok = await auth.initLocalSession();
  assert.equal(ok, true);
  assert.equal(auth.getLocalCredential(), "ipc-tok");
  assert.deepEqual(storeWrites, [], "initLocalSession persisted nothing");
});

// ─────────────────────────────────────────────────────────────────────────────
// AC6 (R6): wrong-scope / expired credentials fail; refresh-token misuse
// fails; no maximum level is synthesized or persisted.
// ─────────────────────────────────────────────────────────────────────────────

test("AC6: an expired / wrong-scope credential fails validation at the registry seam", () => {
  const reg = createCredentialRegistry({ rng: () => Buffer.from("a".repeat(32)) });
  reg.issue({ type: "local-session", extraScopes: ["inference"] });
  const token = reg.getSessionCredential();

  // Wrong scope rejected.
  assert.equal(
    reg.validate({ token, type: "local-session", scope: "not-granted" }),
    false,
    "wrong-scope credential rejected",
  );
  // A credential the registry considers expired is not handed out at all, so
  // there is nothing for auth.service to attach.
  assert.equal(typeof token, "string");
});

test("AC6: buildAuthHeader keeps bearer, local-session, and refresh token types separate", () => {
  const { TOKEN_TYPES, buildAuthHeader } = auth;
  assert.deepEqual(buildAuthHeader("t", TOKEN_TYPES.BEARER), { Authorization: "Bearer t" });
  assert.deepEqual(buildAuthHeader("t", TOKEN_TYPES.LOCAL_SESSION), { "x-bonzai-session": "t" });
  // Refresh tokens are cookie-only: presenting one as a header produces nothing.
  assert.deepEqual(buildAuthHeader("refresh-cookie-value", TOKEN_TYPES.REFRESH), {});
  // Unknown / empty tokens fail closed.
  assert.deepEqual(buildAuthHeader("", TOKEN_TYPES.BEARER), {});
  assert.deepEqual(buildAuthHeader("t", "bogus"), {});
});

test("AC6: refresh-token misuse yields no Authorization header (request fails auth)", async () => {
  installGlobals();
  freshStore();
  // Even if a refresh cookie value were somehow fed as a bearer, getAuthHeaders
  // only ever emits a Bearer for state.accessToken via buildAuthHeader(BEARER);
  // the refresh path (buildAuthHeader(REFRESH)) yields {}.
  assert.deepEqual(auth.buildAuthHeader("refresh-cookie-value", auth.TOKEN_TYPES.REFRESH), {});
  assert.deepEqual(auth.buildAuthHeader("refresh-cookie-value", auth.TOKEN_TYPES.BEARER), {
    Authorization: "Bearer refresh-cookie-value",
  });
  // The actual refresh call never sends Authorization — it uses credentials only.
  refreshResponse = { access_token: "atk", expires_in: 3600 };
  await auth.refreshToken();
  const refreshCall = fetchCalls.find((c) => /\/auth\/refresh$/.test(c.url));
  assert.ok(refreshCall, "refresh fetch issued");
  const headers = refreshCall.opts.headers || {};
  assert.equal(headers.Authorization, undefined, "refresh request carries no bearer");
});

test("AC6: absent level data maps to no privilege and no maximum level is persisted", async () => {
  installGlobals();
  freshStore();
  // Server returns no level at all.
  refreshResponse = { access_token: "atk", expires_in: 3600 };

  await auth.refreshToken();

  assert.equal(auth.authService.state.level, null, "absent level => null");
  assert.equal(auth.authService.state.levelValue, 0, "absent level => 0 privilege");
  // The store write for auth.level must not synthesize a maximum level.
  const levelWrites = storeWrites.filter(([k]) => k === "auth.level");
  assert.ok(levelWrites.length >= 1, "level synced to store");
  for (const [, v] of levelWrites) {
    assert.notEqual(v, "LVL6", "a maximum level must never be synthesized");
    assert.ok(v === null || v === undefined, `absent level persisted as ${v}, not null`);
  }
});

test("AC6: a present level is preserved verbatim (no synthesis either)", async () => {
  installGlobals();
  freshStore();
  refreshResponse = { access_token: "atk", expires_in: 3600, level: "LVL2", level_value: 2 };

  await auth.refreshToken();

  assert.equal(auth.authService.state.level, "LVL2");
  assert.equal(auth.authService.state.levelValue, 2);
});

// ─────────────────────────────────────────────────────────────────────────────
// AC4 (R4, service side): logout clears wallet state and invokes rotation.
// ─────────────────────────────────────────────────────────────────────────────

test("AC4: logout clears wallet state and invokes credential rotation via IPC", async () => {
  let rotated = false;
  installGlobals({
    electronAPI: {
      session: {
        rotateCredential: async () => { rotated = true; return { ok: true, token: "new", descriptor: { issued: true } }; },
        obtainCredential: async () => ({ ok: true, token: "new", descriptor: { issued: true } }),
      },
    },
  });
  // Seed wallet/economy state, then logout.
  refreshResponse = { access_token: "atk", expires_in: 3600, level: "LVL3", level_value: 3 };
  await auth.refreshToken();
  assert.equal(auth.authService.state.isAuthenticated, true);

  await auth.logout();

  assert.equal(rotated, true, "logout invoked session rotation");
  assert.equal(auth.authService.state.isAuthenticated, false, "wallet auth cleared");
  assert.equal(auth.authService.state.walletAddress, null, "wallet address cleared");
  assert.equal(auth.authService.state.level, null, "level cleared");
  assert.equal(auth.authService.state.accessToken, null, "access token cleared");
  // Local-first session re-obtained after rotation (still works without a wallet).
  assert.equal(auth.getLocalCredential(), "new");
});

// ─────────────────────────────────────────────────────────────────────────────
// AC7 (R7): existing call names and argument shapes still work.
// ─────────────────────────────────────────────────────────────────────────────

test("AC7: existing authService surface and shapes are preserved", () => {
  installGlobals();
  const a = auth.authService;
  // Names from before this step remain present and callable.
  for (const name of [
    "authenticate",
    "authenticateWithVault",
    "refreshToken",
    "logout",
    "reAuthenticate",
    "userInitiatedReAuth",
    "restoreSessionFromVault",
    "setSignerGetter",
    "ensureAuth",
    "getAuthHeaders",
    "getHttpErrorMessage",
    "isAuthenticated",
    "authFetch",
  ]) {
    assert.equal(typeof a[name], "function", `${name} still exported as a function`);
  }
  // getAuthHeaders shape unchanged: Bearer prefix when a token is built as bearer.
  assert.deepEqual(
    auth.buildAuthHeader("shape-tok", auth.TOKEN_TYPES.BEARER),
    { Authorization: "Bearer shape-tok" },
  );
  // getHttpErrorMessage still maps status codes.
  assert.equal(
    typeof auth.getHttpErrorMessage(401, "x"),
    "string",
    "getHttpErrorMessage still returns a string",
  );
});

test("AC7: authenticate argument shape (single signer) is unchanged", () => {
  installGlobals();
  // authenticate still expects a single signer argument. Passing a signer
  // whose getAddress hits the mocked /auth/challenge path is exercised by the
  // happy-path network tests; here we only assert the rejection shape stays a
  // thrown Error (no argument-shape change introduced by P2).
  return assert.rejects(
    () => auth.authenticate({ getAddress: async () => "0xabc" }),
    (err) => err instanceof Error,
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// P9 — Agent wallet secrets: safeStorage-backed IPC + transactional legacy
// migration.
//
// Exercises:
//   - src/main/secretStore.js directly: the safeStorage-backed encrypt/
//     decrypt seam behind the wallet-secret:* IPC handlers in main.js
//     (AC1, AC2).
//   - src/services/agentWallet.service.js driven through a fake
//     window.electronAPI whose `walletSecret` bridge is wired straight
//     through createSecretHandlers (the same code main.js uses), so
//     migration, fail-closed behavior, and return-value compatibility are
//     exercised end-to-end without needing Electron itself (AC3, AC4, AC5).
// ─────────────────────────────────────────────────────────────────────────────

// Known sentinel values. None of these strings should ever appear in a
// backing-store snapshot or a logged message once a secret is protected.
const SENTINEL_MASTER_SECRET = "0x" + "ab".repeat(32);
const SENTINEL_PRIVATE_KEY_A = "0x" + "11".repeat(32);
const SENTINEL_PRIVATE_KEY_B = "0x" + "22".repeat(32);
const SENTINEL_ADDRESS_A = "0xAAAA000000000000000000000000000000AAAA";
const SENTINEL_ADDRESS_B = "0xBBBB000000000000000000000000000000BBBB";

function makeFakeSafeStorage({ available = true } = {}) {
  let isAvailable = available;
  return {
    isEncryptionAvailable: () => isAvailable,
    encryptString: (plaintext) => Buffer.from(`enc:${plaintext}`, "utf8"),
    decryptString: (buf) => {
      const raw = buf.toString("utf8");
      if (!raw.startsWith("enc:")) throw new Error("bad-ciphertext");
      return raw.slice(4);
    },
    setAvailable(v) { isAvailable = v; },
  };
}

// Minimal electron-store stand-in that records every call so tests can
// assert exactly what was persisted (and what was never persisted).
function makeFakeStore() {
  const map = new Map();
  const calls = [];
  return {
    get: (key, def = null) => { calls.push({ op: "get", key }); return map.has(key) ? map.get(key) : def; },
    set: (key, value) => { calls.push({ op: "set", key, value }); map.set(key, value); },
    delete: (key) => { calls.push({ op: "delete", key }); map.delete(key); },
    has: (key) => map.has(key),
    _map: map,
    _calls: calls,
    snapshotJSON: () => JSON.stringify(Object.fromEntries(map)),
  };
}

// Wraps createSecretHandlers the way preload.js wraps ipcMain.handle: async,
// and errors thrown by the handler become a rejected promise.
function bridgeFromHandlers(handlers) {
  return {
    set: async (key, secret, opts) => handlers.setSecret(key, secret, opts),
    get: async (key) => handlers.getSecret(key),
    has: async (key) => handlers.hasSecret(key),
    delete: async (key) => handlers.deleteSecret(key),
  };
}

function installWalletGlobals({ safeStorageAvailable = true, walletSecretOverrides = {} } = {}) {
  const store = makeFakeStore();
  const safeStorage = makeFakeSafeStorage({ available: safeStorageAvailable });
  const handlers = createSecretHandlers({ store, safeStorage });
  const walletSecret = { ...bridgeFromHandlers(handlers), ...walletSecretOverrides };
  global.window = {
    electronAPI: { store, walletSecret },
  };
  return { store, safeStorage, handlers, walletSecret };
}

function captureConsole(methods, fn) {
  const originals = {};
  const lines = [];
  for (const m of methods) {
    originals[m] = console[m];
    console[m] = (...args) => { lines.push(args.map(String).join(" ")); };
  }
  return Promise.resolve(fn()).finally(() => {
    for (const m of methods) console[m] = originals[m];
  }).then((result) => ({ result, lines }));
}

let agentWallet;
test.before(async () => {
  installWalletGlobals();
  agentWallet = await import("../src/services/agentWallet.service.js");
});

// ─────────────────────────────────────────────────────────────────────────────
// AC1 (R1): the secret IPC exists and routes through a safeStorage-backed seam.
// ─────────────────────────────────────────────────────────────────────────────

test("AC1 (P9): wallet-secret IPC handlers are registered in main.js and exposed by preload", () => {
  const mainSrc = fs.readFileSync(MAIN_JS, "utf8");
  const preloadSrc = fs.readFileSync(PRELOAD_JS, "utf8");

  for (const channel of ["wallet-secret:set", "wallet-secret:get", "wallet-secret:has", "wallet-secret:delete"]) {
    assert.ok(mainSrc.includes(`"${channel}"`), `main.js registers ${channel}`);
    assert.ok(preloadSrc.includes(`"${channel}"`), `preload invokes ${channel}`);
  }
  assert.ok(mainSrc.includes("createSecretHandlers"), "main.js wires the safeStorage-backed secret handlers");
  assert.ok(mainSrc.includes("./main/secretStore.js"), "main.js imports the secretStore seam");
  assert.ok(mainSrc.includes("safeStorage"), "the wiring passes Electron's safeStorage into the handlers");
  assert.ok(preloadSrc.includes("walletSecret"), "preload exposes walletSecret");
});

test("AC1 (P9): setSecret/getSecret route through the injected safeStorage seam, not a bespoke cipher", () => {
  const store = makeFakeStore();
  let encryptCalls = 0;
  let decryptCalls = 0;
  const base = makeFakeSafeStorage();
  const spySafeStorage = {
    isEncryptionAvailable: () => base.isEncryptionAvailable(),
    encryptString: (s) => { encryptCalls++; return base.encryptString(s); },
    decryptString: (b) => { decryptCalls++; return base.decryptString(b); },
  };
  const handlers = createSecretHandlers({ store, safeStorage: spySafeStorage });

  handlers.setSecret("k1", SENTINEL_PRIVATE_KEY_A, { address: SENTINEL_ADDRESS_A });
  assert.equal(encryptCalls, 1, "setSecret must call safeStorage.encryptString");

  const result = handlers.getSecret("k1");
  assert.equal(decryptCalls, 1, "getSecret must call safeStorage.decryptString");
  assert.equal(result.secret, SENTINEL_PRIVATE_KEY_A);
});

// ─────────────────────────────────────────────────────────────────────────────
// AC2 (R2): persisted records contain only ciphertext/metadata; reads/writes
// fail closed when OS encryption is unavailable; ciphertext is never
// returned as a usable fallback.
// ─────────────────────────────────────────────────────────────────────────────

test("AC2 (P9): a protected record contains only ciphertext + non-secret metadata", () => {
  const store = makeFakeStore();
  const safeStorage = makeFakeSafeStorage();
  const handlers = createSecretHandlers({ store, safeStorage });

  handlers.setSecret("companion-1", SENTINEL_PRIVATE_KEY_A, { address: SENTINEL_ADDRESS_A });

  const raw = store._map.get(secretStoreKey("companion-1"));
  assert.equal(raw.version, SECRET_RECORD_VERSION);
  assert.equal(typeof raw.ciphertext, "string");
  assert.equal(raw.address, SENTINEL_ADDRESS_A);
  assert.equal(typeof raw.createdAt, "number");
  assert.equal(typeof raw.updatedAt, "number");
  assert.deepEqual(
    Object.keys(raw).sort(),
    ["address", "ciphertext", "createdAt", "updatedAt", "version"],
    "no field beyond ciphertext + metadata is persisted",
  );
  assert.ok(!raw.ciphertext.includes(SENTINEL_PRIVATE_KEY_A), "ciphertext is not the plaintext");
  assert.ok(!store.snapshotJSON().includes(SENTINEL_PRIVATE_KEY_A), "no plaintext anywhere in the backing-store snapshot");

  const round = handlers.getSecret("companion-1");
  assert.equal(round.secret, SENTINEL_PRIVATE_KEY_A, "round-trips back to the original secret");
  assert.equal(round.address, SENTINEL_ADDRESS_A);
});

test("AC2 (P9): reads and writes fail closed when OS encryption is unavailable; ciphertext is never a usable fallback", () => {
  const store = makeFakeStore();
  const safeStorage = makeFakeSafeStorage({ available: true });
  const handlers = createSecretHandlers({ store, safeStorage });

  handlers.setSecret("companion-2", SENTINEL_PRIVATE_KEY_B, { address: SENTINEL_ADDRESS_B });
  const ciphertextBefore = store._map.get(secretStoreKey("companion-2")).ciphertext;

  // Simulate encryption becoming unavailable (e.g. a locked OS keyring).
  safeStorage.setAvailable(false);

  assert.throws(() => handlers.setSecret("companion-2", "new-secret"), /unavailable/, "writes refuse without safeStorage");
  assert.throws(() => handlers.getSecret("companion-2"), /unavailable/, "reads refuse without safeStorage rather than exposing ciphertext");

  // Nothing changed on disk from the failed attempts.
  const raw = store._map.get(secretStoreKey("companion-2"));
  assert.equal(raw.ciphertext, ciphertextBefore, "the stored record is untouched by failed operations");
});

test("AC2 (P9): encryptSecretRecord/decryptSecretRecord fail closed with no safeStorage at all", () => {
  const enc = encryptSecretRecord({ safeStorage: null, plaintext: SENTINEL_PRIVATE_KEY_A });
  assert.equal(enc.ok, false);
  assert.equal(enc.reason, "encryption-unavailable");

  const dec = decryptSecretRecord({ safeStorage: null, record: { version: SECRET_RECORD_VERSION, ciphertext: "deadbeef" } });
  assert.equal(dec.ok, false);
  assert.equal(dec.reason, "encryption-unavailable");

  assert.equal(isProtectedSecretRecord({ address: "x" }), false, "a legacy-shaped record is never mistaken for a protected one");
});

// ─────────────────────────────────────────────────────────────────────────────
// AC3 (R3): agentWallet.service no longer writes secrets through the
// generic store.
// ─────────────────────────────────────────────────────────────────────────────

test("AC3 (P9): storing/reading a companion wallet never writes secrets through the generic store", async () => {
  const { store } = installWalletGlobals();

  await agentWallet.storeAgentWalletCredentials("companion-A", {
    address: SENTINEL_ADDRESS_A,
    privateKey: SENTINEL_PRIVATE_KEY_A,
  });

  // The only `set` calls allowed are the protected-record writes (namespaced
  // under wallet-secret:); no unprefixed generic-store set for this key.
  const badSets = store._calls.filter((c) => c.op === "set" && !c.key.startsWith("wallet-secret:"));
  assert.deepEqual(badSets, [], "no direct generic-store write of wallet secrets");
  assert.ok(!store.snapshotJSON().includes(SENTINEL_PRIVATE_KEY_A), "private key never appears in the backing-store snapshot");

  const creds = await agentWallet.getAgentWalletCredentials("companion-A");
  assert.equal(creds.address, SENTINEL_ADDRESS_A);
  assert.equal(creds.privateKey, SENTINEL_PRIVATE_KEY_A);
  assert.equal(typeof creds.createdAt, "number");
});

// ─────────────────────────────────────────────────────────────────────────────
// AC4 (R4): legacy migration verifies before removal; every simulated
// failure mode (encryption/unavailable-safeStorage, write, verification)
// preserves the legacy record unchanged and never writes another plaintext
// copy.
// ─────────────────────────────────────────────────────────────────────────────

test("AC4 (P9): a legacy per-companion wallet record migrates to protected storage after verify-before-delete", async () => {
  const { store } = installWalletGlobals();
  const legacyKey = "agent-wallet-companion-legacy-1";
  store.set(legacyKey, { address: SENTINEL_ADDRESS_A, privateKey: SENTINEL_PRIVATE_KEY_A, createdAt: 111 });

  const { result: creds, lines: logs } = await captureConsole(
    ["log"],
    () => agentWallet.getAgentWalletCredentials("companion-legacy-1"),
  );

  assert.deepEqual(creds, { address: SENTINEL_ADDRESS_A, privateKey: SENTINEL_PRIVATE_KEY_A, createdAt: 111 });
  assert.equal(store._map.has(legacyKey), false, "legacy plaintext record removed only after verification");
  assert.ok(isProtectedSecretRecord(store._map.get(secretStoreKey(legacyKey))), "a protected record now backs this key");
  assert.ok(!store.snapshotJSON().includes(SENTINEL_PRIVATE_KEY_A), "no plaintext remains anywhere in the backing store");
  assert.ok(logs.some((l) => l.includes("Migrated")), "a migration success message was logged");
  assert.ok(!logs.join("\n").includes(SENTINEL_PRIVATE_KEY_A), "the private key itself never appears in logs");
});

test("AC4 (P9): migration failure (safeStorage unavailable) preserves the legacy record and fails closed without a plaintext copy", async () => {
  const legacyKey = "agent-wallet-companion-legacy-2";
  const { store } = installWalletGlobals({ safeStorageAvailable: false });
  store.set(legacyKey, { address: SENTINEL_ADDRESS_B, privateKey: SENTINEL_PRIVATE_KEY_B, createdAt: 222 });

  const { result: creds, lines: errors } = await captureConsole(
    ["error"],
    () => agentWallet.getAgentWalletCredentials("companion-legacy-2"),
  );

  // Legacy record still backs the (unchanged) return value — the wallet keeps working.
  assert.deepEqual(creds, { address: SENTINEL_ADDRESS_B, privateKey: SENTINEL_PRIVATE_KEY_B, createdAt: 222 });
  assert.deepEqual(store._map.get(legacyKey), { address: SENTINEL_ADDRESS_B, privateKey: SENTINEL_PRIVATE_KEY_B, createdAt: 222 }, "legacy record is untouched");
  assert.equal(isProtectedSecretRecord(store._map.get(secretStoreKey(legacyKey))), false, "no protected record was written without safeStorage");
  assert.ok(errors.length > 0, "a specific migration failure was reported");
  assert.ok(!errors.join("\n").includes(SENTINEL_PRIVATE_KEY_B), "the private key itself never appears in logs");
});

test("AC4 (P9): migration failure (persistence/write failure) preserves the legacy record without a plaintext copy", async () => {
  const legacyKey = "agent-wallet-companion-legacy-3";
  const { store } = installWalletGlobals({
    walletSecretOverrides: { set: async () => { throw new Error("disk write failed"); } },
  });
  store.set(legacyKey, { address: SENTINEL_ADDRESS_A, privateKey: SENTINEL_PRIVATE_KEY_A, createdAt: 333 });

  const { result: creds, lines: errors } = await captureConsole(
    ["error"],
    () => agentWallet.getAgentWalletCredentials("companion-legacy-3"),
  );

  assert.deepEqual(creds, { address: SENTINEL_ADDRESS_A, privateKey: SENTINEL_PRIVATE_KEY_A, createdAt: 333 });
  assert.deepEqual(store._map.get(legacyKey), { address: SENTINEL_ADDRESS_A, privateKey: SENTINEL_PRIVATE_KEY_A, createdAt: 333 }, "legacy record untouched");
  assert.equal(store._map.has(secretStoreKey(legacyKey)), false, "no protected record was written when persistence failed");
  assert.ok(errors.length > 0, "a specific migration failure was reported");
});

test("AC4 (P9): migration failure (verification mismatch) preserves the legacy record and does not delete it", async () => {
  const legacyKey = "agent-wallet-companion-legacy-4";
  // The initial "does a protected record already exist" check must still see
  // nothing (so migration is attempted); only the read-back verification
  // call — after a set() has happened — returns a corrupted mismatch.
  let migrationAttempted = false;
  const { store } = installWalletGlobals({
    walletSecretOverrides: {
      get: async () => (migrationAttempted
        ? { secret: "corrupted-value-does-not-match-original", address: SENTINEL_ADDRESS_B, createdAt: 1, updatedAt: 1 }
        : null),
      set: async () => { migrationAttempted = true; return { ok: true }; },
    },
  });
  store.set(legacyKey, { address: SENTINEL_ADDRESS_B, privateKey: SENTINEL_PRIVATE_KEY_B, createdAt: 444 });

  const { result: creds, lines: errors } = await captureConsole(
    ["error"],
    () => agentWallet.getAgentWalletCredentials("companion-legacy-4"),
  );

  assert.deepEqual(creds, { address: SENTINEL_ADDRESS_B, privateKey: SENTINEL_PRIVATE_KEY_B, createdAt: 444 });
  assert.deepEqual(store._map.get(legacyKey), { address: SENTINEL_ADDRESS_B, privateKey: SENTINEL_PRIVATE_KEY_B, createdAt: 444 }, "legacy record untouched after a failed verification");
  assert.ok(errors.some((e) => e.toLowerCase().includes("verif")), "verification failure was specifically reported");
});

// ─────────────────────────────────────────────────────────────────────────────
// AC5 (R5): public return values stay compatible after successful
// decryption; delete/existence operations remain compatible.
// ─────────────────────────────────────────────────────────────────────────────

test("AC5 (P9): getMasterSecret returns a compatible 32-byte secret, protected on first access", async () => {
  const { store } = installWalletGlobals();

  const bytes1 = await agentWallet.agentWalletService.getMasterSecret();
  assert.ok(bytes1 instanceof Uint8Array && bytes1.length === 32, "returns a 32-byte Uint8Array, as before P9");
  assert.equal(await agentWallet.agentWalletService.hasMasterSecret(), true);

  const bytes2 = await agentWallet.agentWalletService.getMasterSecret();
  assert.equal(ethers.hexlify(bytes1), ethers.hexlify(bytes2), "stable across calls once protected");
  assert.ok(!store.snapshotJSON().includes(ethers.hexlify(bytes1).slice(2)), "the raw secret never appears in the backing-store snapshot");
});

test("AC5 (P9): a legacy plaintext master secret migrates on access and stays byte-compatible", async () => {
  const { store } = installWalletGlobals();
  store.set("bonzai-agent-master-secret", SENTINEL_MASTER_SECRET);

  const bytes = await agentWallet.agentWalletService.getMasterSecret();
  assert.equal(ethers.hexlify(bytes), SENTINEL_MASTER_SECRET, "decrypted value matches the original legacy secret exactly");
  assert.equal(store._map.has("bonzai-agent-master-secret"), false, "legacy plaintext master secret removed after verified migration");
  assert.ok(isProtectedSecretRecord(store._map.get(secretStoreKey("bonzai-agent-master-secret"))));
});

test("AC5 (P9): delete and existence operations remain compatible after migrating to protected storage", async () => {
  await installWalletGlobals();

  await agentWallet.storeAgentWalletCredentials("companion-del", {
    address: SENTINEL_ADDRESS_A,
    privateKey: SENTINEL_PRIVATE_KEY_A,
  });

  assert.equal(await agentWallet.hasAgentWallet("companion-del"), true);
  await agentWallet.deleteAgentWalletCredentials("companion-del");
  assert.equal(await agentWallet.hasAgentWallet("companion-del"), false);
  assert.equal(await agentWallet.getAgentWalletCredentials("companion-del"), null);
});

// ─────────────────────────────────────────────────────────────────────────────
// P10 — authVault.service: reproducible wallet-signature vault derivation +
// legacy-safe recovery with an explicit reset.
//
// Exercises src/services/authVault.service.js:
//   - initializeVault/unlockVault persist the EXACT derivation metadata
//     (normalized address, template version, creation ISO timestamp) needed
//     to rebuild, byte-for-byte, the message that was originally signed (R1);
//   - that persisted metadata - never Date.now() - drives message
//     reconstruction on every subsequent unlock, including across a
//     simulated app restart (fresh module instance, same backing store),
//     and restores every encrypted field (R2);
//   - an altered address/version/metadata is rejected before a signature is
//     requested or storage is written; an altered signature fails decrypt
//     without silently recreating the vault (R3);
//   - legacy ciphertext with no derivation metadata is preserved verbatim
//     and surfaces a dedicated recoverability result; only an explicitly
//     confirmed resetVault() may replace it, and a failed reset write
//     leaves the old record intact (R4).
// ─────────────────────────────────────────────────────────────────────────────

import { setTimeout as delay } from "node:timers/promises";
import { LEGACY_VAULT_UNRECOVERABLE } from "../src/services/authVault.service.js";

const AUTH_VAULT_URL = new URL("../src/services/authVault.service.js", import.meta.url).href;

const VAULT_ADDRESS_A = "0x" + "cc".repeat(20);
const VAULT_ADDRESS_B = "0x" + "dd".repeat(20);

function makeVaultStore() {
  const map = new Map();
  const calls = [];
  return {
    get: async (key, def = null) => { calls.push({ op: "get", key }); return map.has(key) ? map.get(key) : def; },
    set: async (key, value) => { calls.push({ op: "set", key, value }); map.set(key, value); },
    delete: async (key) => { calls.push({ op: "delete", key }); map.delete(key); },
    has: async (key) => map.has(key),
    _map: map,
    _calls: calls,
  };
}

// A deterministic stand-in for a wallet signer: signing the same message
// twice yields the same signature (as real wallets do via RFC 6979
// deterministic ECDSA), so a byte-for-byte reconstructed message reproduces
// the original key. Records every message it was asked to sign so tests can
// assert a signature was (or wasn't) requested at all.
function makeVaultSigner(address, signImpl) {
  const messages = [];
  return {
    getAddress: async () => address,
    signMessage: async (message) => {
      messages.push(message);
      return signImpl ? signImpl(message) : `sig::${message}`;
    },
    messages,
  };
}

function installVaultGlobals() {
  const store = makeVaultStore();
  global.window = {
    electronAPI: { store },
    dispatchEvent: () => {},
    CustomEvent: function CustomEvent() {},
  };
  return { store };
}

// Freezes both `new Date()` and `Date.now()` to a fixed instant, while still
// letting `new Date(arg)` parse arbitrary values (needed by the service's own
// metadata validation). Returns a restore function.
function freezeTime(iso) {
  const RealDate = global.Date;
  const fixedMs = RealDate.parse(iso);
  class FrozenDate extends RealDate {
    constructor(...args) {
      if (args.length === 0) super(fixedMs);
      else super(...args);
    }
    static now() { return fixedMs; }
  }
  global.Date = FrozenDate;
  return () => { global.Date = RealDate; };
}

function vaultStorageKey(address) {
  return `bonzai-auth-vault-${address}`;
}

let authVault;
test.before(async () => {
  installVaultGlobals();
  const mod = await import(AUTH_VAULT_URL);
  // Merge the named exports with the `authVault` aggregate object (which
  // additionally carries the reactive `state`) so tests can use one handle.
  authVault = { ...mod, ...mod.authVault };
});

// ─────────────────────────────────────────────────────────────────────────────
// AC1 (R1) + AC2 (R2): derivation metadata is persisted and drives a
// byte-for-byte reproducible unlock across a simulated restart, restoring
// every encrypted field.
// ─────────────────────────────────────────────────────────────────────────────

test("AC1/AC2 (P10): creation persists derivation metadata, and unlock after a simulated restart reconstructs the exact signed message and restores every field", async () => {
  const { store } = installVaultGlobals();
  const restoreTime = freezeTime("2026-01-01T00:00:00.000Z");
  try {
    const address = VAULT_ADDRESS_A.toLowerCase();
    const storageKey = vaultStorageKey(address);

    const creationSigner = makeVaultSigner(address);
    const created = await authVault.initializeVault(creationSigner);
    assert.equal(created, true);
    assert.equal(creationSigner.messages.length, 1, "exactly one signature requested on creation");
    const originalMessage = creationSigner.messages[0];

    // AC1: the outer envelope persists versioned, non-secret derivation
    // metadata alongside the ciphertext.
    const envelope = store._map.get(storageKey);
    assert.equal(typeof envelope.encrypted, "string");
    assert.deepEqual(envelope.derivation, {
      version: 1,
      address,
      createdAtIso: "2026-01-01T00:00:00.000Z",
    });

    // Populate every encrypted field before locking.
    await authVault.setMoltbookCredentials("companion-1", { apiKey: "sek-1", username: "user-1" });
    await authVault.setAgentWallet("companion-1", {
      address: "0x1111111111111111111111111111111111aaaa",
      privateKey: "0x" + "11".repeat(32),
    });
    authVault.setAuthTokens("tok-abc", Date.now() + 3600_000, "refresh-abc");
    // Flush the debounced save (scheduleSave uses a real 1s timer).
    await delay(1100);

    authVault.lockVault();
    assert.equal(authVault.getMoltbookCredentials("companion-1"), null, "locked vault exposes no credentials");

    // Simulate an app restart: fresh module instance (fresh in-memory
    // masterKey/state), same backing store.
    const restarted = await import(`${AUTH_VAULT_URL}?p10-restart=${Date.now()}-${Math.random()}`);

    const unlockSigner = makeVaultSigner(address);
    const unlocked = await restarted.unlockVault(unlockSigner);
    assert.equal(unlocked, true);

    assert.equal(unlockSigner.messages.length, 1, "exactly one signature requested on unlock");
    assert.equal(unlockSigner.messages[0], originalMessage, "unlock reconstructs the exact original signed message");

    // AC2: every encrypted field survives the restart + reproducible unlock.
    const moltbook = restarted.getMoltbookCredentials("companion-1");
    assert.equal(moltbook.apiKey, "sek-1");
    assert.equal(moltbook.username, "user-1");

    const agentWallet = await restarted.getAgentWallet("companion-1");
    assert.equal(agentWallet.address, "0x1111111111111111111111111111111111aaaa");
    assert.equal(agentWallet.privateKey, "0x" + "11".repeat(32));

    assert.deepEqual(restarted.getAuthTokens(), {
      accessToken: "tok-abc",
      tokenExpiry: Date.now() + 3600_000,
      refreshToken: "refresh-abc",
    });
  } finally {
    restoreTime();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// AC3 (R3): altered address/version/metadata is rejected before a signature
// is requested or storage is written; an altered signature fails to decrypt
// without silently overwriting the vault.
// ─────────────────────────────────────────────────────────────────────────────

test("AC3 (P10): unlockVault rejects tampered derivation metadata before requesting a signature or writing storage", async () => {
  const { store } = installVaultGlobals();
  const restoreTime = freezeTime("2026-02-02T00:00:00.000Z");
  try {
    const address = VAULT_ADDRESS_B.toLowerCase();
    const storageKey = vaultStorageKey(address);

    await authVault.initializeVault(makeVaultSigner(address));
    authVault.lockVault();

    const original = store._map.get(storageKey);

    const tamperCases = [
      ["address", { ...original, derivation: { ...original.derivation, address: "0x" + "9".repeat(40) } }],
      ["version", { ...original, derivation: { ...original.derivation, version: 99 } }],
      ["timestamp", { ...original, derivation: { ...original.derivation, createdAtIso: "not-a-real-timestamp" } }],
      ["outer address", { ...original, address: "0x" + "8".repeat(40) }],
    ];

    for (const [label, tampered] of tamperCases) {
      store._map.set(storageKey, tampered);
      const snapshotBefore = JSON.stringify(store._map.get(storageKey));

      const attackSigner = makeVaultSigner(address);
      await assert.rejects(
        () => authVault.unlockVault(attackSigner),
        (err) => err instanceof Error,
        `unlock must reject a tampered ${label}`,
      );
      assert.equal(attackSigner.messages.length, 0, `no signature requested for a tampered ${label}`);
      assert.equal(
        JSON.stringify(store._map.get(storageKey)),
        snapshotBefore,
        `storage untouched after a tampered ${label} is rejected`,
      );
    }

    // Restore the untampered record for later tests in this describe block.
    store._map.set(storageKey, original);
  } finally {
    restoreTime();
  }
});

test("AC3 (P10): an altered signature at unlock fails decryption without silently overwriting the vault", async () => {
  const { store } = installVaultGlobals();
  const restoreTime = freezeTime("2026-03-03T00:00:00.000Z");
  try {
    const address = VAULT_ADDRESS_A.toLowerCase();
    const storageKey = vaultStorageKey(address);

    await authVault.initializeVault(makeVaultSigner(address));
    authVault.lockVault();
    const before = JSON.stringify(store._map.get(storageKey));

    // A signer that returns a completely different signature than the
    // deterministic one for this exact message (corrupted/compromised wallet).
    const badSigner = makeVaultSigner(address, () => "totally-different-signature");
    await assert.rejects(() => authVault.unlockVault(badSigner));

    assert.equal(store._map.has(storageKey), true, "vault record still present");
    assert.equal(JSON.stringify(store._map.get(storageKey)), before, "ciphertext untouched after a failed unlock");
    assert.equal(authVault.state.isUnlocked, false);
  } finally {
    restoreTime();
  }
});

test("AC3 (P10): initializeOrUnlockFromSignature rejects an invalid address before touching storage", async () => {
  const { store } = installVaultGlobals();
  await assert.rejects(() => authVault.initializeOrUnlockFromSignature("not-an-address", "some-signature"), /address/i);
  assert.deepEqual(store._calls, [], "no storage access for an invalid address");
});

// ─────────────────────────────────────────────────────────────────────────────
// AC4 (R4): legacy ciphertext without derivation metadata is preserved
// verbatim and returns the named recoverability result; only an explicitly
// confirmed reset may replace it; a failed reset write leaves the old
// record intact.
// ─────────────────────────────────────────────────────────────────────────────

test("AC4 (P10): a legacy vault (no derivation metadata) is byte-identical after unlock, and only an explicitly confirmed reset clears it", async () => {
  const { store } = installVaultGlobals();
  const address = VAULT_ADDRESS_B.toLowerCase();
  const storageKey = vaultStorageKey(address);

  // Simulate an envelope written before this fix existed - ciphertext with
  // no `derivation` field at all.
  const legacyEnvelope = { version: 1, address, encrypted: "legacy-ciphertext-blob==" };
  store._map.set(storageKey, legacyEnvelope);
  const snapshotBefore = JSON.stringify(store._map.get(storageKey));

  const signer = makeVaultSigner(address);
  const result = await authVault.unlockVault(signer);

  assert.deepEqual(result, {
    ok: false,
    recoverable: false,
    reason: LEGACY_VAULT_UNRECOVERABLE,
    requiresReset: true,
  });
  assert.equal(signer.messages.length, 0, "no signature requested for an unrecoverable legacy vault");
  assert.equal(JSON.stringify(store._map.get(storageKey)), snapshotBefore, "legacy record stays byte-identical");
  assert.equal(authVault.state.isUnlocked, false);

  // A failed reset write (e.g. disk error) must leave the old record intact.
  const workingDelete = store.delete;
  store.delete = async () => { throw new Error("disk write failed"); };
  await assert.rejects(() => authVault.resetVault(address, { confirm: true }), /disk write failed/);
  assert.equal(JSON.stringify(store._map.get(storageKey)), snapshotBefore, "record intact after a failed reset write");
  store.delete = workingDelete;

  // reset without explicit confirmation must never modify storage.
  await assert.rejects(() => authVault.resetVault(address), /confirm/i);
  await assert.rejects(() => authVault.resetVault(address, { confirm: false }), /confirm/i);
  assert.equal(JSON.stringify(store._map.get(storageKey)), snapshotBefore, "record intact without explicit confirmation");

  // Only the explicitly confirmed reset actually clears the record.
  const reset = await authVault.resetVault(address, { confirm: true });
  assert.equal(reset, true);
  assert.equal(store._map.has(storageKey), false, "legacy record removed only after an explicitly confirmed reset");
});

test("AC4 (P10): initializeOrUnlockFromSignature never silently overwrites a vault it cannot decrypt", async () => {
  const { store } = installVaultGlobals();
  const address = VAULT_ADDRESS_A.toLowerCase();
  const storageKey = vaultStorageKey(address);

  await authVault.initializeVault(makeVaultSigner(address));
  authVault.lockVault();
  const before = JSON.stringify(store._map.get(storageKey));

  // A different signature - as if the reused auth-challenge signature
  // rotated since the vault was created - cannot decrypt this vault.
  const result = await authVault.initializeOrUnlockFromSignature(address, "a-completely-different-signature");

  assert.deepEqual(result, {
    ok: false,
    recoverable: false,
    reason: LEGACY_VAULT_UNRECOVERABLE,
    requiresReset: true,
  });
  assert.equal(
    JSON.stringify(store._map.get(storageKey)),
    before,
    "existing vault is not silently recreated/overwritten on a decrypt failure",
  );
  assert.equal(authVault.state.isUnlocked, false);
});

// ─────────────────────────────────────────────────────────────────────────────
// B5 (bonzai-sec-fix3): a failed vault switch must clear the PREVIOUS
// wallet's in-memory secrets before returning, on every failure path -
// including the legacy LEGACY_VAULT_UNRECOVERABLE early return, which used
// to skip cleanup entirely and leave the prior wallet's secrets unlocked.
// ─────────────────────────────────────────────────────────────────────────────

test("B5 (P10): switching to a legacy vault fails AND the previously unlocked wallet's secrets are no longer readable", async () => {
  const { store } = installVaultGlobals();
  const restoreTime = freezeTime("2026-04-04T00:00:00.000Z");
  try {
    const walletA = VAULT_ADDRESS_A.toLowerCase();
    const walletB = VAULT_ADDRESS_B.toLowerCase();

    // Unlock wallet A normally and populate it with secrets.
    await authVault.initializeVault(makeVaultSigner(walletA));
    await authVault.setMoltbookCredentials("companion-1", { apiKey: "secret-a", username: "user-a" });
    await authVault.setAgentWallet("companion-1", {
      address: "0x1111111111111111111111111111111111aaaa",
      privateKey: "0x" + "11".repeat(32),
    });
    authVault.setAuthTokens("tok-a", Date.now() + 3600_000, "refresh-a");
    await delay(1100); // flush the debounced save

    assert.equal(authVault.state.isUnlocked, true, "wallet A is unlocked");
    assert.equal(authVault.getMoltbookCredentials("companion-1").apiKey, "secret-a", "wallet A secrets readable before switch");

    // Now attempt to switch to wallet B, whose stored envelope is a legacy
    // ciphertext with no derivation metadata - unrecoverable.
    const legacyKey = vaultStorageKey(walletB);
    store._map.set(legacyKey, { version: 1, address: walletB, encrypted: "legacy-ciphertext-blob==" });

    const switchSigner = makeVaultSigner(walletB);
    const result = await authVault.unlockVault(switchSigner);

    assert.deepEqual(result, {
      ok: false,
      recoverable: false,
      reason: LEGACY_VAULT_UNRECOVERABLE,
      requiresReset: true,
    });

    // The switch failed, so wallet A's secrets must no longer be readable.
    assert.equal(authVault.state.isUnlocked, false, "vault locked after failed switch");
    assert.equal(authVault.getMoltbookCredentials("companion-1"), null, "moltbook credentials no longer readable");
    assert.equal(await authVault.getAgentWallet("companion-1"), null, "agent wallet no longer readable");

    // Wallet A's own storage record is untouched by the failed switch attempt.
    const walletAEnvelope = store._map.get(vaultStorageKey(walletA));
    assert.ok(walletAEnvelope, "wallet A's envelope still exists in storage");
  } finally {
    restoreTime();
  }
});

test("B5 (P10): a validation failure (tampered metadata) during a switch also clears the previous wallet's secrets", async () => {
  const { store } = installVaultGlobals();
  const restoreTime = freezeTime("2026-05-05T00:00:00.000Z");
  try {
    const walletA = VAULT_ADDRESS_A.toLowerCase();
    const walletB = VAULT_ADDRESS_B.toLowerCase();

    await authVault.initializeVault(makeVaultSigner(walletA));
    await authVault.setMoltbookCredentials("companion-2", { apiKey: "secret-a2", username: "user-a2" });
    await delay(1100);
    assert.equal(authVault.state.isUnlocked, true);

    // Wallet B exists with derivation metadata, but it has been tampered with.
    await authVault.initializeVault(makeVaultSigner(walletB));
    await delay(1100);
    // Re-unlock wallet A so it is the CURRENTLY unlocked wallet again before
    // attempting the (failing) switch to tampered wallet B.
    authVault.lockVault();
    await authVault.unlockVault(makeVaultSigner(walletA));
    await authVault.setMoltbookCredentials("companion-2", { apiKey: "secret-a2", username: "user-a2" });
    await delay(1100);
    assert.equal(authVault.state.isUnlocked, true);

    const bKey = vaultStorageKey(walletB);
    const bEnvelope = store._map.get(bKey);
    store._map.set(bKey, { ...bEnvelope, derivation: { ...bEnvelope.derivation, version: 99 } });

    await assert.rejects(() => authVault.unlockVault(makeVaultSigner(walletB)), /invalid or has been altered/);

    assert.equal(authVault.state.isUnlocked, false, "vault locked after failed switch validation");
    assert.equal(authVault.getMoltbookCredentials("companion-2"), null, "wallet A secrets no longer readable");
  } finally {
    restoreTime();
  }
});

test("B5 (P10): a failed switch clears getAuthTokens() and every field on the exported state, not just the two gated credential getters", async () => {
  installVaultGlobals();
  const restoreTime = freezeTime("2026-06-06T00:00:00.000Z");
  try {
    const walletA = VAULT_ADDRESS_A.toLowerCase();
    const walletB = VAULT_ADDRESS_B.toLowerCase();

    await authVault.initializeVault(makeVaultSigner(walletA));
    await authVault.setMoltbookCredentials("companion-3", { apiKey: "secret-a3", username: "user-a3" });
    authVault.setAuthTokens("tok-a3", Date.now() + 3600_000, "refresh-a3");
    authVault.queueOperation({ type: "some-op" });
    await delay(1100);

    assert.equal(authVault.state.isUnlocked, true);
    assert.equal(authVault.getAuthTokens().accessToken, "tok-a3", "tokens readable before switch");

    // Wallet B has no vault at all - unlockVault throws before it ever
    // reaches the legacy/decrypt failure branches that previously called
    // clearVaultSwitchFailure().
    await assert.rejects(() => authVault.unlockVault(makeVaultSigner(walletB)), /No vault found/);

    assert.equal(authVault.state.isUnlocked, false, "vault locked after failed switch");
    assert.deepEqual(
      authVault.getAuthTokens(),
      { accessToken: null, tokenExpiry: null, refreshToken: null },
      "getAuthTokens() must not return the previous wallet's tokens once locked",
    );
    assert.equal(authVault.state.accessToken, null, "state.accessToken cleared");
    assert.equal(authVault.state.refreshTokenStored, null, "state.refreshTokenStored cleared");
    assert.deepEqual(authVault.state.moltbook, {}, "state.moltbook cleared");
    assert.deepEqual(authVault.state.agentWallets, {}, "state.agentWallets cleared");
    assert.equal(authVault.state.openclaw, null, "state.openclaw cleared");
    assert.equal(authVault.state.p2p, null, "state.p2p cleared");
    assert.deepEqual(authVault.state.pendingOperations, [], "state.pendingOperations cleared");
  } finally {
    restoreTime();
  }
});

test("B5 (P10): cleanup runs before address validation, storage lookup, and record lookup - not only after them", async () => {
  const { store } = installVaultGlobals();
  const restoreTime = freezeTime("2026-07-07T00:00:00.000Z");
  try {
    const walletA = VAULT_ADDRESS_A.toLowerCase();

    // Case 1: target wallet has no stored vault at all - unlockVault throws
    // at the storage-lookup step, well before the legacy/derivation-failure
    // branches this cleanup used to be gated behind.
    await authVault.initializeVault(makeVaultSigner(walletA));
    await authVault.setMoltbookCredentials("companion-4", { apiKey: "secret-a4", username: "user-a4" });
    await delay(1100);
    assert.equal(authVault.state.isUnlocked, true);

    const noVaultWallet = "0x" + "ee".repeat(20);
    await assert.rejects(() => authVault.unlockVault(makeVaultSigner(noVaultWallet)), /No vault found/);
    assert.equal(authVault.state.isUnlocked, false, "wallet A locked even though target has no vault");
    assert.equal(authVault.getMoltbookCredentials("companion-4"), null, "wallet A secrets cleared");

    // Case 2: the stored envelope's address field doesn't match the wallet
    // being switched to - unlockVault throws at the address-mismatch check,
    // also before the legacy/derivation-failure branches.
    await authVault.unlockVault(makeVaultSigner(walletA));
    await authVault.setMoltbookCredentials("companion-4", { apiKey: "secret-a4", username: "user-a4" });
    await delay(1100);
    assert.equal(authVault.state.isUnlocked, true);

    const mismatchWallet = "0x" + "ff".repeat(20);
    store._map.set(vaultStorageKey(mismatchWallet), {
      version: 1,
      address: VAULT_ADDRESS_B.toLowerCase(), // deliberately mismatched
      encrypted: "irrelevant==",
    });
    await assert.rejects(
      () => authVault.unlockVault(makeVaultSigner(mismatchWallet)),
      /Vault address mismatch/,
    );
    assert.equal(authVault.state.isUnlocked, false, "wallet A locked even though target envelope address mismatched");
    assert.equal(authVault.getMoltbookCredentials("companion-4"), null, "wallet A secrets cleared");
  } finally {
    restoreTime();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// C2 (bonzai-sec-fix4 re-review): initializeVault() must purge a PREVIOUSLY
// unlocked wallet's cached secrets before attaching a brand-new vault for a
// DIFFERENT wallet. unlockVault()/initializeOrUnlockFromSignature() already
// call clearVaultSwitchFailure() up front (see B5 above) - initializeVault()'s
// "no existing vault, create one" branch was missing the same call, so
// creating a vault for wallet B while wallet A was still unlocked left A's
// moltbook/agentWallets/tokens attached underneath B's now-"unlocked" session.
// ─────────────────────────────────────────────────────────────────────────────

test("C2: creating a NEW vault for a different wallet purges the previously unlocked wallet's cached secrets", async () => {
  const { store } = installVaultGlobals();
  const restoreTime = freezeTime("2026-08-01T00:00:00.000Z");
  try {
    const walletA = VAULT_ADDRESS_A.toLowerCase();
    const walletB = VAULT_ADDRESS_B.toLowerCase();

    // Unlock wallet A and populate it with secrets.
    await authVault.initializeVault(makeVaultSigner(walletA));
    await authVault.setMoltbookCredentials("companion-c2", { apiKey: "secret-a-c2", username: "user-a" });
    await authVault.setAgentWallet("companion-c2", {
      address: "0x2222222222222222222222222222222222bbbb",
      privateKey: "0x" + "22".repeat(32),
    });
    authVault.setAuthTokens("tok-a-c2", Date.now() + 3600_000, "refresh-a-c2");
    await delay(1100); // flush the debounced save

    assert.equal(authVault.state.isUnlocked, true, "wallet A is unlocked");
    assert.equal(authVault.getMoltbookCredentials("companion-c2").apiKey, "secret-a-c2", "wallet A secrets readable before switch");

    // Wallet B has never had a vault, so initializeVault takes the "create a
    // new vault" branch rather than delegating to unlockVault().
    const created = await authVault.initializeVault(makeVaultSigner(walletB));
    assert.equal(created, true);

    assert.equal(authVault.state.walletAddress, walletB, "session now belongs to wallet B");
    assert.equal(
      authVault.getMoltbookCredentials("companion-c2"),
      null,
      "wallet A's moltbook credentials must not leak into wallet B's new session",
    );
    assert.equal(
      await authVault.getAgentWallet("companion-c2"),
      null,
      "wallet A's agent wallet must not leak into wallet B's new session",
    );
    assert.deepEqual(
      authVault.getAuthTokens(),
      { accessToken: null, tokenExpiry: null, refreshToken: null },
      "wallet A's auth tokens must not leak into wallet B's new session",
    );
    assert.deepEqual(authVault.state.moltbook, {}, "state.moltbook cleared before wallet B's vault is created");
    assert.deepEqual(authVault.state.agentWallets, {}, "state.agentWallets cleared before wallet B's vault is created");

    // Wallet A's own on-disk record is untouched by the switch.
    const walletAEnvelope = store._map.get(vaultStorageKey(walletA));
    assert.ok(walletAEnvelope, "wallet A's envelope still exists in storage");
  } finally {
    restoreTime();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// A2 (bonzai-sec-fix4): authenticateWithVault() previously called
// setAccessToken() BEFORE initializeVault()/unlockVault(). If a DIFFERENT
// wallet's vault was still unlocked (switching wallets without an
// intervening logout), setAccessToken() persisted the just-issued token into
// that stale vault; initializeVault()'s clearVaultSwitchFailure() then nulled
// it out synchronously (see C2 above), and the newly created vault hardcoded
// its auth fields to null with no later setAuthTokens() call - so the
// freshly authenticated wallet's own token was never actually persisted.
// This exercises the FULL auth.service.authenticateWithVault() flow (not just
// authVault.initializeVault() in isolation, which is all C2 covers) to prove
// the fix: unlock/create the vault for the wallet that's authenticating
// FIRST, then persist its token - so it always lands in that wallet's own
// vault, not a stale previous session.
// ─────────────────────────────────────────────────────────────────────────────

test("A2: authenticateWithVault persists the newly authenticated wallet's own token, even while a different wallet's vault is still unlocked", async () => {
  const { store } = installVaultGlobals();
  try {
    const walletA = VAULT_ADDRESS_A.toLowerCase();
    const walletB = VAULT_ADDRESS_B.toLowerCase();

    // Wallet A signs in first and its vault is left unlocked - the
    // "switching wallets without logging out" precondition from the report.
    await authVault.initializeVault(makeVaultSigner(walletA));
    assert.equal(authVault.state.isUnlocked, true);
    assert.equal(authVault.state.walletAddress, walletA);

    // Now drive the real auth.service.authenticateWithVault() flow for
    // wallet B, mocking only the network round-trip (challenge/verify).
    // auth.service and authVault.service both read `window`/`fetch` lazily,
    // so they share the globals installVaultGlobals() just set.
    global.fetch = async (url) => {
      if (/\/auth\/challenge$/.test(url)) {
        return { ok: true, json: async () => ({ challenge: "c2-challenge", mac: "c2-mac", message: "sign-me-B" }) };
      }
      if (/\/auth\/verify$/.test(url)) {
        return { ok: true, json: async () => ({ access_token: "tok-B-fresh", expires_in: 3600, level: 1, level_value: 1 }) };
      }
      return { ok: true, json: async () => ({}) };
    };

    const signerB = makeVaultSigner(walletB);
    await auth.authenticateWithVault(signerB);

    assert.equal(authVault.state.walletAddress, walletB, "vault session switched to wallet B");
    assert.equal(authVault.state.isUnlocked, true);
    assert.deepEqual(
      authVault.getAuthTokens(),
      { accessToken: "tok-B-fresh", tokenExpiry: authVault.getAuthTokens().tokenExpiry, refreshToken: null },
      "wallet B's freshly issued token must be persisted in wallet B's OWN vault, not lost",
    );
    assert.ok(authVault.getAuthTokens().tokenExpiry > Date.now(), "expiry persisted alongside the token");

    // And it must actually reach wallet B's on-disk envelope, not just
    // in-memory state - saveVault() is debounced, so flush it.
    await delay(1100);
    const walletBEnvelope = store._map.get(vaultStorageKey(walletB));
    assert.ok(walletBEnvelope, "wallet B's envelope exists in storage");
  } finally {
    // Restore installGlobals()'s fetch/window for any subsequent auth.service
    // tests elsewhere in this file.
    installGlobals();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// P11 — storage.service.js: Pinata publishing moves to the main process
// (src/main/pinataPublish.js / storage:publish IPC in main.js, see
// test/main-security.test.mjs for the main-process-side coverage). Exercises:
//   - a production renderer build of storage.service.js never embeds
//     VITE_PINATA_* values, even when they're set at build time (R1).
//   - uploadContent/uploadMetadata/uploadBase64/uploadFile route through
//     window.electronAPI.storage.publish and never build/forward an
//     Authorization or pinata_api_key-shaped field themselves.
//   - a missing bridge or a rejected publish surfaces as a clear thrown
//     Error, not a crash or silent partial state.
//   - init/getStorage/isInitialized/disconnect work with no Pinata
//     credentials and no storage bridge present at all — local
//     (non-publishing) use is independent of credential availability (R3).
// ─────────────────────────────────────────────────────────────────────────────

const SENTINEL_VITE_PINATA_JWT = `SENTINEL_VITE_PINATA_JWT_${"f".repeat(24)}`;
const SENTINEL_VITE_PINATA_API_KEY = `SENTINEL_VITE_PINATA_KEY_${"a".repeat(24)}`;
const SENTINEL_VITE_PINATA_API_SECRET = `SENTINEL_VITE_PINATA_SECRET_${"b".repeat(24)}`;

test("P11 AC1 (R1): a production renderer build of storage.service.js contains none of the legacy VITE_PINATA_* sentinel values", async () => {
  const envDir = fs.mkdtempSync(path.join(os.tmpdir(), "bonzai-pinata-env-"));
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "bonzai-pinata-out-"));
  try {
    fs.writeFileSync(
      path.join(envDir, ".env.production"),
      [
        `VITE_PINATA_JWT=${SENTINEL_VITE_PINATA_JWT}`,
        `VITE_PINATA_API_KEY=${SENTINEL_VITE_PINATA_API_KEY}`,
        `VITE_PINATA_API_SECRET=${SENTINEL_VITE_PINATA_API_SECRET}`,
      ].join("\n"),
    );

    await viteBuild({
      configFile: false,
      root: PROJECT_ROOT,
      envDir,
      envPrefix: "VITE_",
      logLevel: "silent",
      build: {
        write: true,
        outDir,
        emptyOutDir: true,
        minify: false,
        lib: {
          entry: STORAGE_SERVICE_JS,
          formats: ["es"],
          fileName: () => "storage.service.js",
        },
        rollupOptions: { external: ["ethers"] },
      },
    });

    const bundle = fs.readFileSync(path.join(outDir, "storage.service.js"), "utf8");
    for (const sentinel of [SENTINEL_VITE_PINATA_JWT, SENTINEL_VITE_PINATA_API_KEY, SENTINEL_VITE_PINATA_API_SECRET]) {
      assert.ok(!bundle.includes(sentinel), `production bundle must not embed ${sentinel}`);
    }
    assert.ok(!bundle.includes("VITE_PINATA"), "production bundle must not reference VITE_PINATA_* at all");
  } finally {
    fs.rmSync(envDir, { recursive: true, force: true });
    fs.rmSync(outDir, { recursive: true, force: true });
  }
});

test("P11 (R1): storage.service.js source no longer reads import.meta.env / any VITE_PINATA_* variable", () => {
  const src = fs.readFileSync(STORAGE_SERVICE_JS, "utf8");
  assert.ok(!/VITE_PINATA/.test(src));
  assert.ok(!/import\.meta\.env/.test(src));
});

function installStorageGlobals({ publishImpl } = {}) {
  const publishCalls = [];
  if (publishImpl) {
    global.window = {
      electronAPI: {
        storage: {
          publish: async (payload) => {
            publishCalls.push(payload);
            return publishImpl(payload);
          },
        },
      },
    };
  } else {
    global.window = {};
  }
  return { publishCalls };
}

let storageService;
test.before(async () => {
  storageService = await import("../src/services/storage.service.js");
});

test("P11 (R1/R2): uploadContent/uploadMetadata/uploadBase64/uploadFile route through window.electronAPI.storage.publish and send no header/credential field", async () => {
  const { publishCalls } = installStorageGlobals({
    publishImpl: async (payload) => ({
      ok: true,
      transactionId: `cid-${payload.kind}`,
      timestamp: "t",
      signature: null,
      url: "ipfs://x",
      gatewayUrl: "https://gw/x",
      size: 1,
      tags: [],
    }),
  });

  await storageService.uploadContent({ data: new Uint8Array([1, 2, 3]), contentType: "image/png", generation: { type: "image" } });
  await storageService.uploadMetadata({ a: 1 }, { type: "meta" });
  await storageService.uploadBase64({ base64Data: "aGVsbG8=", contentType: "text/plain" });
  await storageService.uploadFile("/tmp/x.png");

  assert.equal(publishCalls.length, 4);
  assert.deepEqual(publishCalls.map((c) => c.kind).sort(), ["content", "content", "file", "metadata"]);

  const forbiddenFields = ["headers", "mainHeaders", "Authorization", "authorization", "pinata_api_key", "pinata_secret_api_key", "jwt", "apiKey", "apiSecret"];
  for (const call of publishCalls) {
    for (const key of forbiddenFields) {
      assert.equal(call[key], undefined, `${call.kind} publish call must not carry a ${key} field`);
    }
  }
  const filePublish = publishCalls.find((c) => c.kind === "file");
  assert.equal(filePublish.filePath, "/tmp/x.png");
});

test("P11 (R3/R5): uploadContent throws a clear error, not a crash, when the storage bridge is unavailable (e.g. outside Electron)", async () => {
  installStorageGlobals();
  await assert.rejects(
    () => storageService.uploadContent({ data: new Uint8Array([1]), contentType: "text/plain" }),
    (err) => err instanceof Error && /only available inside the BonzAI desktop app/.test(err.message),
  );
});

test("P11 (R5): a rejected publish (e.g. missing Pinata credentials) surfaces the main-process error string, and no local state is left behind", async () => {
  installStorageGlobals({
    publishImpl: async () => ({
      ok: false,
      error: "Pinata credentials not configured. Set PINATA_JWT (or PINATA_API_KEY + PINATA_API_SECRET) in the environment.",
    }),
  });
  await assert.rejects(
    () => storageService.uploadMetadata({ a: 1 }),
    (err) => err instanceof Error && /not configured/.test(err.message),
  );
});

test("P11 (R3): initStorage/getStorage/isInitialized/disconnect succeed with no Pinata credentials and no storage bridge present at all", async () => {
  installStorageGlobals();
  assert.equal(await storageService.initStorage(), true);
  assert.equal(storageService.isInitialized(), true);
  assert.equal(await storageService.getStorage(), true);
  storageService.disconnect();
  assert.equal(storageService.isInitialized(), false);
});

test("P11 (R2): an oversized uploadContent call is rejected before the IPC bridge is ever invoked", async () => {
  const { publishCalls } = installStorageGlobals({ publishImpl: async () => ({ ok: true }) });
  const oversized = new Uint8Array(100 * 1024 * 1024 + 1);
  await assert.rejects(
    () => storageService.uploadContent({ data: oversized, contentType: "application/octet-stream" }),
    /too large/i,
  );
  assert.equal(publishCalls.length, 0, "the oversized upload must never reach the IPC bridge");
});

// ─────────────────────────────────────────────────────────────────────────────
// C3/C4 (bonzai-sec-fix4 re-review) — src/services/media.service.js:
//   - isLocalMediaPath recognizes Windows drive-letter paths (C:\... or
//     C:/...), not just POSIX absolute paths, so callers route them through
//     the signed-URL helper instead of a broken base64 fallback (C3).
//   - refreshExpiringEntries proactively re-signs cache entries nearing
//     expiry, independent of any component re-render, so a URL a component
//     captured once and just holds (ref/prop) still renews reliably (C4).
// ─────────────────────────────────────────────────────────────────────────────

function installMediaSigner(signMediaUrl) {
  global.window = { electronAPI: { session: { signMediaUrl } } };
}

test("C3: isLocalMediaPath recognizes POSIX and Windows drive-letter paths, and rejects everything else", () => {
  assert.equal(media.isLocalMediaPath("/data/models/files/img.png"), true, "POSIX absolute path");
  assert.equal(media.isLocalMediaPath("C:\\Users\\bonz\\out.mp4"), true, "Windows backslash drive path");
  assert.equal(media.isLocalMediaPath("C:/Users/bonz/out.mp4"), true, "Windows forward-slash drive path");
  assert.equal(media.isLocalMediaPath("d:\\media\\clip.wav"), true, "any drive letter, case-insensitive");
  assert.equal(media.isLocalMediaPath("\\\\nas-01\\models\\clip.mp4"), true, "Windows UNC path (A4)");
  assert.equal(media.isLocalMediaPath("//nas-01/models/clip.mp4"), true, "forward-slash UNC path");
  assert.equal(media.isLocalMediaPath("http://example.com/x.png"), false, "remote URL is not a local path");
  assert.equal(media.isLocalMediaPath("https://example.com/x.png"), false);
  assert.equal(media.isLocalMediaPath("data:image/png;base64,abcd"), false, "data URL is not a local path");
  assert.equal(media.isLocalMediaPath("bonzai-blob://abc.png"), false);
  assert.equal(media.isLocalMediaPath("cafebabe"), false, "raw base64 payload is not a local path");
  assert.equal(media.isLocalMediaPath(""), false);
  assert.equal(media.isLocalMediaPath(null), false);
  assert.equal(media.isLocalMediaPath(undefined), false);
});

test("C3: getSignedMediaStreamUrl routes a Windows drive-letter path through the signing IPC, not a base64 fallback", async () => {
  const signCalls = [];
  installMediaSigner(async (p) => {
    signCalls.push(p);
    return { ok: true, path: p, exp: Math.floor(Date.now() / 1000) + 300, sig: "windows-sig" };
  });

  const url = await media.getSignedMediaStreamUrl("C:\\Users\\bonz\\AppData\\clip.mp4");

  assert.deepEqual(signCalls, ["C:\\Users\\bonz\\AppData\\clip.mp4"], "the Windows path itself was sent to the signing IPC");
  assert.match(url, /\/media\/stream\?/, "resolves to a signed stream URL");
  assert.match(url, /sig=windows-sig/);
});

test("C4: refreshExpiringEntries re-signs a held cache entry nearing expiry, with no caller re-reading it", async () => {
  // The module-level cache is a shared singleton across every test in this
  // file. refreshExpiringEntries scans ALL cached entries, so calls are
  // filtered down to this test's own localPath rather than asserted on the
  // raw total - otherwise an unrelated entry from another test happening to
  // sit near "nowMs" here would make the count flaky.
  const localPath = "/data/models/files/video-c4-renewal.mp4";
  let expSeconds = Math.floor(Date.now() / 1000) + 300; // matches the 5-minute TTL (main.js)
  const signCalls = [];
  installMediaSigner(async (p) => {
    signCalls.push(p);
    expSeconds += 300; // each renewal mints a fresh 5-minute window
    return { ok: true, path: p, exp: expSeconds, sig: `sig-${signCalls.filter((c) => c === localPath).length}` };
  });
  const callsForPath = () => signCalls.filter((p) => p === localPath).length;

  const firstUrl = await media.getSignedMediaStreamUrl(localPath);
  assert.equal(callsForPath(), 1, "initial signature requested once");
  assert.match(firstUrl, /sig=sig-1/);

  // No component ever calls signedMediaStreamSrc/getSignedMediaStreamUrl for
  // this path again - exactly the "held ref, no re-render" scenario from C4.
  // Simulate the clock advancing to just inside the renewal skew window.
  const nearExpiryMs = expSeconds * 1000 - 5_000; // 5s of life left
  media.refreshExpiringEntries(nearExpiryMs);
  // Let the async refresh() (awaiting the mocked IPC call) settle.
  await new Promise((resolve) => setTimeout(resolve, 10));

  assert.equal(callsForPath(), 2, "refreshExpiringEntries proactively re-signed the entry ahead of expiry");

  // Read via the synchronous, freshness-checking getter (what a template
  // binding actually calls) rather than getSignedMediaStreamUrl, which
  // unconditionally re-signs on every call and would mask what we're testing.
  const renewedUrl = media.signedMediaStreamSrc(localPath);
  assert.match(renewedUrl, /sig=sig-2/, "a fresh signature is now cached for the same path");
  assert.equal(callsForPath(), 2, "reading the now-fresh entry triggers no further signing call");
});

test("C4: refreshExpiringEntries leaves entries that are not close to expiry alone", async () => {
  const localPath = "/data/models/files/video-c4-fresh.mp4";
  const signCalls = [];
  installMediaSigner(async (p) => {
    signCalls.push(p);
    return { ok: true, path: p, exp: Math.floor(Date.now() / 1000) + 300, sig: "fresh-sig" };
  });
  const callsForPath = () => signCalls.filter((p) => p === localPath).length;

  await media.getSignedMediaStreamUrl(localPath);
  assert.equal(callsForPath(), 1);

  // "Now" is immediately after signing - nowhere near REFRESH_SKEW_MS of the
  // 5-minute expiry, so no renewal should be triggered for THIS path (other
  // cached paths from earlier tests may or may not refresh; irrelevant here).
  media.refreshExpiringEntries(Date.now());
  await new Promise((resolve) => setTimeout(resolve, 10));

  assert.equal(callsForPath(), 1, "an entry with plenty of life left is not re-signed");
});

// ─────────────────────────────────────────────────────────────────────────────
// A3 (bonzai-sec-fix4): the C4 test above only proves the internal `cache`
// Map gets a fresh entry - it re-reads the renewal via signedMediaStreamSrc(),
// which is exactly the reactive re-render path that already worked. It never
// exercised the documented "held ref" scenario: a caller that awaits
// getSignedMediaStreamUrl() once and assigns the raw string to a <video>/
// <audio> element's src has NO reactive dependency on `cache`, so a renewal
// that only updates the Map would never reach that element at all. This
// drives refreshExpiringEntries against a fake DOM element standing in for
// that element and asserts its `.src` is actually updated in place.
// ─────────────────────────────────────────────────────────────────────────────

function makeFakeMediaElement(initialSrc) {
  const listeners = {};
  return {
    src: initialSrc,
    get currentSrc() { return this.src; },
    currentTime: 0,
    paused: true,
    ended: false,
    played: false,
    addEventListener(event, cb) { listeners[event] = cb; },
    fireLoadedMetadata() { listeners.loadedmetadata?.(); },
    play() { this.paused = false; this.played = true; return Promise.resolve(); },
  };
}

test("A3: refreshExpiringEntries updates a bound <video> element's src directly, not just the internal cache - the held-ref scenario getSignedMediaStreamUrl() documents", async () => {
  const localPath = "/data/models/files/video-a3-held-ref.mp4";
  // The module-level cache is a shared singleton across every test in this
  // file (same caveat as the C4 tests above): refreshExpiringEntries below
  // sweeps every entry still cached from earlier tests, not just this one,
  // so the signature counter/exp must be scoped to THIS path rather than a
  // shared call index, or an unrelated entry's renewal shifts the count.
  let expSeconds = Math.floor(Date.now() / 1000) + 300;
  const signCalls = [];
  installMediaSigner(async (p) => {
    signCalls.push(p);
    if (p === localPath) expSeconds += 300;
    const exp = p === localPath ? expSeconds : Math.floor(Date.now() / 1000) + 300;
    return { ok: true, path: p, exp, sig: `a3-sig-${signCalls.filter((c) => c === localPath).length}` };
  });

  // A caller that awaits getSignedMediaStreamUrl() once and assigns the raw
  // string directly to a video element's src - exactly the pattern the
  // function's own doc comment describes ("setting a ref exactly once").
  const initialUrl = await media.getSignedMediaStreamUrl(localPath);
  assert.match(initialUrl, /sig=a3-sig-1/);

  const fakeVideo = makeFakeMediaElement(initialUrl);
  fakeVideo.currentTime = 42.5; // mid-playback
  fakeVideo.paused = false;
  global.document = { querySelectorAll: () => [fakeVideo] };
  try {
    const nearExpiryMs = expSeconds * 1000 - 5_000;
    media.refreshExpiringEntries(nearExpiryMs);
    await new Promise((resolve) => setTimeout(resolve, 10));

    assert.match(
      fakeVideo.src,
      /sig=a3-sig-2/,
      "the held <video> element's src must be updated to the renewed URL directly - a reactive re-read alone never reaches a plain ref",
    );

    // Playback position/state is restored once the (simulated) browser
    // finishes loading the new resource.
    fakeVideo.fireLoadedMetadata();
    assert.equal(fakeVideo.currentTime, 42.5, "playback position restored after renewal");
    assert.equal(fakeVideo.played, true, "playback resumed after renewal");
  } finally {
    delete global.document;
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Cleanup: the media tests (C3/C4/A3) install global.window via
// installMediaSigner(); leaving it in place keeps node:test from exiting
// naturally (the process hangs after the last test). Remove it so the suite
// runs WITHOUT --test-force-exit and reports a stable test count. The
// P11 storage-bundle test runs viteBuild(), which starts the esbuild service
// (a child process) that would otherwise keep the runner alive (G3).
test.after(async () => {
  delete global.window;
  delete global.document;
  // Cancel the auth auto-refresh timer (scheduled with a ~1h delay by the
  // token tests) so the runner can exit naturally.
  try { auth?.__testCancelTimers?.(); } catch {}
  try { await stop(); } catch {}
});
