/**
 * BonzAI Instagram Adapter
 *
 * Instagram Graph API v21 integration for companion autonomous posting.
 * Supports images, Reels (video), and carousels via container-based publishing.
 *
 * Requirements:
 * - Meta Developer App with Instagram Graph API
 * - Instagram Professional (Business/Creator) account linked to Facebook Page
 *
 * Flow: Create container → Poll status → Publish container
 */

import { SocialPlatformAdapter } from './adapter.js';
import { PLATFORM_API } from '../../config/social.platforms.config.js';

const API = PLATFORM_API.instagram;

export class InstagramAdapter extends SocialPlatformAdapter {
  constructor(companionId) {
    super('instagram', companionId);
    this._igUserId = null; // Cached Instagram Business Account ID
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ACCOUNT SETUP
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Get the Instagram Business Account ID linked to the user's Facebook Page.
   * Must be called after authentication.
   */
  async getInstagramAccountId() {
    if (this._igUserId) return this._igUserId;

    // Step 1: Get Facebook Pages
    const pagesRes = await this.apiCall(`${API.base}${API.accountsEndpoint}`, {
      method: 'GET',
    });

    if (!pagesRes.data?.length) {
      throw new Error('No Facebook Pages found. Link an Instagram Professional account to a Facebook Page.');
    }

    // Step 2: Get Instagram Business Account from first page
    const pageId = pagesRes.data[0].id;
    const pageToken = pagesRes.data[0].access_token;

    const igRes = await this.apiCall(
      `${API.base}/${pageId}?fields=instagram_business_account`,
      { method: 'GET' }
    );

    if (!igRes.instagram_business_account?.id) {
      throw new Error('No Instagram Business Account linked to this Facebook Page.');
    }

    this._igUserId = igRes.instagram_business_account.id;
    // Store page token for future API calls (has more permissions)
    this._pageToken = pageToken;

    console.log('[Instagram] Account ID:', this._igUserId);
    return this._igUserId;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // POSTING
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Post a single image with caption.
   * Instagram requires the image to be accessible via URL, so we upload
   * to a temporary hosting service or use a data URL approach via the API.
   */
  async postImage(text, imageBuffer, opts = {}) {
    const rateCheck = this.checkRateLimit();
    if (!rateCheck.allowed) {
      throw new Error(`Rate limited: ${rateCheck.reason} (wait ${Math.ceil(rateCheck.waitMs / 1000)}s)`);
    }

    const userId = await this.getInstagramAccountId();
    const adapted = this.adaptContent({ text }, 'image');

    // Upload image to get a URL (via IPC → temporary host or direct base64)
    const imageUrl = await this._uploadImageForIG(imageBuffer, opts.contentType || 'image/jpeg');

    // Step 1: Create media container
    const container = await this.apiCall(`${API.base}${API.mediaEndpoint(userId)}`, {
      method: 'POST',
      body: {
        image_url: imageUrl,
        caption: adapted.text,
        ...(opts.altText && { alt_text: opts.altText }),
      },
    });

    if (!container.id) {
      throw new Error('Failed to create Instagram media container: ' + JSON.stringify(container));
    }

    // Step 2: Wait for container to be ready
    await this._waitForContainer(container.id);

    // Step 3: Publish
    const published = await this.apiCall(`${API.base}${API.publishEndpoint(userId)}`, {
      method: 'POST',
      body: { creation_id: container.id },
    });

    this.recordPost();
    console.log('[Instagram] Image posted:', published.id);

    return {
      postId: published.id,
      url: `https://www.instagram.com/p/${published.id}/`,
    };
  }

  /**
   * Post a video as a Reel.
   */
  async postVideo(text, videoBuffer, opts = {}) {
    const rateCheck = this.checkRateLimit();
    if (!rateCheck.allowed) {
      throw new Error(`Rate limited: ${rateCheck.reason}`);
    }

    const userId = await this.getInstagramAccountId();
    const adapted = this.adaptContent({ text }, 'video');

    // Upload video to get a URL
    const videoUrl = await this._uploadVideoForIG(videoBuffer, opts.contentType || 'video/mp4');

    // Create Reel container
    const container = await this.apiCall(`${API.base}${API.mediaEndpoint(userId)}`, {
      method: 'POST',
      body: {
        media_type: 'REELS',
        video_url: videoUrl,
        caption: adapted.text,
        share_to_feed: true,
        ...(opts.coverUrl && { cover_url: opts.coverUrl }),
        ...(opts.thumbOffset && { thumb_offset: opts.thumbOffset }),
      },
    });

    if (!container.id) {
      throw new Error('Failed to create Instagram Reel container');
    }

    // Wait for video processing (can take longer than images)
    await this._waitForContainer(container.id, 120000); // 2 min timeout

    // Publish
    const published = await this.apiCall(`${API.base}${API.publishEndpoint(userId)}`, {
      method: 'POST',
      body: { creation_id: container.id },
    });

    this.recordPost();
    console.log('[Instagram] Reel posted:', published.id);

    return {
      postId: published.id,
      url: `https://www.instagram.com/reel/${published.id}/`,
    };
  }

  /**
   * Post text only — Instagram doesn't support text-only posts.
   * We generate an image with the text overlaid via the image pipeline.
   */
  async postText(text, opts = {}) {
    console.log('[Instagram] Text-only posts not supported. Use postImage instead.');
    throw new Error('Instagram does not support text-only posts. Generate an image to accompany text.');
  }

  /**
   * Post audio — wrap in a Reel with a cover image.
   */
  async postAudio(text, audioBuffer, opts = {}) {
    // Audio posts on Instagram must be Reels with audio track
    // This requires ffmpeg to combine audio + cover image into video
    // The content pipeline handles this conversion before calling postVideo
    throw new Error('Audio must be converted to video (Reel) before posting to Instagram. Use content pipeline.');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // METRICS
  // ─────────────────────────────────────────────────────────────────────────

  async getMetrics(postId) {
    const res = await this.apiCall(
      `${API.base}/${postId}?fields=like_count,comments_count,timestamp,media_type`,
      { method: 'GET' }
    );

    // Get insights for reach/impressions (only for business accounts)
    let insights = {};
    try {
      const insightsRes = await this.apiCall(
        `${API.base}${API.insightsEndpoint(postId)}?metric=reach,impressions,engagement`,
        { method: 'GET' }
      );
      for (const metric of (insightsRes.data || [])) {
        insights[metric.name] = metric.values?.[0]?.value || 0;
      }
    } catch (e) {
      // Insights may not be available for all post types
    }

    return {
      likes: res.like_count || 0,
      comments: res.comments_count || 0,
      shares: 0, // Not available via API
      views: insights.impressions || 0,
      reach: insights.reach || 0,
      engagement: insights.engagement || 0,
    };
  }

  async deletePost(postId) {
    await this.apiCall(`${API.base}/${postId}`, { method: 'DELETE' });
    return true;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // INTERNAL HELPERS
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Upload image and return a publicly accessible URL.
   * Instagram Graph API requires image_url (not direct upload).
   * We use the IPC media upload to a temporary hosting endpoint.
   */
  async _uploadImageForIG(buffer, contentType) {
    // Use IPC to upload to temporary storage and get URL
    const result = await this.uploadMedia(
      '__temp_host__', // Special URL handled by IPC to host temporarily
      buffer,
      contentType,
      { purpose: 'instagram_image' }
    );
    return result.url;
  }

  async _uploadVideoForIG(buffer, contentType) {
    const result = await this.uploadMedia(
      '__temp_host__',
      buffer,
      contentType,
      { purpose: 'instagram_video' }
    );
    return result.url;
  }

  /**
   * Poll container status until FINISHED or timeout.
   * Instagram processes media asynchronously.
   */
  async _waitForContainer(containerId, timeoutMs = 60000) {
    const start = Date.now();
    const pollInterval = 3000; // 3 seconds

    while (Date.now() - start < timeoutMs) {
      const status = await this.apiCall(
        `${API.base}/${containerId}?fields=status_code,status`,
        { method: 'GET' }
      );

      if (status.status_code === 'FINISHED') return;
      if (status.status_code === 'ERROR') {
        throw new Error(`Instagram container error: ${status.status || 'Unknown error'}`);
      }

      // IN_PROGRESS — wait and retry
      await new Promise(r => setTimeout(r, pollInterval));
    }

    throw new Error('Instagram container processing timed out');
  }

  /**
   * Adapt content for Instagram-specific constraints
   */
  adaptContent(content, contentType) {
    const adapted = super.adaptContent(content, contentType);

    // Add hashtags if space allows
    if (adapted.text && adapted.text.length < this.contentSpecs.text.maxLength - 100) {
      // Don't add hashtags here — let the content pipeline handle it
    }

    return adapted;
  }
}

export default InstagramAdapter;
