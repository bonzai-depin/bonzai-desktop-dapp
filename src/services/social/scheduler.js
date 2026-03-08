/**
 * BonzAI Social Scheduler
 *
 * Heartbeat-driven autonomous posting scheduler for social platforms.
 * Integrates with the 5-minute heartbeat from moltbook-agent.js pattern.
 *
 * Features:
 * - Per-platform posting frequency control
 * - Content type selection weighted by platform strengths
 * - Optimal posting hour awareness
 * - Rate limit enforcement
 * - Loop detection via Jaccard similarity
 */

import { reactive, readonly } from 'vue';
import { ContentPipeline } from './content-pipeline.js';
import { InstagramAdapter } from './instagram.adapter.js';
import { TikTokAdapter } from './tiktok.adapter.js';
import { XAdapter } from './x.adapter.js';
import {
  SCHEDULING_CONFIG,
  PLATFORM_DISPLAY,
} from '../../config/social.platforms.config.js';

// ═══════════════════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════════════════

const state = reactive({
  isRunning: false,
  companions: {}, // { [companionId]: { platforms: { instagram, tiktok, x }, settings } }
  postHistory: [], // { platform, companionId, postId, contentType, text, timestamp }
  errors: [],      // Recent errors for UI display
});

let heartbeatTimer = null;
const pipelines = new Map(); // companionId → ContentPipeline
const adapters = new Map();  // `${companionId}:${platform}` → adapter instance

// ═══════════════════════════════════════════════════════════════════════════
// COMPANION REGISTRATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Register a companion for social posting.
 * @param {string} companionId
 * @param {object} companion - Companion definition from flagship.js
 * @param {object} platformSettings - { instagram: { enabled, postsPerDay }, ... }
 */
export function registerCompanion(companionId, companion, platformSettings = {}) {
  state.companions[companionId] = {
    companion,
    platforms: {
      instagram: { enabled: false, postsPerDay: SCHEDULING_CONFIG.defaultPostsPerDay.instagram, ...platformSettings.instagram },
      tiktok: { enabled: false, postsPerDay: SCHEDULING_CONFIG.defaultPostsPerDay.tiktok, ...platformSettings.tiktok },
      x: { enabled: false, postsPerDay: SCHEDULING_CONFIG.defaultPostsPerDay.x, ...platformSettings.x },
    },
    lastPostTime: {},    // { [platform]: timestamp }
    postsToday: {},      // { [platform]: count }
    dayStartTime: {},    // { [platform]: midnight timestamp }
  };

  // Create content pipeline for this companion
  if (!pipelines.has(companionId)) {
    pipelines.set(companionId, new ContentPipeline());
  }

  console.log(`[Scheduler] Companion ${companionId} registered`);
}

/**
 * Unregister a companion.
 */
export function unregisterCompanion(companionId) {
  delete state.companions[companionId];
  pipelines.delete(companionId);

  // Remove all adapters for this companion
  for (const [key] of adapters) {
    if (key.startsWith(`${companionId}:`)) {
      adapters.delete(key);
    }
  }
}

/**
 * Update platform settings for a companion.
 */
export function updatePlatformSettings(companionId, platform, settings) {
  if (!state.companions[companionId]) return;
  Object.assign(state.companions[companionId].platforms[platform], settings);
}

// ═══════════════════════════════════════════════════════════════════════════
// ADAPTER MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get or create adapter for a companion+platform pair.
 */
function getAdapter(companionId, platform) {
  const key = `${companionId}:${platform}`;
  if (adapters.has(key)) return adapters.get(key);

  let adapter;
  switch (platform) {
    case 'instagram': adapter = new InstagramAdapter(companionId); break;
    case 'tiktok': adapter = new TikTokAdapter(companionId); break;
    case 'x': adapter = new XAdapter(companionId); break;
    default: throw new Error(`Unknown platform: ${platform}`);
  }

  adapters.set(key, adapter);
  return adapter;
}

/**
 * Get all enabled, authenticated adapters for a companion.
 */
async function getEnabledAdapters(companionId) {
  const companionState = state.companions[companionId];
  if (!companionState) return [];

  const enabled = [];

  for (const [platform, settings] of Object.entries(companionState.platforms)) {
    if (!settings.enabled) continue;

    const adapter = getAdapter(companionId, platform);
    const isAuth = await adapter.isAuthenticated();

    if (isAuth) {
      enabled.push(adapter);
    } else {
      console.log(`[Scheduler] ${companionId}/${platform}: not authenticated, skipping`);
    }
  }

  return enabled;
}

// ═══════════════════════════════════════════════════════════════════════════
// SCHEDULING LOGIC
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Start the heartbeat scheduler.
 */
export function start() {
  if (state.isRunning) return;

  state.isRunning = true;
  heartbeatTimer = setInterval(tick, SCHEDULING_CONFIG.heartbeatIntervalMs);
  console.log('[Scheduler] Started with', SCHEDULING_CONFIG.heartbeatIntervalMs / 1000, 's interval');

  // Run immediately
  tick();
}

/**
 * Stop the scheduler.
 */
export function stop() {
  state.isRunning = false;
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  console.log('[Scheduler] Stopped');
}

/**
 * Main heartbeat tick — check all companions, decide whether to post.
 */
async function tick() {
  if (!state.isRunning) return;

  for (const [companionId, companionState] of Object.entries(state.companions)) {
    try {
      await processCompanion(companionId, companionState);
    } catch (e) {
      console.error(`[Scheduler] Error processing ${companionId}:`, e.message);
      state.errors.push({
        companionId,
        error: e.message,
        timestamp: Date.now(),
      });
      // Keep only last 50 errors
      if (state.errors.length > 50) state.errors.splice(0, state.errors.length - 50);
    }
  }
}

/**
 * Process a single companion — decide whether to post on each platform.
 */
async function processCompanion(companionId, companionState) {
  const now = Date.now();
  const currentHour = new Date().getUTCHours();

  for (const [platform, settings] of Object.entries(companionState.platforms)) {
    if (!settings.enabled) continue;

    // Reset daily counter at midnight
    const todayStart = new Date().setUTCHours(0, 0, 0, 0);
    if (!companionState.dayStartTime[platform] || companionState.dayStartTime[platform] < todayStart) {
      companionState.postsToday[platform] = 0;
      companionState.dayStartTime[platform] = todayStart;
    }

    // Check if we've hit daily limit
    const postsToday = companionState.postsToday[platform] || 0;
    if (postsToday >= settings.postsPerDay) continue;

    // Check optimal posting hours
    const optimalHours = SCHEDULING_CONFIG.optimalHours[platform] || [];
    const isOptimalHour = optimalHours.includes(currentHour);

    // Probability-based posting decision
    // Higher probability during optimal hours, spread evenly throughout day
    const baseProb = settings.postsPerDay / (24 * 60 / (SCHEDULING_CONFIG.heartbeatIntervalMs / 60000));
    const probability = isOptimalHour ? baseProb * 2 : baseProb;

    if (Math.random() > probability) continue;

    // Check adapter rate limits
    const adapter = getAdapter(companionId, platform);
    const isAuth = await adapter.isAuthenticated();
    if (!isAuth) continue;

    const rateCheck = adapter.checkRateLimit();
    if (!rateCheck.allowed) {
      console.log(`[Scheduler] ${companionId}/${platform}: rate limited — ${rateCheck.reason}`);
      continue;
    }

    // Select content type based on platform weights
    const contentType = selectContentType(platform, settings);

    // Generate and post
    console.log(`[Scheduler] ${companionId}/${platform}: posting ${contentType}...`);

    const pipeline = pipelines.get(companionId);
    if (!pipeline) continue;

    try {
      const results = await pipeline.generateAndPost(
        companionState.companion,
        contentType,
        [adapter],
        { platform }
      );

      // Record successful posts
      for (const result of results) {
        if (result.status === 'fulfilled' && result.value?.postId) {
          companionState.postsToday[platform] = (companionState.postsToday[platform] || 0) + 1;
          companionState.lastPostTime[platform] = now;

          state.postHistory.push({
            platform,
            companionId,
            postId: result.value.postId,
            url: result.value.url,
            contentType,
            timestamp: now,
          });

          // Keep history manageable
          if (state.postHistory.length > 200) {
            state.postHistory.splice(0, state.postHistory.length - 200);
          }
        }
      }
    } catch (e) {
      console.error(`[Scheduler] Post failed for ${companionId}/${platform}:`, e.message);
    }
  }
}

/**
 * Select content type based on platform weights and available pipelines.
 */
function selectContentType(platform, settings) {
  const weights = SCHEDULING_CONFIG.contentWeights[platform] || { text: 1 };

  // Filter by what the user has enabled (if contentMix is set)
  const enabledTypes = settings.contentMix || Object.keys(weights);

  // Build weighted array
  let totalWeight = 0;
  const entries = [];
  for (const [type, weight] of Object.entries(weights)) {
    if (enabledTypes.includes(type)) {
      entries.push({ type, weight });
      totalWeight += weight;
    }
  }

  if (entries.length === 0) return 'text';

  // Weighted random selection
  let random = Math.random() * totalWeight;
  for (const entry of entries) {
    random -= entry.weight;
    if (random <= 0) return entry.type;
  }

  return entries[entries.length - 1].type;
}

// ═══════════════════════════════════════════════════════════════════════════
// MANUAL POSTING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Manually trigger a post for a companion on specific platforms.
 * @param {string} companionId
 * @param {string} contentType - 'text' | 'image' | 'video' | 'audio'
 * @param {string[]} [platforms] - Which platforms to post to (default: all enabled)
 * @returns {Promise<object[]>} Post results
 */
export async function postNow(companionId, contentType, platforms = null) {
  const companionState = state.companions[companionId];
  if (!companionState) throw new Error(`Companion ${companionId} not registered`);

  const enabledAdapters = await getEnabledAdapters(companionId);
  const targetAdapters = platforms
    ? enabledAdapters.filter(a => platforms.includes(a.platform))
    : enabledAdapters;

  if (targetAdapters.length === 0) {
    throw new Error('No authenticated platforms available');
  }

  const pipeline = pipelines.get(companionId);
  if (!pipeline) throw new Error('Pipeline not initialized');

  return pipeline.generateAndPost(
    companionState.companion,
    contentType,
    targetAdapters
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// STATUS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get scheduler status for UI display.
 */
export function getStatus() {
  const companionStatuses = {};

  for (const [companionId, companionState] of Object.entries(state.companions)) {
    const platforms = {};
    for (const [platform, settings] of Object.entries(companionState.platforms)) {
      platforms[platform] = {
        enabled: settings.enabled,
        postsPerDay: settings.postsPerDay,
        postsToday: companionState.postsToday[platform] || 0,
        lastPostTime: companionState.lastPostTime[platform] || null,
        display: PLATFORM_DISPLAY[platform],
      };
    }
    companionStatuses[companionId] = {
      platforms,
      companion: companionState.companion.name,
    };
  }

  return {
    isRunning: state.isRunning,
    companions: companionStatuses,
    totalPostsToday: state.postHistory.filter(p => p.timestamp > Date.now() - 86400000).length,
    recentErrors: state.errors.slice(-10),
  };
}

/**
 * Get post history for a companion.
 */
export function getPostHistory(companionId, limit = 20) {
  return state.postHistory
    .filter(p => p.companionId === companionId)
    .slice(-limit)
    .reverse();
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

export const socialScheduler = {
  state: readonly(state),
  registerCompanion,
  unregisterCompanion,
  updatePlatformSettings,
  start,
  stop,
  postNow,
  getStatus,
  getPostHistory,
  getAdapter,
};

export default socialScheduler;
