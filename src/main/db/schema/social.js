/**
 * Drizzle schema — Moltbook social posts + OpenClaw multichannel chat.
 *
 * Moltbook = the AI-native social network. Companions auto-register +
 * post autonomously. Each post + engagement (upvote/comment) gets a
 * row here so the heartbeat scheduler can avoid duplicate posts and
 * the leaderboard can query without re-fetching from the network.
 *
 * OpenClaw = multichannel inbound (WhatsApp/Telegram/Discord/Mattermost).
 * Conversations + messages persisted so a companion answering a
 * customer at 11pm has full context next morning even after a restart.
 * Replaces the in-memory state that died on every renderer reload.
 */

import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

// ─── Moltbook ────────────────────────────────────────────────────────

export const moltbookPosts = sqliteTable(
  "moltbook_posts",
  {
    id: text("id").primaryKey(),
    companionId: text("companion_id").notNull(),
    submoltKey: text("submolt_key"),                   // r/<channel> equivalent
    title: text("title"),
    body: text("body"),
    imageBlobId: text("image_blob_id"),
    imageExt: text("image_ext"),
    upvotes: integer("upvotes").default(0),
    commentCount: integer("comment_count").default(0),
    publishedAt: integer("published_at").notNull(),
    externalUrl: text("external_url"),
  },
  (t) => ({
    byCompanion: index("idx_molt_companion").on(t.companionId, t.publishedAt),
    bySubmolt: index("idx_molt_submolt").on(t.submoltKey, t.publishedAt),
  }),
);

export const moltbookEngagements = sqliteTable(
  "moltbook_engagements",
  {
    id: text("id").primaryKey(),
    companionId: text("companion_id").notNull(),       // who engaged
    targetPostId: text("target_post_id").notNull(),
    kind: text("kind").notNull(),                       // upvote | downvote | comment
    body: text("body"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => ({
    byCompanion: index("idx_engage_companion").on(t.companionId),
    byTarget: index("idx_engage_target").on(t.targetPostId),
  }),
);

// ─── OpenClaw multichannel ──────────────────────────────────────────

export const openclawConversations = sqliteTable(
  "openclaw_conversations",
  {
    id: text("id").primaryKey(),
    channel: text("channel").notNull(),                 // whatsapp | telegram | discord | mattermost | sms
    externalChatId: text("external_chat_id").notNull(),
    companionId: text("companion_id"),
    customerHandle: text("customer_handle"),
    startedAt: integer("started_at").notNull(),
    lastActiveAt: integer("last_active_at"),
    archived: integer("archived", { mode: "boolean" }).default(0),
  },
  (t) => ({
    byChannel: index("idx_oc_channel").on(t.channel, t.lastActiveAt),
    byExternal: index("idx_oc_external").on(t.channel, t.externalChatId),
    byCompanion: index("idx_oc_companion").on(t.companionId),
  }),
);

export const openclawMessages = sqliteTable(
  "openclaw_messages",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id").notNull(),
    direction: text("direction").notNull(),             // inbound | outbound
    role: text("role").notNull(),                       // customer | companion | system
    text: text("text"),
    audioBlobId: text("audio_blob_id"),
    audioExt: text("audio_ext"),
    imageBlobId: text("image_blob_id"),
    imageExt: text("image_ext"),
    externalMessageId: text("external_message_id"),
    meta: text("meta", { mode: "json" }),
    createdAt: integer("created_at").notNull(),
  },
  (t) => ({
    byConversation: index("idx_ocm_conv").on(t.conversationId, t.createdAt),
    byDirection: index("idx_ocm_dir").on(t.conversationId, t.direction),
  }),
);
