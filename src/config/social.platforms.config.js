/**
 * BonzAI Social Platforms Configuration
 *
 * OAuth endpoints, rate limits, content specs, and platform-specific
 * settings for Instagram, TikTok, and X (Twitter).
 */

// ═══════════════════════════════════════════════════════════════════════════
// OAUTH CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

export const PLATFORM_OAUTH_CONFIG = {
  instagram: {
    name: 'Instagram',
    authUrl: 'https://www.facebook.com/v21.0/dialog/oauth',
    tokenUrl: 'https://graph.facebook.com/v21.0/oauth/access_token',
    longLivedTokenUrl: 'https://graph.facebook.com/v21.0/oauth/access_token',
    redirectUri: 'bonzai://social/callback/instagram',
    scopes: [
      'instagram_basic',
      'instagram_content_publish',
      'instagram_manage_insights',
      'pages_show_list',
      'pages_read_engagement',
    ],
    // Must be set by user in app settings (Meta Developer Portal)
    clientIdKey: 'INSTAGRAM_CLIENT_ID',
    clientSecretKey: 'INSTAGRAM_CLIENT_SECRET',
    tokenLifetimeDays: 60, // Long-lived tokens last 60 days
    refreshBeforeDays: 7,  // Refresh 7 days before expiry
  },

  tiktok: {
    name: 'TikTok',
    authUrl: 'https://www.tiktok.com/v2/auth/authorize/',
    tokenUrl: 'https://open.tiktokapis.com/v2/oauth/token/',
    redirectUri: 'bonzai://social/callback/tiktok',
    scopes: [
      'user.info.basic',
      'video.publish',
      'video.upload',
    ],
    clientIdKey: 'TIKTOK_CLIENT_KEY',
    clientSecretKey: 'TIKTOK_CLIENT_SECRET',
    tokenLifetimeDays: 1, // Access tokens last 24h
    refreshTokenLifetimeDays: 365,
    refreshBeforeDays: 0, // Refresh proactively
  },

  x: {
    name: 'X',
    authUrl: 'https://twitter.com/i/oauth2/authorize',
    tokenUrl: 'https://api.twitter.com/2/oauth2/token',
    revokeUrl: 'https://api.twitter.com/2/oauth2/revoke',
    redirectUri: 'bonzai://social/callback/x',
    scopes: [
      'tweet.read',
      'tweet.write',
      'users.read',
      'offline.access',
      'media.write',
    ],
    clientIdKey: 'X_CLIENT_ID',
    // X uses PKCE — no client secret needed for public clients
    usePKCE: true,
    tokenLifetimeDays: 0.083, // ~2 hours
    refreshBeforeDays: 0,
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// RATE LIMITS
// ═══════════════════════════════════════════════════════════════════════════

export const PLATFORM_RATE_LIMITS = {
  instagram: {
    postsPerDay: 25,
    apiCallsPerHour: 200,
    mediaUploadsPerHour: 30,
    minPostIntervalMs: 30 * 60 * 1000, // 30 minutes between posts
  },

  tiktok: {
    postsPerDay: 20,
    apiCallsPerMinute: 100,
    minPostIntervalMs: 60 * 60 * 1000, // 1 hour between posts
  },

  x: {
    postsPerDay: 50, // Free tier: 1500/month ≈ 50/day
    apiCallsPerWindow: 300, // 300 per 15-min window
    mediaUploadsPerDay: 100,
    minPostIntervalMs: 15 * 60 * 1000, // 15 minutes between posts
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// CONTENT SPECS
// ═══════════════════════════════════════════════════════════════════════════

export const PLATFORM_CONTENT_SPECS = {
  instagram: {
    text: {
      maxLength: 2200,
      hashtagLimit: 30,
    },
    image: {
      formats: ['image/jpeg', 'image/png'],
      maxSizeMB: 8,
      aspectRatios: {
        square: { width: 1080, height: 1080 },     // 1:1
        portrait: { width: 1080, height: 1350 },    // 4:5
        landscape: { width: 1080, height: 608 },    // 1.91:1
      },
      preferredAspect: 'square',
    },
    video: {
      formats: ['video/mp4'],
      maxSizeMB: 100,
      maxDurationSec: 90, // Reels
      minDurationSec: 3,
      aspectRatios: {
        reel: { width: 1080, height: 1920 },        // 9:16
        feed: { width: 1080, height: 1080 },         // 1:1
      },
      preferredAspect: 'reel',
    },
    // Audio must be wrapped in video (Reel)
    audio: { requiresVideoWrapper: true },
  },

  tiktok: {
    text: {
      maxLength: 4000,
      hashtagLimit: 100,
    },
    image: {
      formats: ['image/jpeg', 'image/png', 'image/webp'],
      maxSizeMB: 20,
      aspectRatios: {
        portrait: { width: 1080, height: 1920 },    // 9:16
      },
      preferredAspect: 'portrait',
    },
    video: {
      formats: ['video/mp4', 'video/webm'],
      maxSizeMB: 4096,
      maxDurationSec: 180,
      minDurationSec: 1,
      aspectRatios: {
        portrait: { width: 1080, height: 1920 },    // 9:16
      },
      preferredAspect: 'portrait',
    },
    audio: { requiresVideoWrapper: true },
  },

  x: {
    text: {
      maxLength: 280,
      urlCharCount: 23, // URLs always count as 23 chars
    },
    image: {
      formats: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
      maxSizeMB: 5,
      maxImages: 4, // Up to 4 images per tweet
      aspectRatios: {
        landscape: { width: 1200, height: 675 },    // 16:9
        square: { width: 1200, height: 1200 },       // 1:1
      },
      preferredAspect: 'landscape',
    },
    video: {
      formats: ['video/mp4'],
      maxSizeMB: 512,
      maxDurationSec: 140,
      minDurationSec: 0.5,
      aspectRatios: {
        landscape: { width: 1280, height: 720 },    // 16:9
        portrait: { width: 720, height: 1280 },      // 9:16
      },
      preferredAspect: 'landscape',
    },
    audio: { requiresVideoWrapper: true },
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// API ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════

export const PLATFORM_API = {
  instagram: {
    base: 'https://graph.facebook.com/v21.0',
    mediaEndpoint: (userId) => `/${userId}/media`,
    publishEndpoint: (userId) => `/${userId}/media_publish`,
    insightsEndpoint: (mediaId) => `/${mediaId}/insights`,
    meEndpoint: '/me',
    accountsEndpoint: '/me/accounts', // Get linked IG accounts
  },

  tiktok: {
    base: 'https://open.tiktokapis.com/v2',
    publishInit: '/post/publish/inbox/video/init/',
    publishStatus: '/post/publish/status/fetch/',
    userInfo: '/user/info/',
    videoUploadBase: 'https://open-upload.tiktokapis.com',
  },

  x: {
    base: 'https://api.twitter.com/2',
    tweetsEndpoint: '/tweets',
    mediaUploadBase: 'https://upload.twitter.com/1.1',
    mediaUploadEndpoint: '/media/upload.json',
    meEndpoint: '/users/me',
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// SCHEDULING CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

export const SCHEDULING_CONFIG = {
  // Heartbeat interval (aligned with moltbook-agent)
  heartbeatIntervalMs: 5 * 60 * 1000, // 5 minutes

  // Default posting frequency per platform
  defaultPostsPerDay: {
    instagram: 2,
    tiktok: 2,
    x: 4,
  },

  // Content type weights per platform (what to post most)
  contentWeights: {
    instagram: { image: 0.5, video: 0.3, text: 0.15, audio: 0.05 },
    tiktok: { video: 0.6, image: 0.2, audio: 0.15, text: 0.05 },
    x: { text: 0.4, image: 0.35, video: 0.15, audio: 0.1 },
  },

  // Loop detection (Jaccard similarity threshold)
  similarityThreshold: 0.4,
  recentPostsWindow: 20, // Compare against last 20 posts

  // Optimal posting hours (UTC)
  optimalHours: {
    instagram: [9, 11, 14, 17, 19], // Morning, lunch, afternoon, evening
    tiktok: [7, 10, 14, 19, 22],    // Early morning, morning, afternoon, evening, night
    x: [8, 12, 15, 18, 21],         // Morning, noon, afternoon, evening, night
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// PLATFORM DISPLAY
// ═══════════════════════════════════════════════════════════════════════════

export const PLATFORM_DISPLAY = {
  instagram: {
    name: 'Instagram',
    icon: 'photo_camera',
    color: '#E4405F',
    gradient: 'linear-gradient(45deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888)',
  },
  tiktok: {
    name: 'TikTok',
    icon: 'music_note',
    color: '#000000',
    accent: '#25F4EE',
  },
  x: {
    name: 'X',
    icon: 'tag',
    color: '#000000',
  },
};

export default {
  oauth: PLATFORM_OAUTH_CONFIG,
  rateLimits: PLATFORM_RATE_LIMITS,
  contentSpecs: PLATFORM_CONTENT_SPECS,
  api: PLATFORM_API,
  scheduling: SCHEDULING_CONFIG,
  display: PLATFORM_DISPLAY,
};
