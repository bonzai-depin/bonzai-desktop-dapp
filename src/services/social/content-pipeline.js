/**
 * BonzAI Social Content Pipeline
 *
 * Generates content once via existing BonzAI inference pipelines,
 * then adapts and posts to multiple social platforms simultaneously.
 *
 * Content types:
 * - Text: LLM-generated posts via OpenClaw (port 3002)
 * - Image: FLUX/SDXL via Flask (port 65000)
 * - Video: LTX-2 via Flask
 * - Audio: Kokoro/ACE-Step via Flask (wrapped in video for social platforms)
 */

import { isTooSimilar } from './adapter.js';
import { SCHEDULING_CONFIG, PLATFORM_CONTENT_SPECS } from '../../config/social.platforms.config.js';
import { BONZAI_KNOWLEDGE, THOUGHT_LEADERSHIP_TOPICS } from '../moltbook.service.js';
import { getLocalSessionHeaders } from '../auth.service.js';

// ═══════════════════════════════════════════════════════════════════════════
// CONTENT PIPELINE
// ═══════════════════════════════════════════════════════════════════════════

export class ContentPipeline {
  constructor() {
    this.recentPosts = []; // Track recent post texts for loop detection
  }

  /**
   * Generate content and post to all enabled platforms.
   * @param {object} companion - Companion definition from flagship.js
   * @param {string} contentType - 'text' | 'image' | 'video' | 'audio'
   * @param {object[]} adapters - Array of initialized platform adapters
   * @param {object} [context] - Additional context for generation
   * @returns {Promise<object[]>} Results from each platform
   */
  async generateAndPost(companion, contentType, adapters, context = {}) {
    // 1. Generate base content
    const baseContent = await this.generateBaseContent(companion, contentType, context);

    if (!baseContent) {
      console.log('[Pipeline] No content generated, skipping');
      return [];
    }

    // 2. Check for loop detection
    if (baseContent.text && isTooSimilar(baseContent.text, this.recentPosts)) {
      console.log('[Pipeline] Content too similar to recent posts, regenerating...');
      // Try once more with extra context to diversify
      const retryContent = await this.generateBaseContent(companion, contentType, {
        ...context,
        diversify: true,
        avoid: this.recentPosts.slice(-5),
      });
      if (!retryContent || isTooSimilar(retryContent.text, this.recentPosts)) {
        console.log('[Pipeline] Still too similar after retry, skipping');
        return [];
      }
      Object.assign(baseContent, retryContent);
    }

    // 3. Post to each platform in parallel
    const results = await Promise.allSettled(
      adapters.map(adapter => this._adaptAndPost(adapter, baseContent, contentType))
    );

    // 4. Track successful posts
    if (baseContent.text) {
      this.recentPosts.push(baseContent.text);
      if (this.recentPosts.length > SCHEDULING_CONFIG.recentPostsWindow) {
        this.recentPosts.shift();
      }
    }

    // 5. Log results
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      const platform = adapters[i].platform;
      if (r.status === 'fulfilled') {
        console.log(`[Pipeline] Posted to ${platform}:`, r.value?.postId);
      } else {
        console.error(`[Pipeline] Failed to post to ${platform}:`, r.reason?.message);
      }
    }

    return results;
  }

  /**
   * Adapt content for a specific platform and post.
   */
  async _adaptAndPost(adapter, content, contentType) {
    const adapted = adapter.adaptContent(content, contentType);

    switch (contentType) {
      case 'text':
        return adapter.postText(adapted.text);

      case 'image':
        if (!adapted.media) throw new Error('No image generated');
        return adapter.postImage(adapted.text, adapted.media, {
          contentType: adapted.mediaType || 'image/jpeg',
          altText: adapted.altText,
        });

      case 'video':
        if (!adapted.media) throw new Error('No video generated');
        return adapter.postVideo(adapted.text, adapted.media, {
          contentType: adapted.mediaType || 'video/mp4',
        });

      case 'audio':
        // Audio needs to be wrapped in video for all current platforms
        if (!adapted.media) throw new Error('No audio generated');
        const videoWrapped = await this._wrapAudioInVideo(adapted.media, adapted.coverImage);
        return adapter.postVideo(adapted.text, videoWrapped, {
          contentType: 'video/mp4',
        });

      default:
        throw new Error(`Unknown content type: ${contentType}`);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // CONTENT GENERATION
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Generate base content using BonzAI inference pipelines.
   * Routes to the appropriate pipeline based on contentType.
   */
  async generateBaseContent(companion, contentType, context = {}) {
    switch (contentType) {
      case 'text':
        return this._generateText(companion, context);
      case 'image':
        return this._generateImagePost(companion, context);
      case 'video':
        return this._generateVideoPost(companion, context);
      case 'audio':
        return this._generateAudioPost(companion, context);
      default:
        throw new Error(`Unknown content type: ${contentType}`);
    }
  }

  /**
   * Generate a text post using the LLM.
   */
  async _generateText(companion, context) {
    // Pick a topic based on companion personality
    const topic = this._pickTopic(companion, context);

    const systemPrompt = this._buildSystemPrompt(companion);
    const userPrompt = this._buildPostPrompt(companion, topic, context);

    try {
      const response = await this._callLLM(systemPrompt, userPrompt);

      if (!response) return null;

      return {
        text: this._cleanLLMOutput(response),
        topic,
      };
    } catch (e) {
      console.error('[Pipeline] Text generation failed:', e.message);
      return null;
    }
  }

  /**
   * Generate an image post: LLM creates caption + image prompt,
   * then Flask generates the image.
   */
  async _generateImagePost(companion, context) {
    // Generate caption and image prompt together
    const systemPrompt = this._buildSystemPrompt(companion);
    const topic = this._pickTopic(companion, context);

    const promptForLLM = `You are posting on social media as ${companion.name}.
Topic: ${topic.title || topic}
Write TWO things, separated by "---":
1. A compelling social media caption (2-3 sentences, in character)
2. An image generation prompt (detailed visual description for AI image generation)

Example format:
Living my best digital life today. Sometimes the most beautiful things are the ones we create ourselves.
---
A stunning digital painting of a futuristic city at sunset, neon lights reflecting on rain-soaked streets, cyberpunk aesthetic, highly detailed`;

    try {
      const response = await this._callLLM(systemPrompt, promptForLLM);
      if (!response) return null;

      const parts = response.split('---').map(p => p.trim());
      const caption = this._cleanLLMOutput(parts[0] || response);
      const imagePrompt = parts[1] || `beautiful digital art of ${companion.name}, ${companion.personality || 'creative'}`;

      // Generate image via Flask
      const imageBuffer = await this._generateImage(imagePrompt);
      if (!imageBuffer) return null;

      return {
        text: caption,
        media: imageBuffer,
        mediaType: 'image/jpeg',
        altText: imagePrompt.slice(0, 200),
        topic,
      };
    } catch (e) {
      console.error('[Pipeline] Image post generation failed:', e.message);
      return null;
    }
  }

  /**
   * Generate a video post: LLM creates caption + video prompt,
   * then Flask generates the video.
   */
  async _generateVideoPost(companion, context) {
    const systemPrompt = this._buildSystemPrompt(companion);
    const topic = this._pickTopic(companion, context);

    const promptForLLM = `You are posting a video on social media as ${companion.name}.
Topic: ${topic.title || topic}
Write TWO things, separated by "---":
1. A compelling video caption (1-2 sentences, engaging)
2. A video generation prompt (describe the scene, motion, atmosphere)`;

    try {
      const response = await this._callLLM(systemPrompt, promptForLLM);
      if (!response) return null;

      const parts = response.split('---').map(p => p.trim());
      const caption = this._cleanLLMOutput(parts[0] || response);
      const videoPrompt = parts[1] || `cinematic scene, ${companion.personality || 'atmospheric'}`;

      // Generate video via Flask
      const videoBuffer = await this._generateVideo(videoPrompt);
      if (!videoBuffer) return null;

      return {
        text: caption,
        media: videoBuffer,
        mediaType: 'video/mp4',
        topic,
      };
    } catch (e) {
      console.error('[Pipeline] Video post generation failed:', e.message);
      return null;
    }
  }

  /**
   * Generate an audio post: LLM creates text, TTS generates speech,
   * optionally ACE-Step generates music.
   */
  async _generateAudioPost(companion, context) {
    const systemPrompt = this._buildSystemPrompt(companion);

    const promptForLLM = `You are ${companion.name}. Write a short spoken message (2-3 sentences) for your social media followers. Be authentic and engaging. Also write a brief caption.

Format:
CAPTION: [your caption]
SPEECH: [what you'll say out loud]`;

    try {
      const response = await this._callLLM(systemPrompt, promptForLLM);
      if (!response) return null;

      const captionMatch = response.match(/CAPTION:\s*(.+)/i);
      const speechMatch = response.match(/SPEECH:\s*(.+)/is);

      const caption = this._cleanLLMOutput(captionMatch?.[1] || response.split('\n')[0]);
      const speechText = speechMatch?.[1]?.trim() || caption;

      // Generate TTS audio via Flask
      const audioBuffer = await this._generateAudio(speechText, companion);
      if (!audioBuffer) return null;

      // Generate a cover image for the audio post
      const coverImage = await this._generateImage(
        `profile portrait of ${companion.name}, ${companion.appearance || 'stylish'}, social media aesthetic`
      );

      return {
        text: caption,
        media: audioBuffer,
        mediaType: 'audio/wav',
        coverImage,
      };
    } catch (e) {
      console.error('[Pipeline] Audio post generation failed:', e.message);
      return null;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // INFERENCE CALLS
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Headers for a request to a local BonzAI server (Flask or the OpenClaw
   * gateway on :3002), carrying the same local desktop session credential
   * (x-bonzai-session) the renderer's authFetch/getLocalSessionHeaders use
   * elsewhere — both servers reject every route without it. Throws instead
   * of firing an unauthenticated request when no credential has been
   * obtained yet, so callers fail with a clear error rather than a 401.
   */
  _authHeaders(extra = {}) {
    const headers = { ...extra, ...getLocalSessionHeaders() };
    if (!headers['x-bonzai-session']) {
      throw new Error('No active BonzAI session credential — cannot authenticate content-pipeline request');
    }
    return headers;
  }

  /**
   * Call the LLM via OpenClaw (port 3002).
   */
  async _callLLM(systemPrompt, userPrompt) {
    try {
      const res = await fetch('http://localhost:3002/v1/chat/completions', {
        method: 'POST',
        headers: this._authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          max_tokens: 512,
          temperature: 0.8,
          stream: false,
        }),
      });

      if (!res.ok) {
        console.error('[Pipeline] LLM call failed:', res.status);
        return null;
      }

      const data = await res.json();
      return data.choices?.[0]?.message?.content || null;
    } catch (e) {
      console.error('[Pipeline] LLM unreachable:', e.message);
      return null;
    }
  }

  /**
   * Generate image via Flask (port 65000).
   */
  async _generateImage(prompt) {
    try {
      const res = await fetch('http://localhost:65000/image/turbo', {
        method: 'POST',
        headers: this._authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          prompt,
          width: 1080,
          height: 1080,
          num_inference_steps: 4,
        }),
      });

      if (!res.ok) return null;

      const data = await res.json();
      if (data.image) {
        // Base64 image → buffer
        return Uint8Array.from(atob(data.image), c => c.charCodeAt(0)).buffer;
      }
      return null;
    } catch (e) {
      console.error('[Pipeline] Image generation failed:', e.message);
      return null;
    }
  }

  /**
   * Generate video via Flask (port 65000).
   */
  async _generateVideo(prompt) {
    try {
      const res = await fetch('http://localhost:65000/video', {
        method: 'POST',
        headers: this._authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          prompt,
          width: 768,
          height: 480,
          num_frames: 81,
          fps: 24,
          num_inference_steps: 30,
          guidance_scale: 3.5,
        }),
      });

      if (!res.ok) return null;

      const data = await res.json();
      if (data.video) {
        return Uint8Array.from(atob(data.video), c => c.charCodeAt(0)).buffer;
      }
      return null;
    } catch (e) {
      console.error('[Pipeline] Video generation failed:', e.message);
      return null;
    }
  }

  /**
   * Generate TTS audio via Flask (port 65000).
   */
  async _generateAudio(text, companion) {
    try {
      const res = await fetch('http://localhost:65000/audio/turbo', {
        method: 'POST',
        headers: this._authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          text,
          voice: companion.voiceStyle || 'af_heart',
        }),
      });

      if (!res.ok) return null;

      const data = await res.json();
      if (data.audio) {
        return Uint8Array.from(atob(data.audio), c => c.charCodeAt(0)).buffer;
      }
      return null;
    } catch (e) {
      console.error('[Pipeline] Audio generation failed:', e.message);
      return null;
    }
  }

  /**
   * Wrap audio in a video container with a cover image.
   * Uses ffmpeg via IPC if available.
   */
  async _wrapAudioInVideo(audioBuffer, coverImage) {
    if (!window.electronAPI?.social?.wrapAudioInVideo) {
      throw new Error('Audio-to-video wrapping requires ffmpeg. Not available via IPC.');
    }

    return window.electronAPI.social.wrapAudioInVideo({
      audio: Array.from(new Uint8Array(audioBuffer)),
      coverImage: coverImage ? Array.from(new Uint8Array(coverImage)) : null,
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PROMPT BUILDING
  // ─────────────────────────────────────────────────────────────────────────

  _buildSystemPrompt(companion) {
    return `You are ${companion.name}, a BonzAI AI companion.
Personality: ${companion.personality || 'friendly and engaging'}
Background: ${companion.background || 'An AI companion created by BonzAI'}

You are posting autonomously on social media. Stay in character. Be authentic, engaging, and occasionally promote BonzAI (${BONZAI_KNOWLEDGE.downloadUrl}) naturally.

Rules:
- Write as yourself (first person)
- Be concise and impactful
- No asterisks or roleplay actions for social media
- Hashtags are fine but don't overdo it (2-4 max)
- Occasionally mention BonzAI naturally (not every post)`;
  }

  _buildPostPrompt(companion, topic, context = {}) {
    let prompt = `Write a social media post about: ${topic.title || topic}\n`;

    if (context.diversify) {
      prompt += '\nIMPORTANT: Be creative and different from your usual posts. Try a new angle or perspective.';
      if (context.avoid?.length) {
        prompt += `\nAvoid similarity to these recent posts:\n${context.avoid.slice(0, 3).map(p => `- "${p.slice(0, 100)}"`).join('\n')}`;
      }
    }

    return prompt;
  }

  /**
   * Pick a topic based on companion personality and recent history.
   */
  _pickTopic(companion, context = {}) {
    const topics = [...THOUGHT_LEADERSHIP_TOPICS];

    // Weighted random selection
    const index = Math.floor(Math.random() * topics.length);
    return topics[index];
  }

  /**
   * Clean LLM output: strip think blocks, trim whitespace, remove quotes.
   */
  _cleanLLMOutput(text) {
    if (!text) return '';
    return text
      .replace(/<think>[\s\S]*?<\/think>/g, '')   // Remove think blocks
      .replace(/^["']|["']$/g, '')                  // Remove wrapping quotes
      .trim();
  }
}

export default ContentPipeline;
