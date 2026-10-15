import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '../../../src/main/db/schema/index.js';
import fs from 'node:fs';
import path from 'node:path';
import * as sqliteVec from 'sqlite-vec';
const db = new Database(':memory:');
db.pragma('foreign_keys = ON');
sqliteVec.load(db);
for (const name of fs.readdirSync(path.resolve('src/main/db/migrations')).filter(name => name.endsWith('.sql')).sort()) db.exec(fs.readFileSync(path.resolve('src/main/db/migrations', name), 'utf8'));
const orm = drizzle(db, { schema });
export function get() { return { db, orm }; }
