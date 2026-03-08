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
    state.level = data.level;
    state.levelValue = data.level_value;
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
    state.level = data.level;
    state.levelValue = data.level_value;
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

  // Update level in case it changed
  state.level = data.level;
  state.levelValue = data.level_value;

  // Sync auth state to electron store so main process can check it
  syncAuthToStore();

  console.log("[Auth] Token refreshed successfully");
  return data;
};

/**
 * Get demo token for unauthenticated users
 */
export const getDemoToken = async () => {
  const res = await fetch(`${API_BASE}/auth/demo-token`, {
    method: "POST",
  });

  if (!res.ok) {
    throw new Error("Failed to get demo token");
  }

  return res.json();
};

// ═══════════════════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get authorization headers for API requests
 */
export const getAuthHeaders = () => {
  if (!state.accessToken) return {};
  return { Authorization: `Bearer ${state.accessToken}` };
};

/**
 * Check if currently authenticated with valid token
 */
export const isAuthenticated = () => {
  return state.isAuthenticated && state.accessToken && Date.now() < state.tokenExpiry;
};

/**
 * Check if user has minimum level access
 */
// All generation is free — level checks always pass
export const hasMinLevel = (minLevel) => {
  return true;
};

/**
 * Logout and clear all auth state
 */
export const logout = () => {
  state.isAuthenticated = false;
  state.accessToken = null;
  state.tokenExpiry = null;
  state.walletAddress = null;
  state.level = null;
  state.levelValue = 0;
  state.error = null;

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
    ...getAuthHeaders(),
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
 * If auth can't be refreshed, it falls back to demo mode gracefully.
 *
 * @param {number} bufferMinutes - Refresh if token expires within this many minutes (default: 5)
 * @returns {Promise<boolean>} - true if authenticated, false if using demo mode
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
  // Just notify and fall back to demo mode
  if (state.accessToken) {
    // Had a token but it's expired - notify user
    console.log("[Auth] Token expired, will use demo mode");
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
  getDemoToken,
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
  hasMinLevel,
  authFetch,
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
