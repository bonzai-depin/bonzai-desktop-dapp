import { SocialPlatformAdapter } from './adapter.js';
import { XClient } from './xClient.js';

/** Existing scheduler adapter, sharing the v2 transport used by public sessions. */
export class XAdapter extends SocialPlatformAdapter {
  constructor(companionId) {
    super('x', companionId);
    this.client = new XClient(input => window.electronAPI.social.xRequest(companionId, input));
  }
  async isAuthenticated() {
    const status = await this.getCredentials();
    return Boolean(status?.connected && (!status.expires_at || status.expires_at > Date.now() || status.refreshable));
  }
  getMe() { return this.client.me(); }
  getMentions(accountId, options) { return this.client.mentions(accountId, options); }
  async publish(text, opts, media) {
    const rate = this.checkRateLimit();
    if (!rate.allowed) throw new Error(rate.reason);
    const ids = media ? [await this.client.upload(new Uint8Array(media.bytes), media.mime)] : [];
    const result = await this.client.post(this.truncateText(text, 130), { ...opts, mediaIds: ids });
    this.recordPost();
    return result;
  }
  postText(text, opts = {}) { return this.publish(text, opts); }
  postImage(text, bytes, opts = {}) { return this.publish(text, opts, { bytes, mime: opts.contentType || 'image/png' }); }
  postVideo(text, bytes, opts = {}) { return this.publish(text, opts, { bytes, mime: opts.contentType || 'video/mp4' }); }
  async postAudio(text, bytes, opts = {}) {
    const video = await window.electronAPI.social.wrapAudioInVideo({ audio: Array.from(new Uint8Array(bytes)), coverImage: opts.coverImage ? Array.from(new Uint8Array(opts.coverImage)) : null });
    return this.postVideo(text, video, opts);
  }
  async getMetrics(postId) {
    const { data } = await this.client.call(`/tweets/${postId}?tweet.fields=public_metrics`);
    const metrics = data?.public_metrics || {};
    return { likes: metrics.like_count || 0, comments: metrics.reply_count || 0, shares: metrics.retweet_count || 0, views: metrics.impression_count || 0, quotes: metrics.quote_count || 0, bookmarks: metrics.bookmark_count || 0 };
  }
  async deletePost(postId) { return (await this.client.call(`/tweets/${postId}`, 'DELETE')).data?.deleted === true; }
}
export default XAdapter;
