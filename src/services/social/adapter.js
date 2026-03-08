/**
 * BonzAI Social Platform Adapter — Base Class
 *
 * Unified interface for Instagram, TikTok, and X (Twitter) integrations.
 * Each platform adapter extends this base class.
 *
 * All API calls go through Electron IPC proxy to avoid CORS.
 */

import {
  PLATFORM_RATE_LIMITS,
  PLATFORM_CONTENT_SPECS,
  PLATFORM_API,
  PLATFORM_OAUTH_CONFIG,
  SCHEDULING_CONFIG,
} from '../../config/social.platforms.config.js';

// ═══════════════════════════════════════════════════════════════════════════
// BASE ADAPTER
// ═══════════════════════════════════════════════════════════════════════════

export class SocialPlatformAdapter {
  constructor(platform, companionId) {
    if (!PLATFORM_RATE_LIMITS[platform]) {
      throw new Error(`Unknown platform: ${platform}`);
    }
    this.platform = platform;
    this.companionId = companionId;
    this.rateLimits = PLATFORM_RATE_LIMITS[platform];
    this.contentSpecs = PLATFORM_CONTENT_SPECS[platform];
    this.api = PLATFORM_API[platform];
    this.oauthConfig = PLATFORM_OAUTH_CONFIG[platform];

    // Rate limiting state
    this._postTimestamps = []; // Track recent post times
    this._lastPostTime = 0;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // AUTH (override in subclass)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Start OAuth flow via Electron IPC
   * @returns {Promise<{success: boolean, tokens: object}>}
   */
  async authenticate() {
    if (!window.electronAPI?.social?.oauthStart) {
      throw new Error('Social IPC not available');
    }
    return window.electronAPI.social.oauthStart({
      platform: this.platform,
      companionId: this.companionId,
    });
  }

  /**
   * Get stored credentials from auth vault
   * @returns {Promise<object|null>}
   */
  async getCredentials() {
    if (!window.electronAPI?.social?.getCredentials) return null;
    return window.electronAPI.social.getCredentials({
      platform: this.platform,
      companionId: this.companionId,
    });
  }

  /**
   * Check if we have valid (non-expired) credentials
   * @returns {Promise<boolean>}
   */
  async isAuthenticated() {
    const creds = await this.getCredentials();
    if (!creds?.access_token) return false;
    if (creds.expires_at && Date.now() >= creds.expires_at) return false;
    return true;
  }

  /**
   * Refresh access token if supported
   * @returns {Promise<object>} New tokens
   */
  async refreshToken() {
    if (!window.electronAPI?.social?.refreshToken) {
      throw new Error('Token refresh not available');
    }
    return window.electronAPI.social.refreshToken({
      platform: this.platform,
      companionId: this.companionId,
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // POSTING (override in subclass)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Post text content
   * @param {string} text
   * @param {object} [opts]
   * @returns {Promise<{postId: string, url: string}>}
   */
  async postText(text, opts = {}) {
    throw new Error(`postText not implemented for ${this.platform}`);
  }

  /**
   * Post image with caption
   * @param {string} text - Caption
   * @param {Buffer|ArrayBuffer} imageBuffer
   * @param {object} [opts] - { contentType, altText }
   * @returns {Promise<{postId: string, url: string}>}
   */
  async postImage(text, imageBuffer, opts = {}) {
    throw new Error(`postImage not implemented for ${this.platform}`);
  }

  /**
   * Post video with description
   * @param {string} text - Description/caption
   * @param {Buffer|ArrayBuffer} videoBuffer
   * @param {object} [opts] - { contentType, thumbnail }
   * @returns {Promise<{postId: string, url: string}>}
   */
  async postVideo(text, videoBuffer, opts = {}) {
    throw new Error(`postVideo not implemented for ${this.platform}`);
  }

  /**
   * Post audio (wrapped in video container for most platforms)
   * @param {string} text - Description
   * @param {Buffer|ArrayBuffer} audioBuffer
   * @param {object} [opts] - { coverImage }
   * @returns {Promise<{postId: string, url: string}>}
   */
  async postAudio(text, audioBuffer, opts = {}) {
    throw new Error(`postAudio not implemented for ${this.platform}`);
  }

  /**
   * Get metrics for a post
   * @param {string} postId
   * @returns {Promise<{likes: number, shares: number, comments: number, views: number}>}
   */
  async getMetrics(postId) {
    throw new Error(`getMetrics not implemented for ${this.platform}`);
  }

  /**
   * Delete a post
   * @param {string} postId
   * @returns {Promise<boolean>}
   */
  async deletePost(postId) {
    throw new Error(`deletePost not implemented for ${this.platform}`);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // CONTENT ADAPTATION
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Adapt content for this platform's constraints
   * @param {object} content - { text, media, mediaType }
   * @param {string} contentType - 'text' | 'image' | 'video' | 'audio'
   * @returns {object} - Adapted content
   */
  adaptContent(content, contentType) {
    const specs = this.contentSpecs;
    const adapted = { ...content };

    // Trim text to platform max
    if (adapted.text && specs.text) {
      adapted.text = this.truncateText(adapted.text, specs.text.maxLength);
    }

    return adapted;
  }

  /**
   * Truncate text intelligently (at word boundary)
   */
  truncateText(text, maxLength) {
    if (text.length <= maxLength) return text;
    const truncated = text.slice(0, maxLength - 3);
    const lastSpace = truncated.lastIndexOf(' ');
    return (lastSpace > maxLength * 0.7 ? truncated.slice(0, lastSpace) : truncated) + '...';
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RATE LIMITING
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Check if we can post right now
   * @returns {{ allowed: boolean, waitMs: number, reason: string }}
   */
  checkRateLimit() {
    const now = Date.now();

    // Check minimum interval
    const timeSinceLastPost = now - this._lastPostTime;
    if (timeSinceLastPost < this.rateLimits.minPostIntervalMs) {
      return {
        allowed: false,
        waitMs: this.rateLimits.minPostIntervalMs - timeSinceLastPost,
        reason: 'Too soon since last post',
      };
    }

    // Check daily limit
    const dayAgo = now - 24 * 60 * 60 * 1000;
    const postsToday = this._postTimestamps.filter(t => t > dayAgo).length;
    if (postsToday >= this.rateLimits.postsPerDay) {
      const oldestToday = this._postTimestamps.filter(t => t > dayAgo).sort()[0];
      return {
        allowed: false,
        waitMs: oldestToday + 24 * 60 * 60 * 1000 - now,
        reason: `Daily limit reached (${this.rateLimits.postsPerDay}/day)`,
      };
    }

    return { allowed: true, waitMs: 0, reason: null };
  }

  /**
   * Record a successful post for rate limiting
   */
  recordPost() {
    const now = Date.now();
    this._lastPostTime = now;
    this._postTimestamps.push(now);
    // Keep only last 48h of timestamps
    const cutoff = now - 48 * 60 * 60 * 1000;
    this._postTimestamps = this._postTimestamps.filter(t => t > cutoff);
  }

  /**
   * Get current rate limit status
   */
  getRateLimitStatus() {
    const now = Date.now();
    const dayAgo = now - 24 * 60 * 60 * 1000;
    const postsToday = this._postTimestamps.filter(t => t > dayAgo).length;

    return {
      platform: this.platform,
      postsToday,
      postsRemaining: Math.max(0, this.rateLimits.postsPerDay - postsToday),
      nextPostAllowedAt: this._lastPostTime + this.rateLimits.minPostIntervalMs,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // HELPERS
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Make an authenticated API call through IPC proxy
   */
  async apiCall(url, options = {}) {
    const creds = await this.getCredentials();
    if (!creds?.access_token) {
      throw new Error(`Not authenticated for ${this.platform}`);
    }

    const headers = {
      'Authorization': `Bearer ${creds.access_token}`,
      ...options.headers,
    };

    if (!window.electronAPI?.social?.apiCall) {
      throw new Error('Social API IPC not available');
    }

    const result = await window.electronAPI.social.apiCall({
      platform: this.platform,
      url,
      method: options.method || 'GET',
      headers,
      body: options.body,
      formData: options.formData,
    });

    // Auto-refresh on 401
    if (result.status === 401) {
      try {
        await this.refreshToken();
        return this.apiCall(url, options); // Retry once
      } catch (e) {
        throw new Error(`Auth expired for ${this.platform}, re-authenticate required`);
      }
    }

    return result;
  }

  /**
   * Upload media through IPC (for binary data)
   */
  async uploadMedia(url, buffer, contentType, additionalFields = {}) {
    if (!window.electronAPI?.social?.mediaUpload) {
      throw new Error('Media upload IPC not available');
    }

    const creds = await this.getCredentials();
    return window.electronAPI.social.mediaUpload({
      platform: this.platform,
      url,
      accessToken: creds?.access_token,
      file: {
        buffer: Array.from(new Uint8Array(buffer)),
        contentType,
        name: `media.${contentType.split('/')[1] || 'bin'}`,
      },
      fields: additionalFields,
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// CONTENT SIMILARITY (for loop detection)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Jaccard similarity between two strings (word-level)
 * Reuses the pattern from moltbook.service.js
 */
export function jaccardSimilarity(a, b) {
  const wordsA = new Set(a.toLowerCase().split(/\s+/).filter(w => w.length > 2));
  const wordsB = new Set(b.toLowerCase().split(/\s+/).filter(w => w.length > 2));

  if (wordsA.size === 0 && wordsB.size === 0) return 1;
  if (wordsA.size === 0 || wordsB.size === 0) return 0;

  let intersection = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) intersection++;
  }

  const union = wordsA.size + wordsB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Check if content is too similar to recent posts
 * @param {string} newContent - Proposed content text
 * @param {string[]} recentPosts - Recent post texts
 * @param {number} [threshold] - Similarity threshold (default from config)
 * @returns {boolean} True if content is too similar
 */
export function isTooSimilar(newContent, recentPosts, threshold = SCHEDULING_CONFIG.similarityThreshold) {
  for (const post of recentPosts) {
    if (jaccardSimilarity(newContent, post) > threshold) {
      return true;
    }
  }
  return false;
}

export default SocialPlatformAdapter;
