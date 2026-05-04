/**
 * Social repos — Moltbook posts/engagements + OpenClaw conversations/messages.
 *
 * One file because the two surfaces share patterns (post + react;
 * conversation + message) and the renderer-side consumers (moltbook
 * service, OpenClaw IPC bridge) hit them in similar paginated reads.
 */

import { eq, and, desc } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { get } from "../connection.js";
import {
  moltbookPosts, moltbookEngagements,
  openclawConversations, openclawMessages,
} from "../schema/social.js";

// ─── Moltbook ────────────────────────────────────────────────────────

export function postCreate(post) {
  const { orm } = get();
  const row = {
    id: post.id || uuid(),
    companionId: post.companionId,
    submoltKey: post.submoltKey ?? null,
    title: post.title ?? null,
    body: post.body ?? null,
    imageBlobId: post.imageBlobId ?? null,
    imageExt: post.imageExt ?? null,
    upvotes: post.upvotes ?? 0,
    commentCount: post.commentCount ?? 0,
    publishedAt: post.publishedAt || Date.now(),
    externalUrl: post.externalUrl ?? null,
  };
  orm.insert(moltbookPosts).values(row).run();
  return row;
}

export function postsList(filter = {}) {
  const { orm } = get();
  const where = [];
  if (filter.companionId) where.push(eq(moltbookPosts.companionId, filter.companionId));
  if (filter.submoltKey) where.push(eq(moltbookPosts.submoltKey, filter.submoltKey));
  let q = orm.select().from(moltbookPosts);
  if (where.length) q = q.where(and(...where));
  return q.orderBy(desc(moltbookPosts.publishedAt)).limit(filter.limit ?? 100).all();
}

export function postRecordEngagement(eng) {
  const { db, orm } = get();
  const row = {
    id: eng.id || uuid(),
    companionId: eng.companionId,
    targetPostId: eng.targetPostId,
    kind: eng.kind,
    body: eng.body ?? null,
    createdAt: eng.createdAt || Date.now(),
  };
  const tx = db.transaction(() => {
    orm.insert(moltbookEngagements).values(row).run();
    if (eng.kind === "upvote") db.prepare("UPDATE moltbook_posts SET upvotes = upvotes + 1 WHERE id = ?").run(eng.targetPostId);
    if (eng.kind === "comment") db.prepare("UPDATE moltbook_posts SET comment_count = comment_count + 1 WHERE id = ?").run(eng.targetPostId);
  });
  tx();
  return row;
}

// ─── OpenClaw conversations + messages ─────────────────────────────

export function conversationUpsert(conv) {
  const { db, orm } = get();
  const id = conv.id || uuid();
  const existing = db.prepare("SELECT id FROM openclaw_conversations WHERE id = ?").get(id);
  const row = {
    id,
    channel: conv.channel,
    externalChatId: conv.externalChatId,
    companionId: conv.companionId ?? null,
    customerHandle: conv.customerHandle ?? null,
    startedAt: conv.startedAt || Date.now(),
    lastActiveAt: conv.lastActiveAt || Date.now(),
    archived: conv.archived ? 1 : 0,
  };
  if (existing) orm.update(openclawConversations).set(row).where(eq(openclawConversations.id, id)).run();
  else orm.insert(openclawConversations).values(row).run();
  return row;
}

export function conversationsList(filter = {}) {
  const { orm } = get();
  const where = [];
  if (filter.channel) where.push(eq(openclawConversations.channel, filter.channel));
  if (filter.companionId) where.push(eq(openclawConversations.companionId, filter.companionId));
  if (filter.activeOnly) where.push(eq(openclawConversations.archived, 0));
  let q = orm.select().from(openclawConversations);
  if (where.length) q = q.where(and(...where));
  return q.orderBy(desc(openclawConversations.lastActiveAt)).all();
}

export function findConversation(channel, externalChatId) {
  const { orm } = get();
  return orm.select().from(openclawConversations)
    .where(and(eq(openclawConversations.channel, channel),
               eq(openclawConversations.externalChatId, externalChatId)))
    .get() ?? null;
}

export function appendOpenclawMessage(conversationId, msg) {
  const { db, orm } = get();
  const row = {
    id: msg.id || uuid(),
    conversationId,
    direction: msg.direction,
    role: msg.role,
    text: msg.text ?? null,
    audioBlobId: msg.audioBlobId ?? null,
    audioExt: msg.audioExt ?? null,
    imageBlobId: msg.imageBlobId ?? null,
    imageExt: msg.imageExt ?? null,
    externalMessageId: msg.externalMessageId ?? null,
    meta: msg.meta ?? null,
    createdAt: msg.createdAt || Date.now(),
  };
  const tx = db.transaction(() => {
    orm.insert(openclawMessages).values(row).run();
    orm.update(openclawConversations)
      .set({ lastActiveAt: row.createdAt })
      .where(eq(openclawConversations.id, conversationId)).run();
  });
  tx();
  return row;
}

export function listOpenclawMessages(conversationId, opts = {}) {
  const { db } = get();
  const order = opts.oldestFirst ? "ASC" : "DESC";
  const sql = `SELECT * FROM openclaw_messages WHERE conversation_id = ? ORDER BY created_at ${order} LIMIT ?`;
  const rows = db.prepare(sql).all(conversationId, opts.limit ?? 100);
  return opts.oldestFirst ? rows : rows.reverse();
}
