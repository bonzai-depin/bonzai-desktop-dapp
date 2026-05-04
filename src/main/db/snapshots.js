/**
 * Rolling launch-time DB snapshots.
 *
 * On every app boot, before any writes, we copy the live DB to a
 * timestamped backup file and rotate the previous N snapshots. If a
 * future migration corrupts the DB, the user can fall back to the most
 * recent good snapshot. Cheap insurance — VACUUM INTO is fast and
 * incremental on WAL.
 *
 * Backups live next to bonzai.db:
 *   bonzai.db.bak.0   most recent
 *   bonzai.db.bak.1   one boot older
 *   bonzai.db.bak.2   two boots older
 *
 * 3 slots × ~hundreds of MB = bounded disk cost. Older snapshots roll
 * off as new boots happen.
 */

import path from "node:path";
import fs from "node:fs";
import { get } from "./connection.js";

const SNAPSHOT_SLOTS = 3;

/**
 * Take a snapshot, rotating older ones first.
 *
 *   .bak.2 → deleted
 *   .bak.1 → .bak.2
 *   .bak.0 → .bak.1
 *   bonzai.db → .bak.0
 */
export function takeBootSnapshot() {
  const { db } = get();
  const dbPath = db.name;
  if (!dbPath || dbPath === ":memory:") return;

  // Rotate
  for (let i = SNAPSHOT_SLOTS - 1; i >= 0; i--) {
    const src = `${dbPath}.bak.${i}`;
    const dst = `${dbPath}.bak.${i + 1}`;
    if (i === SNAPSHOT_SLOTS - 1 && fs.existsSync(src)) {
      // Drop oldest
      try { fs.unlinkSync(src); } catch {}
      continue;
    }
    if (fs.existsSync(src)) {
      try { fs.renameSync(src, dst); } catch (err) {
        console.warn(`[snapshot] rotate ${src}→${dst} failed:`, err.message);
      }
    }
  }

  // Take fresh snapshot via VACUUM INTO — atomic, defragmented copy.
  // Works even with active WAL writers.
  const target = `${dbPath}.bak.0`;
  try {
    // VACUUM INTO requires the target file NOT to exist.
    if (fs.existsSync(target)) fs.unlinkSync(target);
    db.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`);
    const size = fs.statSync(target).size;
    console.log(`[snapshot] wrote ${path.basename(target)} (${(size / 1024 / 1024).toFixed(1)} MB)`);
  } catch (err) {
    console.warn(`[snapshot] VACUUM INTO failed:`, err.message);
  }
}

/**
 * List available snapshots with sizes + ages, for a future Settings UI.
 */
export function listSnapshots() {
  const { db } = get();
  const dbPath = db.name;
  const out = [];
  for (let i = 0; i < SNAPSHOT_SLOTS; i++) {
    const p = `${dbPath}.bak.${i}`;
    if (!fs.existsSync(p)) continue;
    const stat = fs.statSync(p);
    out.push({
      slot: i,
      path: p,
      sizeBytes: stat.size,
      mtime: stat.mtimeMs,
      ageMs: Date.now() - stat.mtimeMs,
    });
  }
  return out;
}

/**
 * Restore from a snapshot slot. Closes the active connection, replaces
 * the live file, and asks the caller to re-open. Destructive — make
 * the user confirm before calling.
 */
export function restoreSnapshot(slot) {
  const { db } = get();
  const dbPath = db.name;
  const src = `${dbPath}.bak.${slot}`;
  if (!fs.existsSync(src)) throw new Error(`snapshot slot ${slot} not found`);
  // Caller is responsible for closing the connection BEFORE this and
  // re-opening AFTER.
  fs.copyFileSync(src, dbPath);
  return { ok: true, restoredFrom: src };
}
