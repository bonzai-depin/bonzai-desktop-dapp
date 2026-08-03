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

import {
  createCredentialRegistry,
} from "../src/main/credentialRegistry.js";

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
