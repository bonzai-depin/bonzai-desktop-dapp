/**
 * BonzAI Social Platform Integration
 *
 * Unified exports for social media integration services.
 */

export { SocialPlatformAdapter, jaccardSimilarity, isTooSimilar } from './adapter.js';
export { InstagramAdapter } from './instagram.adapter.js';
export { TikTokAdapter } from './tiktok.adapter.js';
export { XAdapter } from './x.adapter.js';
export { ContentPipeline } from './content-pipeline.js';
export { socialScheduler } from './scheduler.js';
