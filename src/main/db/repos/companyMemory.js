import { configureMemoryChanges } from './companyMemoryChanges.js';
import { get } from '../connection.js';
import { enqueue, drop } from './embeddings.js';
import { teamMemoryId, businessEvidence } from '../../../shared/teamMemory.js';
import { visibleText } from '../../../shared/visibleText.js';
import { isOperationalTable } from '../../../shared/companyOperations.js';

const parse = value => { try { return JSON.parse(value || '{}'); } catch { return {}; } };
const CORE = ['goals', 'issues', 'generations', 'pending_approvals', 'treasury_entries', 'human_roster', 'connectors', 'company_automation_runs', 'audit_entries', 'published_content'];
const OMIT = new Set(['llm', 'secret_ref', 'payload', 'system_prompt', 'raw_response', 'raw_payload', 'signature_data', 'signature_base64']);

// Operational records are the evidence, not model-written summaries. Refresh
// their searchable projection before recall/load/export, including older work.
// Writes are incremental and main-process transactions prevent renderer races.
export function syncCompanyMemory(companyId) {
  const { db } = get();
  const company = db.prepare('SELECT * FROM companies WHERE id=?').get(companyId);
  if (!company || parse(company.charter).teamMemory?.enabled === false) return;
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(row => row.name);
  configureMemoryChanges(db, ['companies', ...tables.filter(name=>CORE.includes(name)||isOperationalTable(name))]);
  const dirty=db.prepare('SELECT source_table,record_id FROM memory_company_changes WHERE company_id=?').all(companyId);
  const full=!db.prepare('SELECT initialized FROM memory_company_sync WHERE company_id=?').get(companyId)?.initialized || dirty.some(d=>d.source_table==='companies');
  const identity = teamMemoryId(companyId), key = `team:${identity}`, now = Date.now();
  return db.transaction(() => {
    db.prepare(`INSERT INTO memory_instances(instance_key,scope,identity_id,label,metadata_json,created_at,updated_at)
      VALUES(?, 'team', ?, ?, ?, ?, ?) ON CONFLICT(instance_key) DO NOTHING`)
      .run(key, identity, `${company.name} Memory`, JSON.stringify({ companyId, companyName: company.name, identityType: 'team_memory' }), now, now);
    const existing = new Map(db.prepare(`SELECT id,text_content FROM memory_sources WHERE instance_key=? AND source_type='company_record' ${full ? '' : `AND (id IN (SELECT 'company-record:' || company_id || ':' || source_table || ':' || record_id FROM memory_company_changes WHERE company_id=?) OR json_extract(payload_json,'$.sourceTable') IN ('issue_attempts','team_messages','team_conversation_archives'))`}`).all(...(full ? [key] : [key,companyId])).map(row => [row.id, row.text_content]));
    const seen = new Set();
    let changed = 0;
    function record(table, row, extra = {}) {
      const sourceId = `company-record:${companyId}:${table}:${row.id}`;
      seen.add(sourceId);
      const evidence = businessEvidence({ ...row, ...extra }, visibleText);
      const text = `${table} · ${company.name}\n${JSON.stringify(evidence, null, 2)}`;
      if (existing.get(sourceId) === text) return;
      const at = Number(row.updated_at || row.created_at || row.ts || row.requested_at) || now;
      const metadata = { sourceTable: table, recordId: row.id, companyId, sourceId, type: 'company_record', historical: table === 'audit_entries' || table === 'team_conversation_archives' };
      db.prepare(`INSERT INTO memory_sources(id,instance_key,source_type,text_content,payload_json,created_at,updated_at)
        VALUES(?,?,'company_record',?,?,?,?) ON CONFLICT(id) DO UPDATE SET text_content=excluded.text_content,payload_json=excluded.payload_json,updated_at=excluded.updated_at`)
        .run(sourceId, key, text, JSON.stringify(metadata), at, now);
      for (const old of db.prepare('SELECT id FROM memory_notes WHERE instance_key=? AND source_id=?').all(key, sourceId)) {
        drop({ sourceTable: 'memory_notes', sourceId: old.id });
        db.prepare("DELETE FROM embedding_queue WHERE source_table='memory_notes' AND source_id=?").run(old.id);
      }
      db.prepare('DELETE FROM memory_notes WHERE instance_key=? AND source_id=?').run(key, sourceId);
      // Keep long answers/documents searchable without blowing up one prompt.
      for (let offset = 0; offset < text.length; offset += 1800) {
        const noteId = `${sourceId}:${offset / 1800}`, chunk = text.slice(offset, offset + 1800);
        const note = offset ? `${table} · ${company.name} · record ${row.id}\n${chunk}` : chunk;
        db.prepare("INSERT INTO memory_notes(id,instance_key,source_id,note_kind,text_content,confidence,payload_json,created_at) VALUES(?,?,?,'company_record',?,'recorded',?,?)")
          .run(noteId, key, sourceId, note, JSON.stringify(metadata), at);
        enqueue({ sourceTable: 'memory_notes', sourceId: noteId, sourceText: note });
      }
      changed++;
    }
    const charter = parse(company.charter);
    if(full) record('companies', { id: company.id, updated_at: company.updated_at, name: company.name, mission: company.mission,
      status: company.status, roles: charter.roles, businessContext: charter.businessContext, policies: charter.policies,
      purchasingTeamId: charter.purchasingTeamId, purchasingRole: charter.purchasingRole });

    for (const table of tables.filter(name => CORE.includes(name) || isOperationalTable(name))) {
      const ids=dirty.filter(d=>d.source_table===table).map(d=>d.record_id);
      if(!full && !ids.length)continue;
      const columns = db.prepare(`PRAGMA table_info("${table}")`).all().map(column => column.name);
      if (!columns.includes('company_id')) continue;
      // Settings use the company as their primary key. Their approval policy
      // matters to recall just as much as an invoice or work order does.
      if (!columns.includes('id')) {
        if (table === 'purchasing_settings') for (const row of db.prepare('SELECT * FROM purchasing_settings WHERE company_id=?').all(companyId)) record(table, { ...row, id: companyId });
        continue;
      }
      const selected = columns.filter(column => !OMIT.has(column));
      // Binary artifacts stay in blob storage; only text output enters recall.
      const payload = table === 'published_content' ? ",CASE WHEN pipeline IN ('text','vision','skill') AND blob_id IS NULL THEN payload ELSE NULL END AS payload" : '';
      for (const row of db.prepare(`SELECT ${selected.map(column => `"${column}"`).join(',')}${payload} FROM "${table}" WHERE company_id=? ${full ? '' : `AND id IN (SELECT record_id FROM memory_company_changes WHERE company_id=? AND source_table=?)`}`).all(...(full?[companyId]:[companyId,companyId,table]))) {
        // Large imported documents are indexed when their text changes, not
        // again on every lease renewal or spreadsheet-row checkpoint.
        if(table==='company_intake_sources')record(table,{id:row.id,name:row.name,data:row.data,created_at:row.created_at});
        else if(table==='company_intake_mailboxes'){const saved=parse(row.data);record(table,{id:row.id,kind:saved.kind,enabled:saved.enabled,filter:saved.filter});}
        else record(table, row);
      }
    }
    for (const row of db.prepare('SELECT a.* FROM issue_attempts a JOIN issues i ON i.id=a.issue_id WHERE i.company_id=?').all(companyId)) record('issue_attempts', row);
    // A team sees only conversations explicitly shared with it, never its
    // partner's private goals, customer records, memory or tool configuration.
    for (const row of db.prepare(`SELECT m.*,t.subject,t.source_team_name,t.target_team_name FROM team_messages m JOIN team_threads t ON t.id=m.thread_id
      WHERE t.source_company_id=? OR t.target_company_id=?`).all(companyId, companyId)) record('team_messages', row);
    for (const row of db.prepare('SELECT * FROM team_conversation_archives WHERE company_id=?').all(companyId)) record('team_conversation_archives', row);
    // Explicit deletion must not be undone by an old searchable projection.
    for (const sourceId of existing.keys()) if (!seen.has(sourceId)) {
      for (const row of db.prepare('SELECT id FROM memory_notes WHERE instance_key=? AND source_id=?').all(key, sourceId)) {
        drop({ sourceTable: 'memory_notes', sourceId: row.id });
        db.prepare("DELETE FROM embedding_queue WHERE source_table='memory_notes' AND source_id=?").run(row.id);
      }
      db.prepare('DELETE FROM memory_notes WHERE instance_key=? AND source_id=?').run(key, sourceId);
      db.prepare('DELETE FROM memory_sources WHERE instance_key=? AND id=?').run(key, sourceId);
      changed++;
    }
    db.prepare('DELETE FROM memory_company_changes WHERE company_id=?').run(companyId);
    db.prepare('INSERT INTO memory_company_sync(company_id,initialized) VALUES(?,1) ON CONFLICT(company_id) DO UPDATE SET initialized=1').run(companyId);
    if (changed) db.prepare('UPDATE memory_instances SET updated_at=? WHERE instance_key=?').run(now, key);
    return { changed, sources: db.prepare("SELECT COUNT(*) AS count FROM memory_sources WHERE instance_key=? AND source_type='company_record'").get(key).count };
  })();
}

export function syncTeamMemory(scope, identity) {
  if (scope !== 'team') return;
  // Exact match, not prefix matching: neighboring teams may share a name/ID prefix.
  const { db } = get();
  const company = db.prepare('SELECT id FROM companies').all().find(row => teamMemoryId(row.id) === identity);
  if (company) return syncCompanyMemory(company.id);
}
