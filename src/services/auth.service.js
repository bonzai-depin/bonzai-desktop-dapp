/**
 * BonzAI Authentication Service
 *
 * JWT-based authentication after WalletConnect.
 * - Long-lived access tokens (48 hours)
 * - Long-lived refresh tokens (7 days, HttpOnly cookie + vault backup)
 * - Automatic token refresh before expiry
 * - Session persistence via Auth Vault
 * - NEVER requests wallet signature automatically (breaks autonomous mode)
 */

import { reactive, readonly } from "vue";
import { authVault } from "./authVault.service.js";

const API_BASE =
  (typeof window !== "undefined" && window?.electronAPI?.env?.API_BASE) ||
  "http://127.0.0.1:65000";

// ═══════════════════════════════════════════════════════════════════════════
// TOKEN TYPES — kept strictly separate so one type cannot masquerade as another
// ═══════════════════════════════════════════════════════════════════════════
//   BEARER        — wallet/JWT access token, sent as `Authorization: Bearer`.
//   LOCAL_SESSION — per-launch desktop credential (P2 registry), sent under a
//                   dedicated header. Sufficient for local creation on its own.
//   REFRESH       — HttpOnly cookie ONLY; it must NEVER appear in any
//                   Authorization / session header, so refresh-token misuse
//                   (presenting it as a bearer) produces no header and fails.
export const TOKEN_TYPES = Object.freeze({
  BEARER: "bearer",
  LOCAL_SESSION: "local-session",
  REFRESH: "refresh",
});

// Dedicated header for the local desktop session credential. Kept distinct
// from Authorization so local services can require the desktop session even
// when no wallet bearer is present (wallet-optional local creation, R5).
const LOCAL_SESSION_HEADER = "x-bonzai-session";

/**
 * Build an auth header for a token of an explicit type. Bearer tokens go in
 * Authorization; local-session tokens use LOCAL_SESSION_HEADER; refresh
 * tokens never produce a header (cookie-only). Returns {} for an unknown
 * type or empty token, so misuse fails closed instead of sending garbage.
 */
export const buildAuthHeader = (token, type) => {
  if (typeof token !== "string" || token.length === 0) return {};
  switch (type) {
    case TOKEN_TYPES.BEARER:
      return { Authorization: `Bearer ${token}` };
    case TOKEN_TYPES.LOCAL_SESSION:
      return { [LOCAL_SESSION_HEADER]: token };
    case TOKEN_TYPES.REFRESH:
      return {}; // cookie-only — never serialized as a request header
    default:
      return {};
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════════════════

const state = reactive({
  isAuthenticated: false,
  accessToken: null,
  tokenExpiry: null,
  walletAddress: null,
  level: null,
  levelValue: 0,
  isAuthenticating: false,
  isAwaitingSignature: false,
  error: null,
});

let refreshTimer = null;
let signerGetter = null; // Function to get signer for re-authentication
let reAuthPromise = null; // Prevent concurrent re-auth attempts

// Local desktop session credential (P2). Held in memory ONLY — never written
// to electron-store, the auth vault, or any cookie. Obtained from the main
// process via the scoped `session:obtain-credential` IPC. Sufficient for
// local creation without a wallet (R5); rotated on logout (R4).
let localCredential = null; // { token, descriptor } | null

/**
 * Absent level data maps to NO economy privilege. Never synthesize or
 * persist a maximum (or any) level when the server returns none — level
 * gating is derived exclusively from onchain stake (see level.service.js).
 */
const normalizeLevel = (data) => ({
  level: data && data.level != null ? data.level : null,
  levelValue:
    data && Number.isFinite(Number(data.level_value))
      ? Number(data.level_value)
      : 0,
});

/**
 * Sync auth state to electron store so main process can enforce access control
 */
const syncAuthToStore = () => {
  try {
    window.electronAPI?.store?.set("auth.isAuthenticated", state.isAuthenticated);
    window.electronAPI?.store?.set("auth.level", state.level);
    window.electronAPI?.store?.set("auth.levelValue", state.levelValue);
    window.electronAPI?.store?.set("auth.tokenExpiry", state.tokenExpiry);
  } catch (e) {
    // Non-critical — main process will just deny access if store is empty
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// AUTHENTICATION FLOW
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get user-friendly error message based on HTTP status code
 */
const getHttpErrorMessage = (status, defaultMsg) => {
  switch (status) {
    case 400:
      return "Invalid request. Please try again.";
    case 401:
      return "Session expired. Please reconnect your wallet.";
    case 403:
      return "Access denied. You may need to upgrade your level.";
    case 404:
      return "Service not found. Please check if the server is running.";
    case 429:
      return "Too many requests. Please wait a moment and try again.";
    case 500:
      return "Server error. Please try again later.";
    case 502:
    case 503:
    case 504:
      return "Server is temporarily unavailable. Please try again later.";
    default:
      return defaultMsg || `Request failed (${status})`;
  }
};

/**
 * Full authentication flow:
 * 1. Get challenge from server
 * 2. User signs message in wallet
 * 3. Send signature to server
 * 4. Receive JWT tokens
 *
 * @param {object} signer - ethers.js Signer from connected wallet
 * @returns {Promise<{address, level, levelValue}>}
 */
export const authenticate = async (signer) => {
  state.isAuthenticating = true;
  state.isAwaitingSignature = false;
  state.error = null;

  try {
    const address = await signer.getAddress();

    // 1. Get challenge from server
    const challengeRes = await fetch(`${API_BASE}/auth/challenge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address }),
    });

    if (!challengeRes.ok) {
      const err = await challengeRes.json().catch(() => ({}));
      throw new Error(getHttpErrorMessage(challengeRes.status, err.error));
    }

    const { challenge, mac, message } = await challengeRes.json();

    // 2. User signs the message (wallet popup appears here)
    state.isAwaitingSignature = true;
    let signature;
    try {
      signature = await signer.signMessage(message);
    } finally {
      state.isAwaitingSignature = false;
    }

    // 3. Send to server for verification + JWT
    const verifyRes = await fetch(`${API_BASE}/auth/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include", // For refresh token cookie
      body: JSON.stringify({
        address,
        signature,
        challenge,
        mac,
      }),
    });

    if (!verifyRes.ok) {
      const err = await verifyRes.json().catch(() => ({}));
      throw new Error(getHttpErrorMessage(verifyRes.status, err.error));
    }

    // 4. Store tokens and state
    const data = await verifyRes.json();
    setAccessToken(data.access_token, data.expires_in);

    state.walletAddress = address.toLowerCase();
    ({ level: state.level, levelValue: state.levelValue } = normalizeLevel(data));
    state.isAuthenticated = true;

    // Sync auth state to electron store so main process can check it
    syncAuthToStore();

    console.log(`[Auth] Authenticated as ${address} with ${data.level}`);

    return {
      address: state.walletAddress,
      level: state.level,
      levelValue: state.levelValue,
    };
  } catch (e) {
    state.error = e.message;
    console.error("[Auth] Authentication failed:", e);
    throw e;
  } finally {
    state.isAuthenticating = false;
    state.isAwaitingSignature = false;
  }
};

/**
 * Combined authentication + vault initialization with ONE signature.
 *
 * This is the preferred method - user signs once, we:
 * 1. Authenticate with server
 * 2. Initialize/unlock the auth vault using the same signature
 *
 * @param {object} signer - ethers.js Signer from connected wallet
 * @returns {Promise<{address, level, levelValue}>}
 */
export const authenticateWithVault = async (signer) => {
  state.isAuthenticating = true;
  state.isAwaitingSignature = false;
  state.error = null;

  try {
    const address = await signer.getAddress();

    // 1. Get challenge from server
    const challengeRes = await fetch(`${API_BASE}/auth/challenge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address }),
    });

    if (!challengeRes.ok) {
      const err = await challengeRes.json().catch(() => ({}));
      throw new Error(getHttpErrorMessage(challengeRes.status, err.error));
    }

    const { challenge, mac, message } = await challengeRes.json();

    // 2. User signs the message (wallet popup appears here) - ONE SIGNATURE
    state.isAwaitingSignature = true;
    let signature;
    try {
      signature = await signer.signMessage(message);
    } finally {
      state.isAwaitingSignature = false;
    }

    // 3. Send to server for verification + JWT
    const verifyRes = await fetch(`${API_BASE}/auth/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include", // For refresh token cookie
      body: JSON.stringify({
        address,
        signature,
        challenge,
        mac,
      }),
    });

    if (!verifyRes.ok) {
      const err = await verifyRes.json().catch(() => ({}));
      throw new Error(getHttpErrorMessage(verifyRes.status, err.error));
    }

    // 4. Store tokens and state
    const data = await verifyRes.json();
    setAccessToken(data.access_token, data.expires_in);

    state.walletAddress = address.toLowerCase();
    ({ level: state.level, levelValue: state.levelValue } = normalizeLevel(data));
    state.isAuthenticated = true;

    // Sync auth state to electron store so main process can check it
    syncAuthToStore();

    // 5. Initialize/unlock vault using the SAME signature (no new popup)
    try {
      await authVault.initializeOrUnlockFromSignature(address.toLowerCase(), signature);
      console.log("[Auth] Vault initialized/unlocked from auth signature");
    } catch (vaultError) {
      // Vault is non-critical - log but don't fail auth
      console.warn("[Auth] Vault initialization failed:", vaultError.message);
    }

    console.log(`[Auth] Authenticated as ${address} with ${data.level}`);

    return {
      address: state.walletAddress,
      level: state.level,
      levelValue: state.levelValue,
    };
  } catch (e) {
    state.error = e.message;
    console.error("[Auth] Authentication failed:", e);
    throw e;
  } finally {
    state.isAuthenticating = false;
    state.isAwaitingSignature = false;
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// TOKEN MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Set access token and schedule refresh
 * Also persists to vault for session recovery
 */
const setAccessToken = (token, expiresIn) => {
  state.accessToken = token;
  state.tokenExpiry = Date.now() + expiresIn * 1000;

  // Persist to vault for session recovery across restarts
  if (authVault.state.isUnlocked) {
    authVault.setAuthTokens(token, state.tokenExpiry);
  }

  // Schedule refresh 60 seconds before expiry
  const refreshIn = Math.max(0, (expiresIn - 60) * 1000);
  scheduleRefresh(refreshIn);
};

/**
 * Schedule token refresh
 */
const scheduleRefresh = (ms) => {
  if (refreshTimer) clearTimeout(refreshTimer);

  refreshTimer = setTimeout(async () => {
    try {
      await refreshToken();
    } catch (e) {
      console.error("[Auth] Auto-refresh failed:", e);
      // Token expired, user needs to re-authenticate
      logout();
      window.dispatchEvent(new CustomEvent("auth:expired"));
    }
  }, ms);
};

/**
 * Refresh access token using refresh token cookie
 */
export const refreshToken = async () => {
  const res = await fetch(`${API_BASE}/auth/refresh`, {
    method: "POST",
    credentials: "include", // Send refresh token cookie
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Token refresh failed");
  }

  const data = await res.json();
  setAccessToken(data.access_token, data.expires_in);

  // A successful refresh means the user is authenticated.
  state.isAuthenticated = true;

  // Update level in case it changed (absent level => no privilege)
  const lvl = normalizeLevel(data);
  state.level = lvl.level;
  state.levelValue = lvl.levelValue;

  // Sync auth state to electron store so main process can check it
  syncAuthToStore();

  console.log("[Auth] Token refreshed successfully");
  return data;
};

// ═══════════════════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get authorization headers for API requests
 */
export const getAuthHeaders = () => buildAuthHeader(state.accessToken, TOKEN_TYPES.BEARER);

/**
 * Headers attaching the in-memory local desktop session credential (P2).
 * Used ALONGSIDE the wallet bearer for local services — never persisted.
 * Returns {} when no local session has been obtained yet.
 */
export const getLocalSessionHeaders = () =>
  buildAuthHeader(localCredential?.token, TOKEN_TYPES.LOCAL_SESSION);

/** Test/config seam: hold the local credential obtained from main (memory only). */
export const setLocalCredential = (cred) => {
  localCredential =
    cred && typeof cred.token === "string" && cred.token
      ? { token: cred.token, descriptor: cred.descriptor }
      : null;
};

/** Current local session token (or null). For diagnostics/tests only. */
export const getLocalCredential = () =>
  localCredential ? localCredential.token : null;

/**
 * Pull the current local session credential from the main process and hold
 * it in memory. Wallet-optional: local-first creation works once this has
 * run, with no signer and no chain endpoint. Never written to store/vault.
 */
export const initLocalSession = async () => {
  try {
    const res = await window?.electronAPI?.session?.obtainCredential?.();
    if (res?.ok && typeof res.token === "string" && res.token) {
      setLocalCredential({ token: res.token, descriptor: res.descriptor });
    } else {
      localCredential = null;
    }
  } catch {
    localCredential = null;
  }
  return !!localCredential;
};

/**
 * Socket.IO auth payload attaching the local session credential without
 * persisting it. The wallet bearer (if any) rides on the transport; callers
 * spread this into the socket's `auth`/`extraHeaders` handshake.
 */
export const socketAuthPayload = (extra = {}) => {
  const tok = localCredential?.token;
  return tok ? { ...extra, session: tok } : { ...extra };
};

/**
 * Check if currently authenticated with valid token
 */
export const isAuthenticated = () => {
  return state.isAuthenticated && state.accessToken && Date.now() < state.tokenExpiry;
};

/**
 * Logout and clear all auth state
 */
export const logout = async () => {
  // Clear wallet / economy identity. The local desktop session is NOT
  // dropped here — it is rotated below so local-first creation survives a
  // wallet disconnect (R4: logout clears wallet state and invokes rotation).
  state.isAuthenticated = false;
  state.accessToken = null;
  state.tokenExpiry = null;
  state.walletAddress = null;
  state.level = null;
  state.levelValue = 0;
  state.error = null;

  // Invalidate the local session credential SYNCHRONOUSLY (sendSync) so the
  // old generation dies immediately, before any caller can use it again.
  // No caller has to await this for the invalidation to take effect.
  localCredential = null;
  try {
    window?.electronAPI?.session?.invalidateCredential?.();
  } catch {
    // Fall back to renderer-side clearing only — the rotate below still
    // bumps the generation.
  }

  // Sync cleared auth state to electron store
  syncAuthToStore();

  if (refreshTimer) {
    clearTimeout(refreshTimer);
    refreshTimer = null;
  }

  // Clear refresh token cookie by calling server
  fetch(`${API_BASE}/auth/logout`, {
    method: "POST",
    credentials: "include",
  }).catch(() => {});

  // Rotate the local session credential (invalidates the old generation and
  // rekeys dependent local services before returning) then re-obtain the
  // replacement, so the desktop session stays valid without a wallet.
  try {
    await window?.electronAPI?.session?.rotateCredential?.();
    await initLocalSession();
  } catch (e) {
    console.warn("[Auth] Session rotation on logout failed:", e?.message);
  }

  console.log("[Auth] Logged out");
};

/**
 * Register a function to get the signer for automatic re-authentication
 * Called by web3.service after wallet connection
 */
export const setSignerGetter = (getter) => {
  signerGetter = getter;
  console.log("[Auth] Signer getter registered for auto re-authentication");
};

/**
 * Attempt to re-authenticate using refresh token ONLY.
 * NEVER automatically requests wallet signatures - this breaks autonomous mode.
 * If refresh fails, returns false and autonomous operations should gracefully degrade.
 *
 * @param {boolean} allowWalletSignature - Only set to true for USER-INITIATED re-auth
 * Returns true if successful, false otherwise
 */
export const reAuthenticate = async (allowWalletSignature = false) => {
  // Prevent concurrent re-auth attempts
  if (reAuthPromise) {
    return reAuthPromise;
  }

  reAuthPromise = (async () => {
    // First, try refresh token (no user interaction needed)
    try {
      console.log("[Auth] Attempting token refresh...");
      await refreshToken();
      console.log("[Auth] Token refresh successful");
      return true;
    } catch (refreshError) {
      console.log("[Auth] Token refresh failed:", refreshError.message);
    }

    // If refresh failed and wallet signature is NOT allowed, stop here
    // This prevents breaking autonomous mode with signature popups
    if (!allowWalletSignature) {
      console.log("[Auth] Wallet signature not allowed (autonomous mode), returning false");
      console.log("[Auth] User must manually re-authenticate via the UI");
      return false;
    }

    // Only try wallet signature if explicitly allowed (user-initiated)
    if (!signerGetter) {
      console.log("[Auth] No signer getter registered, cannot re-authenticate");
      return false;
    }

    try {
      console.log("[Auth] Attempting wallet re-authentication (user-initiated)...");
      const signer = await signerGetter();
      if (!signer) {
        console.log("[Auth] No signer available");
        return false;
      }

      await authenticate(signer);
      console.log("[Auth] Wallet re-authentication successful");
      return true;
    } catch (e) {
      console.error("[Auth] Wallet re-authentication failed:", e);
      return false;
    }
  })();

  try {
    return await reAuthPromise;
  } finally {
    reAuthPromise = null;
  }
};

/**
 * Make authenticated API request
 * Automatically includes auth headers and handles 401 responses
 * Uses ONLY token refresh for automatic recovery - never requests wallet signature
 */
export const authFetch = async (url, options = {}) => {
  const headers = {
    ...options.headers,
    ...getLocalSessionHeaders(), // local desktop session (wallet-optional)
    ...getAuthHeaders(),         // wallet bearer (optional, economy identity only)
  };

  const res = await fetch(url, {
    ...options,
    headers,
    credentials: "include",
  });

  // Handle 401 - try to refresh token only (no wallet signature)
  if (res.status === 401 && state.accessToken) {
    try {
      await refreshToken();
      // Retry with new token
      return fetch(url, {
        ...options,
        headers: {
          ...options.headers,
          ...getLocalSessionHeaders(),
          ...getAuthHeaders(),
        },
        credentials: "include",
      });
    } catch (refreshError) {
      // Refresh failed - DO NOT try wallet signature automatically
      // This would break autonomous mode
      console.log("[Auth] Token refresh failed, session needs manual re-authentication");
      window.dispatchEvent(new CustomEvent("auth:needs-reauth"));
      throw new Error("Session expired. Please reconnect your wallet.");
    }
  }

  return res;
};

/**
 * Proactively ensure auth token is valid before starting long operations.
 * Call this before video/music/image generation to avoid mid-operation token expiry.
 *
 * IMPORTANT: This function NEVER requests wallet signatures automatically.
 *
 * @param {number} bufferMinutes - Refresh if token expires within this many minutes (default: 5)
 * @returns {Promise<boolean>} - true if authenticated, false otherwise
 */
export const ensureAuth = async (bufferMinutes = 5) => {
  const now = Date.now();
  const bufferMs = bufferMinutes * 60 * 1000;

  // Check if we have a valid token that won't expire during the operation
  if (state.accessToken && state.tokenExpiry) {
    if (now < state.tokenExpiry - bufferMs) {
      // Token is valid and has enough buffer
      return true;
    }

    // Token exists but is expiring soon - proactively refresh
    console.log(`[Auth] Token expires in ${Math.round((state.tokenExpiry - now) / 1000)}s, refreshing proactively...`);
    try {
      await refreshToken();
      console.log("[Auth] Proactive token refresh successful");
      return true;
    } catch (e) {
      console.warn("[Auth] Proactive refresh failed:", e.message);
    }
  }

  // No valid token or refresh failed
  // DO NOT try wallet signature - this breaks autonomous mode
  if (state.accessToken) {
    // Had a token but it's expired - notify user
    console.log("[Auth] Token expired, needs re-authentication");
    window.dispatchEvent(new CustomEvent("auth:needs-reauth"));
  }
  return false;
};

// ═══════════════════════════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════════════════════════

export { getHttpErrorMessage };

/**
 * User-initiated re-authentication.
 * Call this when the user explicitly clicks a "Reconnect" or "Re-authenticate" button.
 * Unlike automatic re-auth, this IS allowed to request a wallet signature.
 */
export const userInitiatedReAuth = async () => {
  return reAuthenticate(true); // Allow wallet signature for user-initiated action
};

/**
 * Restore session from vault on app start.
 * Call this after wallet connects to restore previous session without new signature.
 */
export const restoreSessionFromVault = async () => {
  if (!authVault.state.isUnlocked) {
    console.log("[Auth] Vault not unlocked, cannot restore session");
    return false;
  }

  const tokens = authVault.getAuthTokens();
  if (!tokens.accessToken || !tokens.tokenExpiry) {
    console.log("[Auth] No tokens in vault to restore");
    return false;
  }

  const now = Date.now();

  // Check if access token is still valid
  if (now < tokens.tokenExpiry) {
    console.log("[Auth] Restoring valid session from vault");
    state.accessToken = tokens.accessToken;
    state.tokenExpiry = tokens.tokenExpiry;
    state.isAuthenticated = true;

    // Schedule refresh
    const refreshIn = Math.max(0, tokens.tokenExpiry - now - 60000);
    scheduleRefresh(refreshIn);

    // Refresh to recover level info and sync auth state to main process
    try {
      await refreshToken(); // sets level, levelValue, calls syncAuthToStore
    } catch (e) {
      // Refresh failed but token is still valid — sync what we have
      console.warn("[Auth] Refresh during vault restore failed, syncing partial state");
      syncAuthToStore();
    }

    return true;
  }

  // Access token expired, try refresh
  console.log("[Auth] Stored access token expired, attempting refresh...");
  try {
    // Set isAuthenticated BEFORE refresh so syncAuthToStore inside refreshToken sees true
    state.isAuthenticated = true;
    await refreshToken(); // sets level, levelValue, calls syncAuthToStore
    return true;
  } catch (e) {
    state.isAuthenticated = false;
    syncAuthToStore();
    console.log("[Auth] Session restore failed, user needs to re-authenticate");
    return false;
  }
};

export const authService = {
  state: readonly(state),

  // Authentication
  authenticate,
  authenticateWithVault, // Combined auth + vault (ONE signature)
  refreshToken,
  logout,
  reAuthenticate,
  userInitiatedReAuth, // For UI buttons
  restoreSessionFromVault, // For app startup
  setSignerGetter,
  ensureAuth,

  // Utilities
  getAuthHeaders,
  getHttpErrorMessage,
  isAuthenticated,
  authFetch,

  // Local desktop session (P2) — wallet-optional, memory-only credential
  TOKEN_TYPES,
  buildAuthHeader,
  initLocalSession,
  setLocalCredential,
  getLocalCredential,
  getLocalSessionHeaders,
  socketAuthPayload,
};

// ═══════════════════════════════════════════════════════════════════════════
// VISIBILITY CHANGE HANDLER
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Handle visibility change to refresh tokens when app becomes active after idle.
 * setTimeout is unreliable when the system is idle/sleeping - the OS can pause
 * JavaScript timers. This ensures we check token validity when the user returns.
 *
 * IMPORTANT: Only uses token refresh, never requests wallet signature automatically.
 */
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", async () => {
    if (document.visibilityState === "visible" && state.accessToken) {
      // Check if token is expired or about to expire (within 2 minutes)
      const now = Date.now();
      const expiryBuffer = 2 * 60 * 1000; // 2 minutes

      if (state.tokenExpiry && now >= state.tokenExpiry - expiryBuffer) {
        console.log("[Auth] Token expired or expiring soon after idle, refreshing...");
        try {
          await refreshToken();
        } catch (e) {
          console.error("[Auth] Refresh after idle failed:", e);
          // DO NOT try wallet signature - just notify user
          window.dispatchEvent(new CustomEvent("auth:needs-reauth"));
        }
      }
    }
  });
}

export default authService;
