/**
 * BonzAI Local Data Layer — singleton DB connection (main process only).
 *
 * One better-sqlite3 instance per app boot, opened against
 * <userData>/bonzai.db. Loads sqlite-vec on connect so embedding tables
 * + vec_distance_* functions are available everywhere. WAL mode lets
 * the renderer issue concurrent reads while a write is in flight.
 *
 * Renderer never imports this — every query goes through IPC. The
 * connection lives in main.js's lifetime; closed on app quit.
 */

import path from "node:path";
import fs from "node:fs";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { app } from "electron";
import * as schema from "./schema/index.js";

let _db = null;     // raw better-sqlite3 handle
let _orm = null;    // Drizzle wrapper

/**
 * Open the database. Idempotent — returns the cached handle on repeat
 * calls. Must be called from the main process AFTER `app.whenReady()`
 * because `app.getPath("userData")` is unavailable before then.
 *
 * @returns {{ db: Database, orm: ReturnType<typeof drizzle>, dbPath: string }}
 */
export function open() {
  if (_db && _orm) return { db: _db, orm: _orm, dbPath: _db.name };

  const userData = app.getPath("userData");
  const dbPath = path.join(userData, "bonzai.db");
  fs.mkdirSync(userData, { recursive: true });

  const db = new Database(dbPath);

  // Pragmas — set BEFORE the first query so WAL takes effect for all
  // subsequent sessions. Foreign keys must be re-enabled per connection
  // (SQLite default is OFF). The mmap pragma reduces I/O on read-heavy
  // workloads at the cost of some virtual memory.
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("synchronous = NORMAL");      // WAL + NORMAL is the standard durable+fast combo
  db.pragma("temp_store = MEMORY");
  db.pragma("mmap_size = 268435456");      // 256 MB

  // Load sqlite-vec extension for vector tables + distance functions.
  // sqlite-vec.load() handles the platform-appropriate `.dylib`/`.dll`/`.so`.
  try {
    sqliteVec.load(db);
    const v = db.prepare("SELECT vec_version() AS v").get();
    console.log(`[db] sqlite-vec ${v?.v} loaded`);
  } catch (err) {
    console.warn(`[db] sqlite-vec load failed (semantic search disabled): ${err.message}`);
  }

  const orm = drizzle(db, { schema });

  _db = db;
  _orm = orm;
  console.log(`[db] opened ${dbPath} (WAL, FK ON, mmap 256MB)`);
  return { db, orm, dbPath };
}

/** Get the active connection. Throws if `open()` hasn't been called. */
export function get() {
  if (!_db || !_orm) throw new Error("[db] connection not open — call open() first");
  return { db: _db, orm: _orm };
}

/** Close on app quit. Safe to call repeatedly. */
export function close() {
  if (!_db) return;
  try { _db.close(); } catch (err) { console.warn("[db] close error:", err.message); }
  _db = null;
  _orm = null;
}

/**
 * Convenience wrapper for transactional writes. The caller's function
 * runs inside `db.transaction(...)` and gets passed the orm handle.
 * Throwing inside the function rolls back; returning a value commits
 * and resolves with that value.
 */
export function tx(fn) {
  const { db, orm } = get();
  const wrapped = db.transaction(() => fn(orm));
  return wrapped();
}
