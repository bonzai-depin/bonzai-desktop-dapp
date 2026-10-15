import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { get } from '../connection.js';
import * as blobStore from '../blobs.js';
import { syncCompanyMemory } from './companyMemory.js';
import { teamMemoryId } from '../../../shared/teamMemory.js';
import { isOperationalTable } from '../../../shared/companyOperations.js';
import { validateOperationalBackup, detachRestoredPurchasing } from './operationalBackup.js';

const CORE = ['team_conversation_archives', 'goals', 'issues', 'issue_attempts', 'treasury_state', 'treasury_entries', 'pending_approvals', 'published_content', 'connectors', 'human_roster', 'audit_entries', 'company_automation_state', 'company_automation_runs'];
const MEMORY = ['memory_instances', 'memory_sources', 'memory_notes', 'memory_pages', 'memory_links', 'memory_review_queue', 'memory_contribution_parents'];
const sensitive = /^(secret_ref|secretRef|apiKey|api_key|accessToken|refreshToken|access_token|refresh_token|privateKey|private_key|mnemonic|password|credentials)$/i;
function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([key]) => !sensitive.test(key)).map(([key, item]) => [key, redact(item)]));
  return value;
}
function tables(db) {
  const existing = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY rowid").all().map(row => row.name);
  return [...CORE.filter(name => existing.includes(name)), ...existing.filter(isOperationalTable), ...MEMORY.filter(name => existing.includes(name))];
}
const columns = (db, table) => db.prepare(`PRAGMA table_info("${table}")`).all().map(column => column.name);
const parse = value => { try { return JSON.parse(value); } catch { return value; } };
function structured(row, transform) {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => {
    if (sensitive.test(key)) return [key, null];
    const json = typeof value === 'string' && /^[\[{]/.test(value.trim()) ? parse(value) : value;
    const changed = transform(json);
    return [key, json !== value ? JSON.stringify(changed) : changed];
  }));
}

export function exportBundle(companyId, options = {}) {
  const { db } = get();
  syncCompanyMemory(companyId);
  return db.transaction(() => {
    const company = db.prepare('SELECT * FROM companies WHERE id = ?').get(companyId);
    if (!company) throw new Error('Company not found.');
    const bundle = { schemaVersion: 2, exportedAt: Date.now(), charter: redact(JSON.parse(company.charter)), tables: {}, blobs: {}, warnings: [] };
    for (const table of tables(db)) {
      let rows;
      if (table === 'issue_attempts') rows = db.prepare('SELECT a.* FROM issue_attempts a JOIN issues i ON i.id = a.issue_id WHERE i.company_id = ?').all(companyId);
      else if (table === 'memory_instances') rows = db.prepare("SELECT * FROM memory_instances WHERE (scope = 'company' AND identity_id = ?) OR (scope = 'team' AND json_extract(metadata_json, '$.companyId') = ?)").all(companyId, companyId);
      else if (MEMORY.includes(table)) rows = db.prepare(`SELECT m.* FROM "${table}" m JOIN memory_instances i ON i.instance_key = m.instance_key WHERE (i.scope = 'company' AND i.identity_id = ?) OR (i.scope = 'team' AND json_extract(i.metadata_json, '$.companyId') = ?)`).all(companyId, companyId);
      else if (columns(db, table).includes('company_id')) rows = db.prepare(`SELECT * FROM "${table}" WHERE company_id = ?`).all(companyId);
      else continue;
      bundle.tables[table] = rows.map(row => structured(row, redact));
    }
    // Preserve an immutable readable copy, never restore live routes into another team.
    const conversations=db.prepare('SELECT * FROM team_threads WHERE source_company_id=? OR target_company_id=?').all(companyId,companyId);
    bundle.tables.team_conversation_archives ||= [];
    for(const thread of conversations){const messages=db.prepare('SELECT * FROM team_messages WHERE thread_id=? ORDER BY created_at,rowid').all(thread.id);bundle.tables.team_conversation_archives.push({id:crypto.randomUUID(),company_id:companyId,snapshot:JSON.stringify({thread,messages}),created_at:Date.now()});}
    const refs = new Set();
    function collect(value) {
      if (!value || typeof value !== 'object') return;
      for (const [key, item] of Object.entries(value)) {
        if ((key === 'blob_id' || key === 'blobId') && typeof item === 'string') refs.add(item);
        collect(typeof item === 'string' ? parse(item) : item);
      }
    }
    collect(bundle.tables);
    for (const id of refs) {
      if (!/^[a-f0-9]{64}$/.test(id)) throw new Error('Invalid attachment reference.');
      const blob = db.prepare('SELECT ext FROM blobs WHERE id = ?').get(id);
      if (!blob || !/^[a-zA-Z0-9]+$/.test(blob.ext)) { bundle.warnings.push(`Attachment unavailable: ${id}`); continue; }
      if (options.includePayloads === false) { bundle.warnings.push(`Attachment omitted: ${id}`); continue; }
      try { bundle.blobs[id] = { ext: blob.ext, data: blobStore.read(id, blob.ext).toString('base64') }; }
      catch { bundle.warnings.push(`Attachment unavailable: ${id}`); }
    }
    // Older generated media may still refer to a temporary file. Package the
    // bytes, never assume the same path exists on the receiving machine.
    for (const row of bundle.tables.published_content || []) {
      const meta = parse(row.meta) || {};
      if (meta.payloadEncoding !== 'path') continue;
      if (options.includePayloads !== false && row.payload && fs.existsSync(row.payload) && fs.statSync(row.payload).isFile()) {
        const bytes = fs.readFileSync(row.payload), id = crypto.createHash('sha256').update(bytes).digest('hex');
        const ext = path.extname(row.payload).slice(1).replace(/[^a-zA-Z0-9]/g, '') || 'bin';
        bundle.blobs[id] = { ext, data: bytes.toString('base64') };
        row.blob_id = id; row.blob_ext = ext; row.payload = null;
        delete meta.localPath; meta.payloadEncoding = 'blob'; row.meta = JSON.stringify(meta);
      } else { bundle.warnings.push(`Media file unavailable: ${row.id}`); row.payload = null; row.meta = JSON.stringify({ ...meta, localPath: null, payloadUnavailable: true }); }
    }
    return bundle;
  })();
}

export function importBundle(bundle, options = {}) {
  const { db } = get();
  if (bundle?.schemaVersion !== 2 || !bundle.charter?.id || !bundle.charter?.name || !bundle.tables || typeof bundle.tables !== 'object') throw new Error('Unsupported or invalid company backup.');
  const allowed = new Set(tables(db));
  for (const [table, rows] of Object.entries(bundle.tables)) {
    if (!allowed.has(table) || !Array.isArray(rows)) throw new Error(`Invalid backup table: ${table}`);
    const known = new Set(columns(db, table));
    for (const row of rows) {
      if (!row || typeof row !== 'object' || Object.keys(row).some(key => !known.has(key))) throw new Error(`Invalid record in ${table}`);
      if (known.has('company_id') && row.company_id !== bundle.charter.id) throw new Error('Backup contains records from another company.');
    }
  }
  const oldId = bundle.charter.id, id = options.keepId ? oldId : crypto.randomUUID();
  validateOperationalBackup(bundle.tables);
  // Restored links may only target this snapshot, never an existing company’s
  // records. Global content-addressed blobs and provenance retain their identity.
  for (const [table, rows] of Object.entries(bundle.tables)) {
    const keys = db.prepare(`PRAGMA foreign_key_list("${table}")`).all();
    for (const key of keys) {
      if (key.table === 'companies' || !allowed.has(key.table)) continue;
      const targets = new Set((bundle.tables[key.table] || []).map(row => row[key.to]));
      for (const row of rows) if (row[key.from] != null && !targets.has(row[key.from])) throw new Error(`Backup contains a missing or cross-company reference: ${table}.${key.from}`);
    }
  }
  // Historical migrations include logical links without SQLite foreign keys.
  const logicalLinks={gmao_quotes:{procurement_id:'gmao_procurements'},gmao_work_orders:{source_document_id:'gmao_document_intake',issue_id:'issues'},gmao_document_intake:{matched_work_order_id:'gmao_work_orders'},gmao_procurements:{proforma_document_id:'gmao_documents'}};
  for(const [table,links] of Object.entries(logicalLinks))for(const row of bundle.tables[table]||[])for(const [field,target] of Object.entries(links))if(row[field] && !(bundle.tables[target]||[]).some(r=>r.id===row[field]))throw new Error(`Backup contains a missing or cross-company reference: ${table}.${field}`);
  for(const table of ['gmao_quotes','gmao_invoices','gmao_procurements','gmao_outbox'])for(const row of bundle.tables[table]||[])for(const [field,target] of Object.entries({procurement_id:'gmao_procurements',quote_id:'gmao_quotes',document_id:'gmao_documents',proforma_document_id:'gmao_documents',attachment_sheet_id:'gmao_attachment_sheets'}))if(row[field]){const related=(bundle.tables[target]||[]).find(r=>r.id===row[field]);if(related?.work_order_id&&related.work_order_id!==row.work_order_id)throw new Error(`Backup mixes intervention records: ${table}.${field}`);}
  if (db.prepare('SELECT id FROM companies WHERE id = ?').get(id)) throw new Error('This company already exists. Restore a separate copy to preserve current work.');
  const ids = new Map([[oldId, id]]);
  for (const [table, rows] of Object.entries(bundle.tables)) {
    if (!MEMORY.includes(table)) for (const row of rows) if (row.id) ids.set(row.id, crypto.randomUUID());
  }
  const memoryKeys = new Set((bundle.tables.memory_instances || []).map(row => row.instance_key));
  for (const row of bundle.tables.memory_instances || []) {
    const metadata = parse(row.metadata_json) || {};
    const legacy = row.scope === 'company' && row.identity_id === oldId;
    const team = row.scope === 'team' && metadata.companyId === oldId && row.identity_id === teamMemoryId(oldId, metadata.roleKey);
    if ((!legacy && !team) || row.instance_key !== `${row.scope}:${row.identity_id}`) throw new Error('Backup contains memory outside this company.');
    const identity = team ? teamMemoryId(id, metadata.roleKey) : id;
    ids.set(row.identity_id, identity);
    ids.set(row.instance_key, `${row.scope}:${identity}`);
  }
  for (const table of MEMORY.slice(1)) for (const row of bundle.tables[table] || []) if (!memoryKeys.has(row.instance_key)) throw new Error('Unscoped memory record.');
  const issueIds = new Set((bundle.tables.issues || []).map(row => row.id));
  for (const row of bundle.tables.issue_attempts || []) if (!issueIds.has(row.issue_id)) throw new Error('Task attempt has no parent task.');
  for (const [table, rows] of Object.entries(bundle.tables)) if (table === 'memory_sources' || table === 'memory_notes') for (const row of rows) ids.set(row.id, crypto.randomUUID());
  function remap(value) {
    if (Array.isArray(value)) return value.map(remap);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(redact(value)).map(([key, item]) => [ids.get(key) || key, remap(item)]));
    return typeof value === 'string' ? ids.get(value) || value : value;
  }
  const charter = { ...remap(bundle.charter), id, name: `${bundle.charter.name} (restored)`, status: 'paused', updatedAt: Date.now() };
  // A restored copy must not send new work to the original team's partner.
  delete charter.purchasingTeamId;
  delete charter.purchasingRole;
  const attachments = Object.entries(bundle.blobs || {}).map(([hash, blob]) => {
    if (!/^[a-f0-9]{64}$/.test(hash) || !/^[a-zA-Z0-9]+$/.test(blob.ext || '') || typeof blob.data !== 'string') throw new Error('Invalid attachment.');
    const bytes = Buffer.from(blob.data, 'base64');
    if (crypto.createHash('sha256').update(bytes).digest('hex') !== hash) throw new Error('Attachment checksum mismatch.');
    return { hash, ext: blob.ext, bytes };
  });
  return db.transaction(() => {
    db.pragma('defer_foreign_keys = ON');
    db.prepare('INSERT INTO companies (id, name, mode, status, mission, template_id, demo_mode, charter, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, charter.name, charter.mode || 'solo', 'paused', charter.mission || null, charter.template?.id || null, charter.demoMode ? 1 : 0, JSON.stringify(charter), charter.createdAt || Date.now(), Date.now());
    for (const table of tables(db)) {
      for (const original of bundle.tables[table] || []) {
        const row = structured(original, remap);
        if (table === 'company_sales_records') { const saved=parse(row.data); if(saved.handoff){saved.archivedHandoff=saved.handoff;delete saved.handoff;} row.data=JSON.stringify(saved); }
        if (table === 'purchasing_records' && row.kind === 'request') row.data = JSON.stringify(detachRestoredPurchasing(parse(row.data)));
        if (table === 'gmao_record_activity') {
          const data=parse(row.data);
          if(row.kind==='reminder')data.enabled=false;
          if(row.kind==='message'&&data.status==='submitting')data.status='unknown';
          // Restored drafts require a fresh record snapshot and approval.
          if(row.kind==='message'&&['draft','failed'].includes(data.status))data.recordVersion=null;
          row.data=JSON.stringify(data);
        }
        if (table === 'gmao_outbox') { if (['draft','failed'].includes(row.status)) { row.approved_revision=null; row.approved_at=null; } if(row.status==='submitting') { row.status='unknown'; row.error='Restored pending delivery: verify provider before retrying.'; row.approved_revision=null; } }
        if (table === 'company_intake_sources') { row.lease=null; row.lease_until=null; if(row.status==='processing')row.status='queued'; row.attempts=0; }
        if (table === 'company_intake_mailboxes') { const data=parse(row.data);data.enabled=false;data.cursor=null;row.data=JSON.stringify(data); }
        if (table === 'issues' && row.created_by==='document-intake') {
          const references=value=>String(value||'').replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,key=>ids.get(key)||key);
          row.description=references(row.description);
          row.labels=JSON.stringify((parse(row.labels)||[]).map(references));
        }
        if (table === 'connectors') { row.secret_ref = null; row.status = 'needs_auth'; row.last_validated_at = null; row.error = 'Reconnect after restore.'; }
        if (table === 'company_automation_state') { row.scheduler_status = 'paused'; row.active_lane = null; row.lease_owner = null; row.lease_expires_at = null; }
        if (table === 'company_automation_runs' && row.status === 'running') { row.status = 'interrupted'; row.finished_at = Date.now(); }
        if (table === 'issue_attempts' && row.status === 'running') { row.status = 'interrupted'; row.finished_at = Date.now(); }
        if (table === 'pending_approvals' && row.status === 'pending') { row.status = 'expired'; row.reject_reason = 'Review task inputs and request fresh approval after restore.'; }
        if (table === 'issues') {
          const execution = parse(row.execution);
          if (execution?.steps) {
            if (execution.agent && !['done', 'cancelled'].includes(row.status)) {
              execution.harnessHistory = [...(execution.harnessHistory || []), ...(execution.harness ? [execution.harness] : [])];
              delete execution.harness; delete execution.agent.instructions;
              execution.agent.events = [...(execution.agent.events || []), { type: 'restored', at: Date.now(), text: 'Restored receipts are historical evidence. Team conversations are archived; confirm current destinations before making a new request.', previousWait: execution.agent.wait }];
              delete execution.agent.wait;
              execution.agent.status = 'blocked';
              execution.pauseReason = 'Review restored work and reconnect its tools before continuing.';
              row.status = 'blocked'; row.last_error = execution.pauseReason;
            }
            for (const step of execution.steps) {
              if (['running', 'waiting_approval'].includes(step.status)) {
                step.status = 'unknown'; step.error = 'Restored task needs owner review. Prior authorizations do not transfer.';
              }
            }
            row.execution = JSON.stringify(execution);
          }
          if (row.status === 'in_progress' || execution?.steps?.some(step => step.status === 'unknown')) { row.status = 'blocked'; row.last_error = 'Review restored work before continuing.'; }
          row.execution_revision = (row.execution_revision || 0) + 1;
        }
        const keys = Object.keys(row);
        db.prepare(`INSERT INTO "${table}" (${keys.map(key => `"${key}"`).join(',')}) VALUES (${keys.map(() => '?').join(',')})`).run(...keys.map(key => row[key] ?? null));
      }
    }
    // DB references commit only when every attachment was validated and saved.
    for (const attachment of attachments) blobStore.write(attachment.bytes, attachment.ext, { source: 'company-restore', sourceId: id });
    return charter;
  })();
}
