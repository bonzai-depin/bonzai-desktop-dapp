/** Durable worker receipts share the application's SQLite backup boundary. */
export function createWorkerJournal(getDatabase, legacyStore) {
  let initialized = false;
  function db() {
    const database = getDatabase();
    if (!initialized) {
      database.exec(`CREATE TABLE IF NOT EXISTS agent_worker_runs (
        id TEXT PRIMARY KEY, paid_id TEXT UNIQUE, created_at INTEGER NOT NULL, record TEXT NOT NULL
      )`);
      database.transaction(() => {
        const insert = database.prepare('INSERT OR IGNORE INTO agent_worker_runs (id,paid_id,created_at,record) VALUES (?,?,?,?)');
        for (const [id, record] of Object.entries(legacyStore.get('smartAgentWorkerRuns', {}))) insert.run(id, record.paidId || null, record.createdAt || 0, JSON.stringify(record));
      })();
      // Delete only after the transaction succeeds. A restart can safely repeat migration.
      legacyStore.delete?.('smartAgentWorkerRuns');
      initialized = true;
    }
    return database;
  }
  return {
    get(id) { const row = db().prepare('SELECT record FROM agent_worker_runs WHERE id=?').get(id); return row ? JSON.parse(row.record) : null; },
    list(limit = 100) { return db().prepare('SELECT record FROM agent_worker_runs ORDER BY created_at DESC LIMIT ?').all(limit).map(row => JSON.parse(row.record)); },
    all() { return Object.fromEntries(db().prepare('SELECT id,record FROM agent_worker_runs').all().map(row => [row.id, JSON.parse(row.record)])); },
    hasPaid(paidId) { return Boolean(db().prepare('SELECT 1 FROM agent_worker_runs WHERE paid_id=?').get(paidId)); },
    set(id, record) { db().prepare('INSERT INTO agent_worker_runs (id,paid_id,created_at,record) VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET record=excluded.record').run(id, record.paidId || null, record.createdAt, JSON.stringify(record)); },
  };
}
