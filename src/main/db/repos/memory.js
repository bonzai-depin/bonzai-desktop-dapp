import { get } from "../connection.js";
import * as embeddings from "./embeddings.js";

const parse = (value, fallback) => {
  try { return value ? JSON.parse(value) : fallback; } catch { return fallback; }
};
const epoch = (value) => {
  const n = value ? Date.parse(value) : NaN;
  return Number.isFinite(n) ? n : Date.now();
};
const iso = (value) => new Date(Number(value) || Date.now()).toISOString();
const keyOf = (scope, id) => `${scope}:${id}`;

export function exists(scope, id) {
  const { db } = get();
  return !!db.prepare("SELECT 1 FROM memory_instances WHERE instance_key = ?").get(keyOf(scope, id));
}

export function load(scope, id) {
  const { db } = get();
  const instanceKey = keyOf(scope, id);
  const row = db.prepare("SELECT * FROM memory_instances WHERE instance_key = ?").get(instanceKey);
  if (!row) return null;

  const sources = db.prepare("SELECT * FROM memory_sources WHERE instance_key = ? ORDER BY created_at DESC").all(instanceKey)
    .map((r) => ({ ...parse(r.payload_json, {}), sourceId: r.id, type: r.source_type, text: r.text_content, createdAt: iso(r.created_at) }));
  const notes = db.prepare("SELECT * FROM memory_notes WHERE instance_key = ? ORDER BY created_at DESC").all(instanceKey)
    .map((r) => ({ ...parse(r.payload_json, {}), id: r.id, sourceId: r.source_id, kind: r.note_kind, text: r.text_content, confidence: r.confidence, createdAt: iso(r.created_at) }));
  const pageRows = db.prepare("SELECT * FROM memory_pages WHERE instance_key = ?").all(instanceKey);
  const pages = Object.fromEntries(pageRows.map((r) => [r.id, {
    ...parse(r.payload_json, {}), id: r.id, type: r.page_type, title: r.title,
    summary: r.summary, createdAt: iso(r.created_at), updatedAt: iso(r.updated_at),
  }]));
  const links = db.prepare("SELECT from_id, to_id FROM memory_links WHERE instance_key = ? AND link_type = 'backlink'").all(instanceKey);
  const backlinks = {};
  for (const link of links) (backlinks[link.from_id] ||= []).push(link.to_id);
  const reviewQueue = db.prepare("SELECT payload_json FROM memory_review_queue WHERE instance_key = ? ORDER BY position").all(instanceKey)
    .map((r) => parse(r.payload_json, {}));
  const contributionParents = db.prepare("SELECT contribution_id FROM memory_contribution_parents WHERE instance_key = ?").all(instanceKey)
    .map((r) => r.contribution_id);

  return {
    schema: "bonzai-memory-instance", version: 2, scope: row.scope, id: row.identity_id,
    label: row.label, createdAt: iso(row.created_at), updatedAt: iso(row.updated_at),
    architecture: parse(row.architecture_json, {}), metadata: parse(row.metadata_json, {}),
    indexes: parse(row.indexes_json, {}), logs: parse(row.logs_json, []),
    rawSources: sources, atomicNotes: notes, pages, backlinks, reviewQueue, contributionParents,
  };
}

export function save(memory) {
  const { db } = get();
  const instanceKey = keyOf(memory.scope, memory.id);
  const now = Date.now();
  const upsertInstance = db.prepare(`
    INSERT INTO memory_instances (instance_key, scope, identity_id, label, metadata_json, architecture_json, indexes_json, logs_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(instance_key) DO UPDATE SET label=excluded.label, metadata_json=excluded.metadata_json,
      architecture_json=excluded.architecture_json, indexes_json=excluded.indexes_json,
      logs_json=excluded.logs_json, updated_at=excluded.updated_at
  `);
  const insertSource = db.prepare("INSERT INTO memory_sources (id, instance_key, source_type, text_content, payload_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)");
  const insertNote = db.prepare("INSERT INTO memory_notes (id, instance_key, source_id, note_kind, text_content, confidence, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
  const insertPage = db.prepare("INSERT INTO memory_pages (id, instance_key, page_type, title, summary, payload_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
  const insertLink = db.prepare("INSERT OR IGNORE INTO memory_links (instance_key, from_id, to_id, link_type) VALUES (?, ?, ?, 'backlink')");
  const insertReview = db.prepare("INSERT INTO memory_review_queue (instance_key, item_id, payload_json, position) VALUES (?, ?, ?, ?)");
  const insertParent = db.prepare("INSERT OR IGNORE INTO memory_contribution_parents (instance_key, contribution_id) VALUES (?, ?)");

  db.transaction(() => {
    upsertInstance.run(instanceKey, memory.scope, memory.id, memory.label || memory.id,
      JSON.stringify(memory.metadata || {}), JSON.stringify(memory.architecture || {}),
      JSON.stringify(memory.indexes || {}), JSON.stringify(memory.logs || []),
      epoch(memory.createdAt), now);
    for (const table of ["memory_sources", "memory_notes", "memory_pages", "memory_links", "memory_review_queue", "memory_contribution_parents"]) {
      db.prepare(`DELETE FROM ${table} WHERE instance_key = ?`).run(instanceKey);
    }
    for (const source of memory.rawSources || []) {
      insertSource.run(source.sourceId, instanceKey, source.type || "event", source.text || source.summary || "", JSON.stringify(source), epoch(source.createdAt), now);
    }
    for (const note of memory.atomicNotes || []) {
      insertNote.run(note.id, instanceKey, note.sourceId || null, note.kind || "observation", note.text || "", note.confidence || null, JSON.stringify(note), epoch(note.createdAt));
    }
    for (const page of Object.values(memory.pages || {})) {
      insertPage.run(page.id, instanceKey, page.type || "page", page.title || page.id, page.summary || "", JSON.stringify(page), epoch(page.createdAt), epoch(page.updatedAt));
    }
    for (const [fromId, targets] of Object.entries(memory.backlinks || {})) {
      for (const toId of targets || []) insertLink.run(instanceKey, fromId, toId);
    }
    (memory.reviewQueue || []).forEach((item, i) => insertReview.run(instanceKey, item.id || `review-${i}`, JSON.stringify(item), i));
    for (const parent of memory.contributionParents || []) insertParent.run(instanceKey, parent);
  })();

  for (const note of memory.atomicNotes || []) {
    embeddings.enqueue({ sourceTable: "memory_notes", sourceId: note.id, sourceText: note.text || "" });
  }
  return load(memory.scope, memory.id);
}

export function recall(scope, id, query, limit = 12, semanticIds = []) {
  const { db } = get();
  const instanceKey = keyOf(scope, id);
  const terms = String(query || "").toLowerCase().split(/\W+/).filter((x) => x.length > 2);
  const rows = db.prepare("SELECT id, source_id, note_kind, text_content, confidence, created_at FROM memory_notes WHERE instance_key = ? ORDER BY created_at DESC LIMIT 500").all(instanceKey);
  const semanticRank = new Map(semanticIds.map((value, index) => [value, semanticIds.length - index]));
  return rows.map((row) => {
    const text = row.text_content.toLowerCase();
    const lexical = terms.reduce((score, term) => score + (text.includes(term) ? 2 : 0), 0);
    const semantic = semanticRank.get(row.id) || 0;
    return { id: row.id, sourceId: row.source_id, kind: row.note_kind, text: row.text_content, confidence: row.confidence, createdAt: iso(row.created_at), score: lexical + semantic };
  }).filter((row) => row.score > 0 || !terms.length).sort((a, b) => b.score - a.score || Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, limit);
}

