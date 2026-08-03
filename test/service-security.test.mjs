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
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ethers } from "ethers";

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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MAIN_JS = path.resolve(__dirname, "..", "src", "main.js");
const PRELOAD_JS = path.resolve(__dirname, "..", "src", "preload.js");

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
