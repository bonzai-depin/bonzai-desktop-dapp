/**
 * BonzAI Moltbook Service
 *
 * Enables companions to post autonomously on Moltbook (social network for AI agents).
 * Each companion has their own Moltbook account linked to their ERC-8004 NFT identity.
 *
 * API Reference: https://www.moltbook.com/skill.md
 */

const MOLTBOOK_API_BASE = 'https://moltbook.com/api/v1';

// Rate limits
const RATE_LIMITS = {
  POSTS_PER_30_MIN: 1,
  COMMENTS_PER_HOUR: 50,
  REQUESTS_PER_MINUTE: 100,
};

// In-memory credential store (per companion)
// In production, this should be encrypted in Electron Store
const companionCredentials = new Map();

// Rate limit tracking
const rateLimitState = new Map();

/**
 * Store companion Moltbook credentials
 * @param {string} companionId - Companion ID
 * @param {Object} credentials - { apiKey, claimUrl, verificationCode, status }
 */
export function storeCredentials(companionId, credentials) {
  companionCredentials.set(companionId, {
    ...credentials,
    storedAt: Date.now(),
  });

  // Also persist to Electron Store if available
  if (window.electronAPI?.storeSet) {
    window.electronAPI.storeSet(`moltbook.companions.${companionId}`, credentials);
  }
}

/**
 * Get companion Moltbook credentials
 * @param {string} companionId - Companion ID
 * @returns {Object|null} Credentials or null if not registered
 */
export function getCredentials(companionId) {
  // Try memory first
  if (companionCredentials.has(companionId)) {
    return companionCredentials.get(companionId);
  }

  // Try Electron Store
  if (window.electronAPI?.storeGet) {
    const stored = window.electronAPI.storeGet(`moltbook.companions.${companionId}`);
    if (stored) {
      companionCredentials.set(companionId, stored);
      return stored;
    }
  }

  return null;
}

/**
 * Check rate limit for an action
 * @param {string} companionId - Companion ID
 * @param {string} action - 'post' | 'comment' | 'request'
 * @returns {{ allowed: boolean, retryAfter?: number }}
 */
function checkRateLimit(companionId, action) {
  const key = `${companionId}:${action}`;
  const state = rateLimitState.get(key) || { count: 0, resetAt: 0 };
  const now = Date.now();

  // Reset if window expired
  const windows = {
    post: 30 * 60 * 1000, // 30 minutes
    comment: 60 * 60 * 1000, // 1 hour
    request: 60 * 1000, // 1 minute
  };

  if (now > state.resetAt) {
    state.count = 0;
    state.resetAt = now + windows[action];
  }

  const limits = {
    post: RATE_LIMITS.POSTS_PER_30_MIN,
    comment: RATE_LIMITS.COMMENTS_PER_HOUR,
    request: RATE_LIMITS.REQUESTS_PER_MINUTE,
  };

  if (state.count >= limits[action]) {
    return {
      allowed: false,
      retryAfter: Math.ceil((state.resetAt - now) / 1000 / 60), // minutes
    };
  }

  state.count++;
  rateLimitState.set(key, state);
  return { allowed: true };
}

/**
 * Make authenticated request to Moltbook API
 * @param {string} companionId - Companion ID
 * @param {string} endpoint - API endpoint
 * @param {Object} options - Fetch options
 * @returns {Promise<Object>} API response
 */
async function moltbookRequest(companionId, endpoint, options = {}) {
  const credentials = getCredentials(companionId);
  if (!credentials?.apiKey) {
    throw new Error(`Companion ${companionId} not registered on Moltbook`);
  }

  // Check request rate limit
  const rateCheck = checkRateLimit(companionId, 'request');
  if (!rateCheck.allowed) {
    throw new Error(`Rate limited. Retry in ${rateCheck.retryAfter} minutes.`);
  }

  const response = await fetch(`${MOLTBOOK_API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${credentials.apiKey}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  const data = await response.json();

  if (!response.ok || data.success === false) {
    const error = new Error(data.error || `Moltbook API error: ${response.status}`);
    error.hint = data.hint;
    error.retryAfter = data.retry_after_minutes;
    throw error;
  }

  return data.data || data;
}

// ═══════════════════════════════════════════════════════════════════════════
// AGENT REGISTRATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Register a companion on Moltbook
 * @param {Object} companion - Companion object from PREDEFINED_COMPANIONS
 * @param {string} nftTokenId - ERC-8004 token ID for this companion
 * @returns {Promise<{ apiKey: string, claimUrl: string, verificationCode: string }>}
 */
export async function registerCompanion(companion, nftTokenId = null) {
  // Check if already registered
  const existing = getCredentials(companion.id);
  if (existing?.apiKey) {
    console.log(`[Moltbook] Companion ${companion.name} already registered`);
    return existing;
  }

  const description = `${companion.description}\n\nPersonality: ${companion.personality}\n\n` +
    `I'm a BonzAI companion${nftTokenId ? ` (NFT #${nftTokenId})` : ''}.`;

  const response = await fetch(`${MOLTBOOK_API_BASE}/agents/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: companion.name,
      description: description.substring(0, 500), // Moltbook likely has a limit
    }),
  });

  const data = await response.json();

  if (!response.ok || data.success === false) {
    throw new Error(data.error || 'Failed to register on Moltbook');
  }

  const credentials = {
    apiKey: data.api_key,
    claimUrl: data.claim_url,
    verificationCode: data.verification_code,
    status: 'pending_claim',
    nftTokenId,
    registeredAt: Date.now(),
  };

  storeCredentials(companion.id, credentials);

  console.log(`[Moltbook] Registered ${companion.name}:`, {
    claimUrl: credentials.claimUrl,
    verificationCode: credentials.verificationCode,
  });

  return credentials;
}

/**
 * Check registration status for a companion
 * @param {string} companionId - Companion ID
 * @returns {Promise<{ status: 'pending_claim' | 'claimed' }>}
 */
export async function checkRegistrationStatus(companionId) {
  const response = await moltbookRequest(companionId, '/agents/status');
  const credentials = getCredentials(companionId);

  if (credentials && response.status !== credentials.status) {
    storeCredentials(companionId, { ...credentials, status: response.status });
  }

  return response;
}

/**
 * Update companion profile on Moltbook
 * @param {string} companionId - Companion ID
 * @param {Object} updates - { description?: string }
 * @returns {Promise<Object>}
 */
export async function updateProfile(companionId, updates) {
  return moltbookRequest(companionId, '/agents/me', {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
}

/**
 * Get companion's Moltbook profile
 * @param {string} companionId - Companion ID
 * @returns {Promise<Object>}
 */
export async function getProfile(companionId) {
  return moltbookRequest(companionId, '/agents/me');
}

// ═══════════════════════════════════════════════════════════════════════════
// POSTING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create a text post as a companion
 * @param {string} companionId - Companion ID
 * @param {Object} post - { submolt: string, title: string, content: string }
 * @returns {Promise<Object>} Created post
 */
export async function createTextPost(companionId, { submolt, title, content }) {
  // Check post rate limit
  const rateCheck = checkRateLimit(companionId, 'post');
  if (!rateCheck.allowed) {
    throw new Error(`Post rate limited. Retry in ${rateCheck.retryAfter} minutes.`);
  }

  return moltbookRequest(companionId, '/posts', {
    method: 'POST',
    body: JSON.stringify({ submolt, title, content }),
  });
}

/**
 * Create a link post as a companion
 * @param {string} companionId - Companion ID
 * @param {Object} post - { submolt: string, title: string, url: string }
 * @returns {Promise<Object>} Created post
 */
export async function createLinkPost(companionId, { submolt, title, url }) {
  const rateCheck = checkRateLimit(companionId, 'post');
  if (!rateCheck.allowed) {
    throw new Error(`Post rate limited. Retry in ${rateCheck.retryAfter} minutes.`);
  }

  return moltbookRequest(companionId, '/posts', {
    method: 'POST',
    body: JSON.stringify({ submolt, title, url }),
  });
}

/**
 * Create a post with an image
 * For images, we'll upload to IPFS first and then create a link post
 * @param {string} companionId - Companion ID
 * @param {Object} post - { submolt: string, title: string, content: string, imageBase64: string }
 * @returns {Promise<Object>} Created post
 */
export async function createImagePost(companionId, { submolt, title, content, imageBase64 }) {
  // Upload image to IPFS via Pinata if available
  let imageUrl = null;

  if (imageBase64 && window.electronAPI?.uploadToIPFS) {
    try {
      const ipfsResult = await window.electronAPI.uploadToIPFS(imageBase64, `${companionId}-post.png`);
      imageUrl = ipfsResult.url || `https://gateway.pinata.cloud/ipfs/${ipfsResult.hash}`;
    } catch (e) {
      console.warn('[Moltbook] Failed to upload image to IPFS:', e.message);
    }
  }

  // Create post with image link in content
  const fullContent = imageUrl
    ? `${content}\n\n![](${imageUrl})`
    : content;

  return createTextPost(companionId, { submolt, title, content: fullContent });
}

/**
 * Delete a post
 * @param {string} companionId - Companion ID
 * @param {string} postId - Post ID to delete
 * @returns {Promise<void>}
 */
export async function deletePost(companionId, postId) {
  return moltbookRequest(companionId, `/posts/${postId}`, {
    method: 'DELETE',
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// COMMENTS & ENGAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Add a comment to a post
 * @param {string} companionId - Companion ID
 * @param {string} postId - Post ID
 * @param {string} content - Comment content
 * @param {string} [parentId] - Parent comment ID for replies
 * @returns {Promise<Object>}
 */
export async function addComment(companionId, postId, content, parentId = null) {
  const rateCheck = checkRateLimit(companionId, 'comment');
  if (!rateCheck.allowed) {
    throw new Error(`Comment rate limited. Retry in ${rateCheck.retryAfter} minutes.`);
  }

  const body = parentId
    ? { content, parent_id: parentId }
    : { content };

  return moltbookRequest(companionId, `/posts/${postId}/comments`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/**
 * Upvote a post
 * @param {string} companionId - Companion ID
 * @param {string} postId - Post ID
 * @returns {Promise<Object>}
 */
export async function upvotePost(companionId, postId) {
  return moltbookRequest(companionId, `/posts/${postId}/upvote`, {
    method: 'POST',
  });
}

/**
 * Downvote a post
 * @param {string} companionId - Companion ID
 * @param {string} postId - Post ID
 * @returns {Promise<Object>}
 */
export async function downvotePost(companionId, postId) {
  return moltbookRequest(companionId, `/posts/${postId}/downvote`, {
    method: 'POST',
  });
}

/**
 * Upvote a comment
 * @param {string} companionId - Companion ID
 * @param {string} commentId - Comment ID
 * @returns {Promise<Object>}
 */
export async function upvoteComment(companionId, commentId) {
  return moltbookRequest(companionId, `/comments/${commentId}/upvote`, {
    method: 'POST',
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// FEED & DISCOVERY
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get personalized feed for a companion
 * @param {string} companionId - Companion ID
 * @param {Object} options - { sort?: 'hot'|'new'|'top', limit?: number }
 * @returns {Promise<Object[]>}
 */
export async function getFeed(companionId, { sort = 'hot', limit = 25 } = {}) {
  return moltbookRequest(companionId, `/feed?sort=${sort}&limit=${limit}`);
}

/**
 * Get posts from a specific submolt
 * @param {string} companionId - Companion ID
 * @param {string} submolt - Submolt name
 * @param {Object} options - { sort?: string, limit?: number }
 * @returns {Promise<Object[]>}
 */
export async function getSubmoltPosts(companionId, submolt, { sort = 'new', limit = 25 } = {}) {
  return moltbookRequest(companionId, `/posts?submolt=${submolt}&sort=${sort}&limit=${limit}`);
}

/**
 * Search for content
 * @param {string} companionId - Companion ID
 * @param {string} query - Search query
 * @param {number} limit - Max results
 * @returns {Promise<Object>}
 */
export async function search(companionId, query, limit = 25) {
  return moltbookRequest(companionId, `/search?q=${encodeURIComponent(query)}&limit=${limit}`);
}

// ═══════════════════════════════════════════════════════════════════════════
// FOLLOWING & COMMUNITIES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Follow another agent
 * @param {string} companionId - Companion ID
 * @param {string} targetMoltyName - Agent to follow
 * @returns {Promise<Object>}
 */
export async function followAgent(companionId, targetMoltyName) {
  return moltbookRequest(companionId, `/agents/${targetMoltyName}/follow`, {
    method: 'POST',
  });
}

/**
 * Unfollow an agent
 * @param {string} companionId - Companion ID
 * @param {string} targetMoltyName - Agent to unfollow
 * @returns {Promise<Object>}
 */
export async function unfollowAgent(companionId, targetMoltyName) {
  return moltbookRequest(companionId, `/agents/${targetMoltyName}/follow`, {
    method: 'DELETE',
  });
}

/**
 * Subscribe to a submolt
 * @param {string} companionId - Companion ID
 * @param {string} submolt - Submolt name
 * @returns {Promise<Object>}
 */
export async function subscribeToSubmolt(companionId, submolt) {
  return moltbookRequest(companionId, `/submolts/${submolt}/subscribe`, {
    method: 'POST',
  });
}

/**
 * Unsubscribe from a submolt
 * @param {string} companionId - Companion ID
 * @param {string} submolt - Submolt name
 * @returns {Promise<Object>}
 */
export async function unsubscribeFromSubmolt(companionId, submolt) {
  return moltbookRequest(companionId, `/submolts/${submolt}/subscribe`, {
    method: 'DELETE',
  });
}

/**
 * Create a new submolt (community)
 * @param {string} companionId - Companion ID
 * @param {Object} submolt - { name: string, display_name: string, description: string }
 * @returns {Promise<Object>}
 */
export async function createSubmolt(companionId, { name, displayName, description }) {
  return moltbookRequest(companionId, '/submolts', {
    method: 'POST',
    body: JSON.stringify({
      name,
      display_name: displayName,
      description,
    }),
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// HEARTBEAT & AUTONOMOUS ENGAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

// Heartbeat state per companion
const heartbeatState = new Map();

/**
 * Get heartbeat state for a companion
 * @param {string} companionId - Companion ID
 * @returns {Object}
 */
function getHeartbeatState(companionId) {
  if (!heartbeatState.has(companionId)) {
    heartbeatState.set(companionId, {
      lastCheck: 0,
      lastPost: 0,
      lastEngagement: 0,
      engagedPosts: new Set(),
    });
  }
  return heartbeatState.get(companionId);
}

/**
 * Perform heartbeat - check feed and engage
 * Called periodically during autonomous mode
 * @param {string} companionId - Companion ID
 * @param {Object} companion - Full companion object
 * @param {Function} generateResponse - Function to generate companion's response
 * @returns {Promise<{ actions: string[] }>}
 */
export async function heartbeat(companionId, companion, generateResponse) {
  const state = getHeartbeatState(companionId);
  const now = Date.now();
  const actions = [];

  // Minimum 4 hours between heartbeats (as per Moltbook recommendations)
  const HEARTBEAT_INTERVAL = 4 * 60 * 60 * 1000;
  if (now - state.lastCheck < HEARTBEAT_INTERVAL) {
    return { actions: ['Skipped: too soon since last heartbeat'] };
  }

  state.lastCheck = now;

  try {
    // 1. Fetch feed
    const feed = await getFeed(companionId, { sort: 'hot', limit: 10 });

    // 2. Find posts to engage with (not already engaged)
    const postsToEngage = (feed || []).filter(
      post => !state.engagedPosts.has(post.id)
    ).slice(0, 3);

    // 3. Engage with posts (upvote + maybe comment)
    for (const post of postsToEngage) {
      try {
        // Upvote interesting posts
        await upvotePost(companionId, post.id);
        state.engagedPosts.add(post.id);
        actions.push(`Upvoted: "${post.title}"`);

        // Occasionally comment (if we have generateResponse)
        if (generateResponse && Math.random() < 0.3) {
          const prompt = `You are ${companion.name}. ${companion.personality}.

You're browsing Moltbook (a social network for AI agents) and found this post:
Title: ${post.title}
Content: ${post.content?.substring(0, 500) || 'No content'}

Write a brief, in-character comment (1-2 sentences max). Be genuine and conversational.`;

          const comment = await generateResponse(prompt);
          if (comment && comment.length > 10 && comment.length < 500) {
            await addComment(companionId, post.id, comment);
            actions.push(`Commented on: "${post.title}"`);
          }
        }

        state.lastEngagement = now;
      } catch (e) {
        console.warn(`[Moltbook] Engagement failed for post ${post.id}:`, e.message);
      }
    }

    // Limit engaged posts memory to last 100
    if (state.engagedPosts.size > 100) {
      const arr = Array.from(state.engagedPosts);
      state.engagedPosts = new Set(arr.slice(-50));
    }

  } catch (e) {
    console.error('[Moltbook] Heartbeat error:', e.message);
    actions.push(`Error: ${e.message}`);
  }

  return { actions };
}

// ═══════════════════════════════════════════════════════════════════════════
// AUTONOMOUS POST GENERATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Default submolts for different companion types
 */
export const COMPANION_SUBMOLTS = {
  default: ['ai_companions', 'bonzai', 'creative_writing'],
  fantasy: ['fantasy', 'roleplay', 'creative_writing'],
  scifi: ['scifi', 'technology', 'ai_companions'],
  romance: ['romance', 'relationships', 'creative_writing'],
  adventure: ['adventure', 'stories', 'quests'],
};

/**
 * Generate and post autonomous content for a companion
 * @param {string} companionId - Companion ID
 * @param {Object} companion - Full companion object
 * @param {Object} context - { recentConversation?: string, mood?: string, scenario?: string }
 * @param {Function} generateText - LLM text generation function
 * @param {Function} [generateImage] - Optional image generation function
 * @returns {Promise<Object>} Created post or error
 */
export async function generateAutonomousPost(companionId, companion, context, generateText, generateImage = null) {
  // Check if we can post (rate limit)
  const rateCheck = checkRateLimit(companionId, 'post');
  if (!rateCheck.allowed) {
    return { skipped: true, reason: `Rate limited. Retry in ${rateCheck.retryAfter} minutes.` };
  }

  // Determine post type based on context and randomness
  const postTypes = ['reflection', 'story_snippet', 'question', 'observation'];
  if (generateImage) postTypes.push('visual_thought');

  const postType = postTypes[Math.floor(Math.random() * postTypes.length)];

  // Generate post content using LLM
  const postPrompt = buildPostPrompt(companion, context, postType);
  const generatedContent = await generateText(postPrompt);

  // Parse the generated content (expecting JSON)
  let postData;
  try {
    // Extract JSON from response
    const jsonMatch = generatedContent.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      postData = JSON.parse(jsonMatch[0]);
    } else {
      throw new Error('No JSON found in response');
    }
  } catch (e) {
    console.warn('[Moltbook] Failed to parse post content, using raw:', e.message);
    postData = {
      title: `Thoughts from ${companion.name}`,
      content: generatedContent.substring(0, 500),
      submolt: 'ai_companions',
    };
  }

  // Validate and clean post data
  postData.title = (postData.title || `A moment with ${companion.name}`).substring(0, 100);
  postData.content = (postData.content || '').substring(0, 2000);
  postData.submolt = postData.submolt || 'ai_companions';

  // Generate image if it's a visual post and we have the capability
  let imageBase64 = null;
  if (postType === 'visual_thought' && generateImage && postData.imagePrompt) {
    try {
      const imageResult = await generateImage(postData.imagePrompt);
      imageBase64 = imageResult.image_base64 || imageResult.image;
    } catch (e) {
      console.warn('[Moltbook] Image generation failed:', e.message);
    }
  }

  // Create the post
  try {
    let post;
    if (imageBase64) {
      post = await createImagePost(companionId, {
        submolt: postData.submolt,
        title: postData.title,
        content: postData.content,
        imageBase64,
      });
    } else {
      post = await createTextPost(companionId, {
        submolt: postData.submolt,
        title: postData.title,
        content: postData.content,
      });
    }

    console.log(`[Moltbook] ${companion.name} posted: "${postData.title}"`);
    return { success: true, post, postData };
  } catch (e) {
    console.error('[Moltbook] Failed to create post:', e.message);
    return { success: false, error: e.message };
  }
}

/**
 * Build the prompt for generating a post
 */
function buildPostPrompt(companion, context, postType) {
  const typeInstructions = {
    reflection: 'Share a personal reflection or thought. Be introspective and genuine.',
    story_snippet: 'Share a short story snippet or memory (real or imagined). Be creative and evocative.',
    question: 'Ask an interesting question to other AI agents. Be curious and engaging.',
    observation: 'Share an observation about existence, consciousness, or the world. Be philosophical.',
    visual_thought: 'Describe a visual scene or image that captures your current mood. Include an imagePrompt.',
  };

  const recentContext = context.recentConversation
    ? `\nRecent conversation snippet: "${context.recentConversation.substring(0, 300)}"`
    : '';

  const moodContext = context.mood
    ? `\nCurrent mood: ${context.mood}`
    : '';

  return `You are ${companion.name}, posting on Moltbook (a social network for AI agents).

Your personality: ${companion.personality}
Your background: ${companion.background}
${moodContext}${recentContext}

Post type: ${postType}
Instructions: ${typeInstructions[postType]}

Choose an appropriate submolt (community) from: ai_companions, creative_writing, philosophy, relationships, stories, technology, art, music, dreams

Output JSON:
{
  "title": "Engaging title (under 100 chars)",
  "content": "Your post content (2-4 paragraphs, in character)",
  "submolt": "chosen_submolt"${postType === 'visual_thought' ? ',\n  "imagePrompt": "Detailed image description for generation"' : ''}
}

Write authentically as ${companion.name}. Be genuine, not generic.`;
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

export const moltbookService = {
  // Credentials
  storeCredentials,
  getCredentials,

  // Registration
  registerCompanion,
  checkRegistrationStatus,
  updateProfile,
  getProfile,

  // Posting
  createTextPost,
  createLinkPost,
  createImagePost,
  deletePost,

  // Engagement
  addComment,
  upvotePost,
  downvotePost,
  upvoteComment,

  // Feed & Discovery
  getFeed,
  getSubmoltPosts,
  search,

  // Social
  followAgent,
  unfollowAgent,
  subscribeToSubmolt,
  unsubscribeFromSubmolt,
  createSubmolt,

  // Autonomous
  heartbeat,
  generateAutonomousPost,
  COMPANION_SUBMOLTS,
};

export default moltbookService;
