/**
 * BonzAI X (Twitter) Adapter
 *
 * X API v2 integration for companion autonomous posting.
 * Supports text tweets, image tweets, video tweets.
 *
 * Requirements:
 * - X Developer App with OAuth 2.0 (PKCE for public clients)
 * - Free tier: 1,500 tweets/month, read-only for timeline
 *
 * Auth: OAuth 2.0 PKCE (no client secret needed)
 * Media: Upload via v1.1 media/upload → attach to v2 tweet
 */

import { SocialPlatformAdapter } from './adapter.js';
import { PLATFORM_API } from '../../config/social.platforms.config.js';

const API = PLATFORM_API.x;

// Media upload chunk size (5MB)
const CHUNK_SIZE = 5 * 1024 * 1024;

export class XAdapter extends SocialPlatformAdapter {
  constructor(companionId) {
    super('x', companionId);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // POSTING
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Post a text tweet.
   */
  async postText(text, opts = {}) {
    const rateCheck = this.checkRateLimit();
    if (!rateCheck.allowed) {
      throw new Error(`Rate limited: ${rateCheck.reason}`);
    }

    const adapted = this.adaptContent({ text }, 'text');

    const res = await this.apiCall(`${API.base}${API.tweetsEndpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: {
        text: adapted.text,
        ...(opts.replyTo && { reply: { in_reply_to_tweet_id: opts.replyTo } }),
        ...(opts.quoteTweet && { quote_tweet_id: opts.quoteTweet }),
      },
    });

    if (res.errors) {
      throw new Error(`X post failed: ${res.errors[0]?.message || JSON.stringify(res.errors)}`);
    }

    this.recordPost();
    const tweetId = res.data?.id;
    console.log('[X] Tweet posted:', tweetId);

    return {
      postId: tweetId,
      url: tweetId ? `https://x.com/i/status/${tweetId}` : null,
    };
  }

  /**
   * Post a tweet with image attachment.
   */
  async postImage(text, imageBuffer, opts = {}) {
    const rateCheck = this.checkRateLimit();
    if (!rateCheck.allowed) {
      throw new Error(`Rate limited: ${rateCheck.reason}`);
    }

    // Upload media first (v1.1 endpoint)
    const mediaId = await this._uploadMedia(
      imageBuffer,
      opts.contentType || 'image/jpeg',
      'tweet_image'
    );

    // Set alt text if provided
    if (opts.altText) {
      await this._setMediaAltText(mediaId, opts.altText);
    }

    // Create tweet with media
    const adapted = this.adaptContent({ text }, 'image');

    const res = await this.apiCall(`${API.base}${API.tweetsEndpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: {
        text: adapted.text,
        media: { media_ids: [mediaId] },
      },
    });

    if (res.errors) {
      throw new Error(`X image post failed: ${res.errors[0]?.message}`);
    }

    this.recordPost();
    const tweetId = res.data?.id;
    console.log('[X] Image tweet posted:', tweetId);

    return {
      postId: tweetId,
      url: tweetId ? `https://x.com/i/status/${tweetId}` : null,
    };
  }

  /**
   * Post a tweet with video attachment.
   * Video upload uses chunked upload (INIT → APPEND → FINALIZE).
   */
  async postVideo(text, videoBuffer, opts = {}) {
    const rateCheck = this.checkRateLimit();
    if (!rateCheck.allowed) {
      throw new Error(`Rate limited: ${rateCheck.reason}`);
    }

    // Chunked upload for video
    const mediaId = await this._uploadChunkedMedia(
      videoBuffer,
      opts.contentType || 'video/mp4',
      'tweet_video'
    );

    // Wait for video processing
    await this._waitForMediaProcessing(mediaId);

    // Create tweet with video
    const adapted = this.adaptContent({ text }, 'video');

    const res = await this.apiCall(`${API.base}${API.tweetsEndpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: {
        text: adapted.text,
        media: { media_ids: [mediaId] },
      },
    });

    if (res.errors) {
      throw new Error(`X video post failed: ${res.errors[0]?.message}`);
    }

    this.recordPost();
    const tweetId = res.data?.id;
    console.log('[X] Video tweet posted:', tweetId);

    return {
      postId: tweetId,
      url: tweetId ? `https://x.com/i/status/${tweetId}` : null,
    };
  }

  /**
   * Post audio — must be converted to video first.
   */
  async postAudio(text, audioBuffer, opts = {}) {
    throw new Error('Audio must be converted to video before posting to X. Use content pipeline.');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // METRICS
  // ─────────────────────────────────────────────────────────────────────────

  async getMetrics(postId) {
    const res = await this.apiCall(
      `${API.base}/tweets/${postId}?tweet.fields=public_metrics`,
      { method: 'GET' }
    );

    const metrics = res.data?.public_metrics || {};

    return {
      likes: metrics.like_count || 0,
      comments: metrics.reply_count || 0,
      shares: metrics.retweet_count || 0,
      views: metrics.impression_count || 0,
      quotes: metrics.quote_count || 0,
      bookmarks: metrics.bookmark_count || 0,
    };
  }

  async deletePost(postId) {
    const res = await this.apiCall(`${API.base}/tweets/${postId}`, {
      method: 'DELETE',
    });
    return res.data?.deleted === true;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // MEDIA UPLOAD (v1.1 endpoint)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Simple media upload (for images under 5MB).
   * Uses the v1.1 media/upload endpoint with base64 encoding.
   */
  async _uploadMedia(buffer, contentType, mediaCategory) {
    const base64Data = this._bufferToBase64(buffer);

    const res = await this.apiCall(
      `${API.mediaUploadBase}${API.mediaUploadEndpoint}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          media_data: base64Data,
          media_category: mediaCategory,
        }).toString(),
      }
    );

    if (!res.media_id_string) {
      throw new Error('Media upload failed: ' + JSON.stringify(res));
    }

    return res.media_id_string;
  }

  /**
   * Chunked media upload for larger files (video).
   * Three-phase: INIT → APPEND (chunks) → FINALIZE
   */
  async _uploadChunkedMedia(buffer, contentType, mediaCategory) {
    const totalBytes = buffer.byteLength || buffer.length;

    // INIT
    const initRes = await this.apiCall(
      `${API.mediaUploadBase}${API.mediaUploadEndpoint}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          command: 'INIT',
          total_bytes: totalBytes.toString(),
          media_type: contentType,
          media_category: mediaCategory,
        }).toString(),
      }
    );

    const mediaId = initRes.media_id_string;
    if (!mediaId) throw new Error('Chunked upload INIT failed');

    // APPEND (upload in chunks)
    const uint8 = new Uint8Array(buffer);
    let segmentIndex = 0;
    let offset = 0;

    while (offset < totalBytes) {
      const end = Math.min(offset + CHUNK_SIZE, totalBytes);
      const chunk = uint8.slice(offset, end);
      const chunkBase64 = this._bufferToBase64(chunk.buffer);

      await this.apiCall(
        `${API.mediaUploadBase}${API.mediaUploadEndpoint}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            command: 'APPEND',
            media_id: mediaId,
            media_data: chunkBase64,
            segment_index: segmentIndex.toString(),
          }).toString(),
        }
      );

      offset = end;
      segmentIndex++;
    }

    // FINALIZE
    const finalizeRes = await this.apiCall(
      `${API.mediaUploadBase}${API.mediaUploadEndpoint}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          command: 'FINALIZE',
          media_id: mediaId,
        }).toString(),
      }
    );

    return mediaId;
  }

  /**
   * Poll media processing status until complete.
   * Videos need time to process after FINALIZE.
   */
  async _waitForMediaProcessing(mediaId, timeoutMs = 120000) {
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
      const res = await this.apiCall(
        `${API.mediaUploadBase}${API.mediaUploadEndpoint}?command=STATUS&media_id=${mediaId}`,
        { method: 'GET' }
      );

      const state = res.processing_info?.state;
      if (!state || state === 'succeeded') return;

      if (state === 'failed') {
        throw new Error(`X media processing failed: ${res.processing_info?.error?.message || 'Unknown'}`);
      }

      // 'pending' or 'in_progress'
      const waitSec = res.processing_info?.check_after_secs || 5;
      await new Promise(r => setTimeout(r, waitSec * 1000));
    }

    throw new Error('X media processing timed out');
  }

  /**
   * Set alt text on uploaded media.
   */
  async _setMediaAltText(mediaId, altText) {
    await this.apiCall(
      `${API.mediaUploadBase}/media/metadata/create.json`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: {
          media_id: mediaId,
          alt_text: { text: altText.slice(0, 1000) },
        },
      }
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // HELPERS
  // ─────────────────────────────────────────────────────────────────────────

  _bufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  adaptContent(content, contentType) {
    const adapted = super.adaptContent(content, contentType);

    // X has 280 char limit — be aggressive with truncation
    if (adapted.text && contentType === 'text') {
      adapted.text = this.truncateText(adapted.text, 280);
    } else if (adapted.text) {
      // With media, still limit but leave room for engagement
      adapted.text = this.truncateText(adapted.text, 260);
    }

    return adapted;
  }
}

export default XAdapter;
