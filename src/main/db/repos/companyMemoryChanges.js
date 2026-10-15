// SQLite captures changes from every writer, including background execution.
const configured = new WeakSet();
export function configureMemoryChanges(db, tables) {
  if (configured.has(db)) return;
  db.exec(`CREATE TABLE IF NOT EXISTS memory_company_sync(company_id TEXT PRIMARY KEY, initialized INTEGER NOT NULL DEFAULT 0);
 CREATE TABLE IF NOT EXISTS memory_company_changes(company_id TEXT NOT NULL, source_table TEXT NOT NULL, record_id TEXT NOT NULL, PRIMARY KEY(company_id,source_table,record_id));`);
  for (const table of tables) {
    const columns = db
      .prepare(`PRAGMA table_info("${table}")`)
      .all()
      .map((c) => c.name);
    if (!columns.includes("company_id") && table !== "companies") continue;
    if (!columns.includes("id") && table !== "purchasing_settings") continue;
    const id = columns.includes("id") ? "id" : "company_id",
      company = table === "companies" ? "id" : "company_id";
    for (const [operation, row] of [
      ["INSERT", "NEW"],
      ["UPDATE", "NEW"],
      ["DELETE", "OLD"],
    ])
      db.exec(
        `CREATE TRIGGER IF NOT EXISTS "memory_track_${table}_${operation}" AFTER ${operation} ON "${table}" BEGIN INSERT INTO memory_company_changes(company_id,source_table,record_id) VALUES(${row}."${company}",'${table}',${row}."${id}") ON CONFLICT(company_id,source_table,record_id) DO NOTHING; END;`,
      );
  }
  configured.add(db);
}
