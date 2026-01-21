/**
 * BonzAI Authentication Service
 *
 * JWT-based authentication after WalletConnect.
 * - Long-lived access tokens (6 hours)
 * - Long-lived refresh tokens (7 days, HttpOnly cookie)
 * - Automatic token refresh before expiry
 * - Automatic re-authentication on 401 errors
 */

import { reactive, readonly } from "vue";

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
 */
const setAccessToken = (token, expiresIn) => {
  state.accessToken = token;
  state.tokenExpiry = Date.now() + expiresIn * 1000;

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
export const hasMinLevel = (minLevel) => {
  if (!state.isAuthenticated) return false;
  return state.levelValue >= minLevel;
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
 * Attempt to re-authenticate automatically using the stored signer getter
 * Returns true if successful, false otherwise
 */
export const reAuthenticate = async () => {
  // Prevent concurrent re-auth attempts
  if (reAuthPromise) {
    return reAuthPromise;
  }

  if (!signerGetter) {
    console.log("[Auth] No signer getter registered, cannot re-authenticate");
    return false;
  }

  reAuthPromise = (async () => {
    try {
      console.log("[Auth] Attempting automatic re-authentication...");
      const signer = await signerGetter();
      if (!signer) {
        console.log("[Auth] No signer available");
        return false;
      }

      await authenticate(signer);
      console.log("[Auth] Automatic re-authentication successful");
      return true;
    } catch (e) {
      console.error("[Auth] Automatic re-authentication failed:", e);
      return false;
    } finally {
      reAuthPromise = null;
    }
  })();

  return reAuthPromise;
};

/**
 * Make authenticated API request
 * Automatically includes auth headers and handles 401 responses
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

  // Handle 401 - try to refresh token, then re-authenticate
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
      // Refresh failed, try automatic re-authentication
      console.log("[Auth] Token refresh failed, attempting re-authentication...");
      const reAuthSuccess = await reAuthenticate();
      if (reAuthSuccess) {
        // Retry with new token after re-auth
        return fetch(url, {
          ...options,
          headers: {
            ...options.headers,
            ...getAuthHeaders(),
          },
          credentials: "include",
        });
      }
      // Re-auth also failed
      logout();
      window.dispatchEvent(new CustomEvent("auth:expired"));
      throw new Error("Session expired. Please reconnect your wallet.");
    }
  }

  return res;
};

// ═══════════════════════════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════════════════════════

export { getHttpErrorMessage };

export const authService = {
  state: readonly(state),

  // Authentication
  authenticate,
  refreshToken,
  getDemoToken,
  logout,
  reAuthenticate,
  setSignerGetter,

  // Utilities
  getAuthHeaders,
  getHttpErrorMessage,
  isAuthenticated,
  hasMinLevel,
  authFetch,
};

export default authService;
