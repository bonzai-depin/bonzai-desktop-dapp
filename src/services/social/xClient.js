// X API v2. The transport owns authentication; credentials never enter chat context.
export class XClient {
  constructor(request, { sleep = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) { this.request = request; this.sleep = sleep; }
  async call(path, method = 'GET', body) {
    const response = await this.request({ path, method, body });
    if (response.status === 0 || response.status >= 400 || response.errors?.length || response.error) {
      const error = new Error(response.detail || response.error || response.errors?.[0]?.detail || response.errors?.[0]?.message || `X request failed (${response.status}).`);
      error.status = response.status;
      throw error;
    }
    return response;
  }
  async me() { const result = await this.call('/users/me'); if (!result.data?.id || !result.data?.username) throw new Error('X did not return the connected account.'); return result.data; }
  mentions(accountId, { sinceId, page, startTime } = {}) {
    const query = new URLSearchParams({ max_results: '100', 'tweet.fields': 'author_id,conversation_id,created_at,entities,referenced_tweets', expansions: 'author_id', 'user.fields': 'username' });
    if (sinceId) query.set('since_id', sinceId); else if (startTime) query.set('start_time', startTime);
    if (page) query.set('pagination_token', page);
    return this.call(`/users/${accountId}/mentions?${query}`);
  }
  async upload(bytes, mime) {
    if (!bytes?.byteLength) throw new Error('No media bytes to upload.');
    // A BonzAI public reply is deliberately bounded, independently of the owner's X plan.
    if (bytes.byteLength > 64 * 1024 * 1024) throw new Error('This reply exceeds the 64 MB local upload limit.');
    const category = mime.startsWith('image/') ? 'tweet_image' : 'tweet_video';
    const init = await this.call('/media/upload/initialize', 'POST', { total_bytes: bytes.byteLength, media_type: mime, media_category: category });
    const id = init.data?.id;
    if (!id) throw new Error('X did not create a media upload.');
    for (let offset = 0, index = 0; offset < bytes.byteLength; offset += 4 * 1024 * 1024, index++) {
      await this.call(`/media/upload/${id}/append`, 'POST', { media: bytesToBase64(bytes.subarray(offset, offset + 4 * 1024 * 1024)), segment_index: index });
    }
    let result = await this.call(`/media/upload/${id}/finalize`, 'POST', {});
    for (let attempt = 0; attempt < 30; attempt++) {
      const state = result.data?.processing_info?.state;
      if (state === 'succeeded' || (!state && result.data?.id === id)) return id;
      if (state === 'failed') throw new Error('X could not process this media.');
      if (!['pending', 'in_progress'].includes(state)) throw new Error('X returned an unknown media processing state.');
      await this.sleep(Math.min(10000, Math.max(1000, (result.data.processing_info.check_after_secs || 2) * 1000)));
      result = await this.call(`/media/upload?media_id=${id}&command=STATUS`);
    }
    throw new Error('X media processing timed out. No reply was posted.');
  }
  async post(text, { replyTo, mediaIds = [], quoteTweet } = {}) {
    const body = { text, ...(replyTo && { reply: { in_reply_to_tweet_id: replyTo } }), ...(mediaIds.length && { media: { media_ids: mediaIds } }), ...(quoteTweet && { quote_tweet_id: quoteTweet }) };
    const response = await this.call('/tweets', 'POST', body);
    if (!response.data?.id) throw Object.assign(new Error('X did not confirm a post ID. Check the account before retrying.'), { status: 0 });
    return { postId: response.data.id, url: `https://x.com/i/status/${response.data.id}` };
  }
}

export function bytesToBase64(bytes) {
  let result = '';
  for (let i = 0; i < bytes.length; i += 8192) result += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(result);
}

export function publicReplyText(result) {
  const audio = result.artifacts?.some(item => item.kind === 'audio');
  const media = result.artifacts?.some(item => ['image', 'audio', 'video'].includes(item.kind));
  const text = result.replyText !== undefined ? result.replyText : audio ? `${result.title}. Created locally with BonzAI.` : media ? `${result.title}. Created locally with BonzAI.` : result.text || result.artifacts?.find(item => item.text)?.text || '';
  // CJK and emoji count as two weighted characters on X. Conservative cap avoids cutting URLs.
  if (!text.trim()) throw new Error('There is no reply to publish.');
  const characters = Array.from(text);
  if (characters.length > 130) throw new Error('This result is too long for a single X reply. Edit the reply text in BonzAI; it has not been silently truncated.');
  return characters.slice(0, 130).join('');
}
