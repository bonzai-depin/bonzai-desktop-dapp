/**
 * BonzAI TikTok Adapter
 *
 * TikTok Content Posting API integration for companion autonomous posting.
 * Supports video upload (direct post and inbox), photo post.
 *
 * Requirements:
 * - TikTok Developer App with Content Posting API access
 * - Creator account (no business requirement)
 *
 * Flow: Init upload → Upload chunks → Poll status
 */

import { SocialPlatformAdapter } from './adapter.js';
import { PLATFORM_API } from '../../config/social.platforms.config.js';

const API = PLATFORM_API.tiktok;

export class TikTokAdapter extends SocialPlatformAdapter {
  constructor(companionId) {
    super('tiktok', companionId);
    this._openId = null;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ACCOUNT INFO
  // ─────────────────────────────────────────────────────────────────────────

  async getUserInfo() {
    const res = await this.apiCall(`${API.base}${API.userInfo}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    if (res.data?.user) {
      this._openId = res.data.user.open_id;
    }

    return res.data?.user || null;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // POSTING
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Post a video to TikTok.
   * Uses the "direct post" flow (video goes live immediately).
   */
  async postVideo(text, videoBuffer, opts = {}) {
    const rateCheck = this.checkRateLimit();
    if (!rateCheck.allowed) {
      throw new Error(`Rate limited: ${rateCheck.reason}`);
    }

    const adapted = this.adaptContent({ text }, 'video');
    const videoSize = videoBuffer.byteLength || videoBuffer.length;

    // Step 1: Initialize upload
    const initRes = await this.apiCall(`${API.base}/post/publish/video/init/`, {
      method: 'POST',
      body: {
        post_info: {
          title: adapted.text,
          privacy_level: opts.privacyLevel || 'MUTUAL_FOLLOW_FRIENDS',
          disable_duet: false,
          disable_comment: false,
          disable_stitch: false,
          video_cover_timestamp_ms: opts.coverTimestampMs || 1000,
        },
        source_info: {
          source: 'FILE_UPLOAD',
          video_size: videoSize,
          chunk_size: videoSize, // Single chunk for small files
          total_chunk_count: 1,
        },
      },
    });

    if (initRes.error?.code) {
      throw new Error(`TikTok init failed: ${initRes.error.message}`);
    }

    const publishId = initRes.data?.publish_id;
    const uploadUrl = initRes.data?.upload_url;

    if (!publishId || !uploadUrl) {
      throw new Error('TikTok init response missing publish_id or upload_url');
    }

    // Step 2: Upload video data
    const uploadRes = await this.uploadMedia(
      uploadUrl,
      videoBuffer,
      opts.contentType || 'video/mp4',
      {
        'Content-Range': `bytes 0-${videoSize - 1}/${videoSize}`,
      }
    );

    // Step 3: Poll for completion
    await this._waitForPublish(publishId);

    this.recordPost();
    console.log('[TikTok] Video posted, publish_id:', publishId);

    return {
      postId: publishId,
      url: null, // TikTok doesn't return the URL directly; need to query later
    };
  }

  /**
   * Post image(s) as a photo post (TikTok photo carousel).
   */
  async postImage(text, imageBuffer, opts = {}) {
    const rateCheck = this.checkRateLimit();
    if (!rateCheck.allowed) {
      throw new Error(`Rate limited: ${rateCheck.reason}`);
    }

    const adapted = this.adaptContent({ text }, 'image');
    const imageSize = imageBuffer.byteLength || imageBuffer.length;

    // TikTok photo post init
    const initRes = await this.apiCall(`${API.base}/post/publish/content/init/`, {
      method: 'POST',
      body: {
        post_info: {
          title: adapted.text,
          privacy_level: opts.privacyLevel || 'MUTUAL_FOLLOW_FRIENDS',
        },
        source_info: {
          source: 'FILE_UPLOAD',
          photo_cover_index: 0,
          photo_images: [
            { image_size: imageSize },
          ],
        },
        post_mode: 'DIRECT_POST',
        media_type: 'PHOTO',
      },
    });

    if (initRes.error?.code) {
      throw new Error(`TikTok photo init failed: ${initRes.error.message}`);
    }

    const publishId = initRes.data?.publish_id;
    const uploadUrls = initRes.data?.upload_urls || [];

    if (!publishId || !uploadUrls.length) {
      throw new Error('TikTok photo init response missing data');
    }

    // Upload image
    await this.uploadMedia(
      uploadUrls[0],
      imageBuffer,
      opts.contentType || 'image/jpeg'
    );

    await this._waitForPublish(publishId);

    this.recordPost();
    console.log('[TikTok] Photo posted, publish_id:', publishId);

    return { postId: publishId, url: null };
  }

  /**
   * Text-only posts are not supported on TikTok.
   */
  async postText(text, opts = {}) {
    throw new Error('TikTok does not support text-only posts. Use postImage or postVideo.');
  }

  /**
   * Audio must be wrapped in video before posting.
   */
  async postAudio(text, audioBuffer, opts = {}) {
    throw new Error('Audio must be converted to video before posting to TikTok. Use content pipeline.');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // METRICS
  // ─────────────────────────────────────────────────────────────────────────

  async getMetrics(postId) {
    // TikTok doesn't provide per-video metrics through Content Posting API
    // This would require the Research API (separate access)
    return {
      likes: 0,
      comments: 0,
      shares: 0,
      views: 0,
    };
  }

  async deletePost(postId) {
    // TikTok Content Posting API doesn't support deletion
    console.warn('[TikTok] Post deletion not supported via Content Posting API');
    return false;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // INTERNAL HELPERS
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Poll publish status until complete or failed.
   */
  async _waitForPublish(publishId, timeoutMs = 120000) {
    const start = Date.now();
    const pollInterval = 5000; // 5 seconds

    while (Date.now() - start < timeoutMs) {
      const statusRes = await this.apiCall(`${API.base}${API.publishStatus}`, {
        method: 'POST',
        body: { publish_id: publishId },
      });

      const status = statusRes.data?.status;

      if (status === 'PUBLISH_COMPLETE') return;

      if (status === 'FAILED') {
        const reason = statusRes.data?.fail_reason || 'Unknown';
        throw new Error(`TikTok publish failed: ${reason}`);
      }

      // PROCESSING_UPLOAD, PROCESSING_DOWNLOAD, SENDING_TO_USER_INBOX
      await new Promise(r => setTimeout(r, pollInterval));
    }

    throw new Error('TikTok publish timed out');
  }

  adaptContent(content, contentType) {
    const adapted = super.adaptContent(content, contentType);

    // TikTok prefers shorter, punchier captions with hashtags
    if (adapted.text && adapted.text.length > 300) {
      // Keep it concise for TikTok
      adapted.text = this.truncateText(adapted.text, 300);
    }

    return adapted;
  }
}

export default TikTokAdapter;
