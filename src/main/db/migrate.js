/**
 * Migration runner. Applies hand-rolled .sql files in
 * `src/main/db/migrations/` to the open DB in lexicographic order,
 * tracking applied migrations in a `_migrations` meta table.
 *
 * Why hand-rolled instead of drizzle-kit's runtime migrator: the kit's
 * migrator is great at dev-time, but at app-runtime in Electron we
 * want zero process spawning + bundled deterministic SQL files. The
 * `npm run db:generate` workflow still uses drizzle-kit to AUTHOR the
 * .sql files; we just APPLY them with this runner.
 *
 * Conventions:
 *   - Files named `NNNN_description.sql`, NNNN is a 4-digit zero-padded sequence
 *   - Each file is a single transaction (the runner wraps the whole file)
 *   - `_migrations` table records (id, hash, applied_at) per file
 *   - On app start: scan dir, run any unapplied files in order
 *   - Failures abort the boot — better to surface a corrupt schema than
 *     run on partial state
 */

import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { get } from "./connection.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, "migrations");

/** Open meta table that tracks applied migrations. */
function _ensureMetaTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id TEXT PRIMARY KEY,
      hash TEXT NOT NULL,
      applied_at INTEGER NOT NULL
    );
  `);
}

/**
 * Run any unapplied migrations from `migrations/`. Idempotent — already-
 * applied files are skipped. Throws if a file's hash differs from what
 * was recorded the first time it ran (catches accidental mutation of
 * migration files after they've shipped).
 */
export function runMigrations() {
  const { db } = get();
  _ensureMetaTable(db);

  // Scan directory
  let files = [];
  try {
    files = fs.readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith(".sql"))
      .sort();
  } catch (err) {
    console.log(`[db] no migrations dir at ${MIGRATIONS_DIR} — skipping`);
    return { applied: [], skipped: [] };
  }

  const stmt = db.prepare("SELECT hash FROM _migrations WHERE id = ?");
  const insert = db.prepare("INSERT INTO _migrations (id, hash, applied_at) VALUES (?, ?, ?)");
  const applied = [], skipped = [];

  for (const file of files) {
    const filePath = path.join(MIGRATIONS_DIR, file);
    const sql = fs.readFileSync(filePath, "utf8");
    const hash = crypto.createHash("sha256").update(sql).digest("hex");
    const existing = stmt.get(file);

    if (existing) {
      if (existing.hash !== hash) {
        throw new Error(
          `[db] migration ${file} has changed since it was applied (hash mismatch). ` +
          `Migrations are immutable once shipped — write a new migration to alter the schema.`,
        );
      }
      skipped.push(file);
      continue;
    }

    // Apply inside a transaction so partial failures roll back.
    const tx = db.transaction(() => {
      db.exec(sql);
      insert.run(file, hash, Date.now());
    });
    try {
      tx();
      applied.push(file);
      console.log(`[db] applied migration ${file}`);
    } catch (err) {
      console.error(`[db] migration ${file} failed:`, err.message);
      throw err;
    }
  }

  return { applied, skipped };
}
