/**
 * Companions repo. Mirrors the renderer-side roleplay companion data
 * shapes — both default and custom companions live here. Querying
 * `WHERE is_custom = 1` returns the user's custom roster (Scarlett);
 * `is_default = 1` returns the 13 stock companions.
 */

import { eq, and, desc } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { get } from "../connection.js";
import { companions, companionMemory } from "../schema/companions.js";

export function upsert(record) {
  const { db, orm } = get();
  const id = record.id || uuid();
  const now = Date.now();
  const existing = db.prepare("SELECT id FROM companions WHERE id = ?").get(id);
  const row = {
    id,
    name: record.name,
    firstName: record.firstName ?? null,
    familyName: record.familyName ?? null,
    avatar: record.avatar ?? null,
    archetype: record.archetype ?? null,
    age: Number.isFinite(Number(record.age)) ? Number(record.age) : null,
    gender: record.gender ?? null,
    image: record.image ?? null,
    imagePromptBase: record.imagePromptBase ?? null,
    contentLevelDefault: record.contentLevelDefault ?? null,
    isDefault: record.isDefault ? 1 : 0,
    isCustom: record.isCustom ? 1 : 0,
    description: record.description ?? null,
    shortBio: record.shortBio ?? null,
    personality: typeof record.personality === "string" ? record.personality : (record.personality ? JSON.stringify(record.personality) : null),
    appearance: record.appearance ?? null,
    background: record.background ?? null,
    voiceStyle: record.voiceStyle ?? null,
    voicePersona: record.voicePersona ?? null,
    traits: record.traits ?? null,
    compatibleScenarios: record.compatibleScenarios ?? null,
    big5: record.big5 ?? null,
    spendingHabits: record.spendingHabits ?? null,
    chainId: record.chainId ?? null,
    contractAddress: record.contractAddress ?? null,
    tokenId: record.tokenId ?? null,
    agentWallet: record.agentWallet ?? null,
    createdAt: record.createdAt || now,
    updatedAt: now,
  };
  if (existing) {
    orm.update(companions).set({ ...row, createdAt: undefined }).where(eq(companions.id, id)).run();
  } else {
    orm.insert(companions).values(row).run();
  }
  return row;
}

export function getById(id) {
  const { orm } = get();
  return orm.select().from(companions).where(eq(companions.id, id)).get() ?? null;
}

export function list(filter = {}) {
  const { orm } = get();
  const where = [];
  if (filter.isCustom !== undefined) where.push(eq(companions.isCustom, filter.isCustom ? 1 : 0));
  if (filter.isDefault !== undefined) where.push(eq(companions.isDefault, filter.isDefault ? 1 : 0));
  let q = orm.select().from(companions);
  if (where.length) q = q.where(and(...where));
  return q.orderBy(desc(companions.updatedAt)).all();
}

export function remove(id) {
  const { orm, db } = get();
  db.prepare("DELETE FROM companion_memory WHERE companion_id = ?").run(id);
  orm.delete(companions).where(eq(companions.id, id)).run();
  return true;
}

export function bulkInsert(rows) {
  const { db } = get();
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO companions (
      id, name, first_name, family_name, avatar, archetype, age, gender,
      image, image_prompt_base, content_level_default,
      is_default, is_custom,
      description, short_bio, personality, appearance, background,
      voice_style, voice_persona, traits, compatible_scenarios,
      big5, spending_habits,
      chain_id, contract_address, token_id, agent_wallet,
      created_at, updated_at
    ) VALUES (
      @id, @name, @firstName, @familyName, @avatar, @archetype, @age, @gender,
      @image, @imagePromptBase, @contentLevelDefault,
      @isDefault, @isCustom,
      @description, @shortBio, @personality, @appearance, @background,
      @voiceStyle, @voicePersona, @traits, @compatibleScenarios,
      @big5, @spendingHabits,
      @chainId, @contractAddress, @tokenId, @agentWallet,
      @createdAt, @updatedAt
    )
  `);
  const tx = db.transaction((items) => {
    for (const r of items) stmt.run({
      id: r.id || uuid(),
      name: r.name,
      firstName: r.firstName ?? null,
      familyName: r.familyName ?? null,
      avatar: r.avatar ?? null,
      archetype: r.archetype ?? null,
      age: Number.isFinite(Number(r.age)) ? Number(r.age) : null,
      gender: r.gender ?? null,
      image: r.image ?? null,
      imagePromptBase: r.imagePromptBase ?? null,
      contentLevelDefault: r.contentLevelDefault ?? null,
      isDefault: r.isDefault ? 1 : 0,
      isCustom: r.isCustom ? 1 : 0,
      description: r.description ?? null,
      shortBio: r.shortBio ?? null,
      personality: typeof r.personality === "string" ? r.personality : (r.personality ? JSON.stringify(r.personality) : null),
      appearance: r.appearance ?? null,
      background: r.background ?? null,
      voiceStyle: r.voiceStyle ?? null,
      voicePersona: r.voicePersona ?? null,
      traits: r.traits ? JSON.stringify(r.traits) : null,
      compatibleScenarios: r.compatibleScenarios ? JSON.stringify(r.compatibleScenarios) : null,
      big5: r.big5 ? JSON.stringify(r.big5) : null,
      spendingHabits: r.spendingHabits ? JSON.stringify(r.spendingHabits) : null,
      chainId: r.chainId ?? null,
      contractAddress: r.contractAddress ?? null,
      tokenId: r.tokenId ?? null,
      agentWallet: r.agentWallet ?? null,
      createdAt: r.createdAt || Date.now(),
      updatedAt: r.updatedAt || Date.now(),
    });
  });
  tx(rows);
  return rows.length;
}

// ─── Companion memory ────────────────────────────────────────────────

export function memoryAdd(companionId, mem) {
  const { orm } = get();
  const row = {
    id: uuid(),
    companionId,
    scope: mem.scope || "long_term_user",
    content: mem.content,
    importance: mem.importance ?? 5,
    sessionId: mem.sessionId ?? null,
    createdAt: Date.now(),
    lastRecalledAt: null,
  };
  orm.insert(companionMemory).values(row).run();
  return row;
}

export function memoryList(companionId, scope) {
  const { orm } = get();
  const where = [eq(companionMemory.companionId, companionId)];
  if (scope) where.push(eq(companionMemory.scope, scope));
  return orm.select().from(companionMemory)
    .where(and(...where))
    .orderBy(desc(companionMemory.importance), desc(companionMemory.createdAt))
    .all();
}

export function memoryRecall(companionId, scope, limit = 10) {
  const { db } = get();
  const stmt = db.prepare(`
    UPDATE companion_memory SET last_recalled_at = ?
    WHERE id IN (
      SELECT id FROM companion_memory
      WHERE companion_id = ? AND (? IS NULL OR scope = ?)
      ORDER BY importance DESC, created_at DESC
      LIMIT ?
    )
    RETURNING *
  `);
  return stmt.all(Date.now(), companionId, scope, scope, limit);
}

export function memoryRemove(memoryId) {
  const { orm } = get();
  orm.delete(companionMemory).where(eq(companionMemory.id, memoryId)).run();
}

export function memoryClear(companionId) {
  const { orm } = get();
  orm.delete(companionMemory).where(eq(companionMemory.companionId, companionId)).run();
}

export function memoryBulkInsert(rows) {
  const { db } = get();
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO companion_memory (
      id, companion_id, scope, content, importance, session_id, created_at, last_recalled_at
    ) VALUES (
      @id, @companionId, @scope, @content, @importance, @sessionId, @createdAt, @lastRecalledAt
    )
  `);
  const tx = db.transaction((items) => {
    for (const r of items) stmt.run({
      id: r.id || uuid(),
      companionId: r.companionId,
      scope: r.scope || "long_term_user",
      content: r.content,
      importance: r.importance ?? 5,
      sessionId: r.sessionId ?? null,
      createdAt: r.createdAt || Date.now(),
      lastRecalledAt: r.lastRecalledAt ?? null,
    });
  });
  tx(rows);
  return rows.length;
}
