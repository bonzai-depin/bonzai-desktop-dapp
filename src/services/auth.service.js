/**
 * BonzAI Authentication Service
 *
 * JWT-based authentication after WalletConnect.
 * - Short-lived access tokens (30 min)
 * - Long-lived refresh tokens (7 days, HttpOnly cookie)
 * - Automatic token refresh before expiry
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
  error: null,
});

let refreshTimer = null;

// ═══════════════════════════════════════════════════════════════════════════
// AUTHENTICATION FLOW
// ═══════════════════════════════════════════════════════════════════════════

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
      const err = await challengeRes.json();
      throw new Error(err.error || "Failed to get challenge");
    }

    const { challenge, mac, message } = await challengeRes.json();

    // 2. User signs the message (wallet popup appears here)
    const signature = await signer.signMessage(message);

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
      const err = await verifyRes.json();
      throw new Error(err.error || "Authentication failed");
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

  // Handle 401 - try to refresh token
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
    } catch (e) {
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

export const authService = {
  state: readonly(state),

  // Authentication
  authenticate,
  refreshToken,
  getDemoToken,
  logout,

  // Utilities
  getAuthHeaders,
  isAuthenticated,
  hasMinLevel,
  authFetch,
};

export default authService;
