import { randomUUID, createHash } from "node:crypto";
import { get } from "../connection.js";
import * as audit from "./audit.js";
import {
  sanitizeIntakeAction,
  groundedIntakeAction,
} from "../../../shared/companyIntake.js";
import { tableIntakeActions } from "../../../shared/intakeTables.js";
import {
  applyIntakeRecord,
  intakeContext,
  intakeRecord,
} from "./intakeRecords.js";
const db = () => get().db;
const hash = (v) => createHash("sha256").update(v).digest("hex");
const transaction =
  (fn) =>
  (...args) =>
    db().transaction(() => fn(...args))();
function company(id, active = false) {
  const c = db().prepare("SELECT charter FROM companies WHERE id=?").get(id);
  if (!c) throw new Error("Team not found.");
  const value = JSON.parse(c.charter);
  if (active && value.status !== "active") throw new Error("Team is paused.");
  return value;
}
function read(id, key) {
  company(id);
  const r = db()
    .prepare("SELECT * FROM company_intake_sources WHERE company_id=? AND id=?")
    .get(id, key);
  if (!r) throw new Error("Source not found in this team.");
  return { ...r, data: JSON.parse(r.data) };
}
const actionRow = (r) => ({
  ...r,
  data: JSON.parse(r.data),
  result: r.result ? JSON.parse(r.result) : null,
});
function actions(id, key) {
  return db()
    .prepare(
      "SELECT * FROM company_intake_actions WHERE company_id=? AND source_id=? ORDER BY ordinal",
    )
    .all(id, key)
    .map(actionRow);
}
function event(id, source, status, note, extra = {}) {
  audit.append(id, {
    kind: "intake",
    action: "intake.process",
    status,
    note,
    sourceId: source,
    ...extra,
  });
}
export function snapshot(id, { limit = 50, offset = 0, query = "" } = {}) {
  company(id);
  const take = Math.max(1, Math.min(Number(limit) || 50, 500)),
    skip = Math.max(0, Number(offset) || 0),
    search = String(query).slice(0, 250);
  return {
    sources: db()
      .prepare(
        "SELECT id,name,status,cursor,error,created_at AS createdAt,updated_at AS updatedAt FROM company_intake_sources WHERE company_id=? AND instr(lower(name),lower(?))>0 ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?",
      )
      .all(id, search, take, skip),
    total: db()
      .prepare(
        "SELECT count(*) n FROM company_intake_sources WHERE company_id=? AND instr(lower(name),lower(?))>0",
      )
      .get(id, search).n,
    counts: db()
      .prepare(
        "SELECT status,count(*) AS count FROM company_intake_sources WHERE company_id=? GROUP BY status",
      )
      .all(id),
    mailboxes: db()
      .prepare("SELECT * FROM company_intake_mailboxes WHERE company_id=?")
      .all(id)
      .map((r) => ({ id: r.id, ...JSON.parse(r.data) })),
  };
}
export function readSource(id, { id: key }) {
  const r = read(id, key);
  return {
    id: r.id,
    name: r.name,
    status: r.status,
    cursor: r.cursor,
    error: r.error,
    chunkCount: r.data.chunks.length,
    metadata: r.data.metadata || {},
    blobId: r.data.blobId,
    ext: r.data.ext,
    text: r.data.chunks.join("\n\n"),
    actions: actions(id, key),
    untrusted: true,
  };
}
export function readRecord(id, { actionId, recordId }) {
  company(id);
  const row = db()
    .prepare(
      "SELECT result FROM company_intake_actions WHERE company_id=? AND id=?",
    )
    .get(id, actionId);
  const receipt = JSON.parse(row?.result || "[]").find(
    (r) => r.id === recordId,
  );
  if (!receipt) throw new Error("Record is not linked to this import.");
  return intakeRecord(id, receipt);
}
function analysisText(id, data, cursor) {
  const chunk = data.chunks[cursor];
  if (!data.metadata?.parentId) return chunk;
  const parent = read(id, data.metadata.parentId);
  return `Related email (untrusted business evidence):\n${parent.data.chunks.join("\n").slice(0, 6000)}\n\nAttachment:\n${chunk}`;
}
export const ingest = transaction((id, input = {}) => {
  company(id);
  if (input.parentId) read(id, input.parentId); // Only the owning team's saved email can supply context.
  const chunks = input.chunks;
  if (
    !Array.isArray(chunks) ||
    !chunks.length ||
    chunks.length > 2000 ||
    chunks.some((c) => typeof c !== "string" || c.length > 18000) ||
    chunks.join("").length > 8000000
  )
    throw new Error(
      "Source must contain bounded text chunks (maximum 8 million characters).",
    );
  const name = String(input.name || "")
    .trim()
    .slice(0, 250);
  if (!name) throw new Error("Source name is required.");
  // Byte hash when available; text hash deduplicates pasted/re-delivered messages.
  const fingerprint = hash(
    input.blobId ||
      JSON.stringify([input.connectorId || "", input.messageId || "", chunks]),
  );
  const old = db()
    .prepare(
      "SELECT id FROM company_intake_sources WHERE company_id=? AND fingerprint=?",
    )
    .get(id, fingerprint);
  if (old) return { ...readSource(id, old), duplicate: true };
  if (
    input.blobId &&
    !db().prepare("SELECT id FROM blobs WHERE id=?").get(input.blobId)
  )
    throw new Error("Source file must be saved first.");
  const key = randomUUID(),
    now = Date.now();
  const metadata = {
    channel: input.channel === "email" ? "email" : "file",
    sender: String(input.sender || "").slice(0, 300),
    messageId: String(input.messageId || "").slice(0, 300),
    connectorId: input.connectorId || null,
    parentId: input.parentId || null,
    attachmentNames: (Array.isArray(input.attachmentNames)
      ? input.attachmentNames
      : []
    )
      .slice(0, 40)
      .map((n) => String(n).slice(0, 250)),
  };
  db()
    .prepare(
      "INSERT INTO company_intake_sources(id,company_id,fingerprint,name,data,status,created_at,updated_at,error) VALUES(?,?,?,?,?,?,?,?,?)",
    )
    .run(
      key,
      id,
      fingerprint,
      name,
      JSON.stringify({
        chunks,
        extracted: input.needsExtraction !== true,
        blobId: input.blobId || null,
        ext: input.ext || null,
        metadata,
      }),
      input.error ? "review" : "queued",
      now,
      now,
      input.error || null,
    );
  event(id, key, "queued", name);
  return readSource(id, { id: key });
});
export const claim = transaction((id) => {
  company(id, true);
  const now = Date.now();
  const row = db()
    .prepare(
      "SELECT * FROM company_intake_sources WHERE company_id=? AND ((status='queued' AND next_at<=?) OR (status='processing' AND lease_until<?)) ORDER BY created_at LIMIT 1",
    )
    .get(id, now, now);
  if (!row) return null;
  if (row.attempts >= 3) {
    db()
      .prepare(
        "UPDATE company_intake_sources SET status='review',error='Analysis interrupted repeatedly. Retry when the local model is available.' WHERE id=?",
      )
      .run(row.id);
    return null;
  }
  const lease = randomUUID(),
    data = JSON.parse(row.data);
  db()
    .prepare(
      "UPDATE company_intake_sources SET status='processing',lease=?,lease_until=?,attempts=attempts+1,updated_at=? WHERE id=?",
    )
    .run(lease, now + 12 * 60000, now, row.id);
  return {
    id: row.id,
    name: row.name,
    lease,
    cursor: row.cursor,
    extracted: data.extracted !== false,
    blobId: data.blobId,
    ext: data.ext,
    chunk: analysisText(id, data, row.cursor),
    tableChunk: data.chunks[row.cursor],
    metadata: data.metadata,
    context: intakeContext(id, analysisText(id, data, row.cursor)),
  };
});
function assertLease(id, input, active = true) {
  const s = read(id, input.id);
  if (
    s.status !== "processing" ||
    s.lease !== input.lease ||
    s.lease_until <= Date.now()
  )
    throw new Error(
      "Intake lease expired. The current worker owns this source.",
    );
  company(id, active);
  return s;
}
export const renew = transaction((id, input) => {
  const s = assertLease(id, input);
  db()
    .prepare("UPDATE company_intake_sources SET lease_until=? WHERE id=?")
    .run(Date.now() + 12 * 60000, s.id);
  return { ok: true };
});
export const extracted = transaction((id, input) => {
  const s = assertLease(id, input);
  if (s.data.extracted !== false || s.cursor !== 0)
    throw new Error("Source text is already saved.");
  if (
    !Array.isArray(input.chunks) ||
    !input.chunks.length ||
    input.chunks.length > 2000 ||
    input.chunks.some((c) => typeof c !== "string" || c.length > 18000) ||
    input.chunks.join("").length > 8000000
  )
    throw new Error("Extracted text exceeds intake limits. Split the file.");
  db()
    .prepare(
      "UPDATE company_intake_sources SET data=?,status='queued',lease=NULL,lease_until=NULL,attempts=0,next_at=0,error=NULL,updated_at=? WHERE id=?",
    )
    .run(
      JSON.stringify({ ...s.data, chunks: input.chunks, extracted: true }),
      Date.now(),
      s.id,
    );
  return { ok: true };
});
function apply(id, a, s, reviewed = false) {
  try {
    const result = db().transaction(() =>
      applyIntakeRecord(id, a.data, { id: s.id, actionId: a.id }, reviewed),
    )();
    db()
      .prepare(
        "UPDATE company_intake_actions SET status='applied',result=?,error=NULL,revision=revision+1 WHERE id=?",
      )
      .run(JSON.stringify(result), a.id);
    event(id, s.id, "applied", s.name, {
      intakeActionId: a.id,
      recordType: a.data.type,
      records: result,
    });
  } catch (e) {
    db()
      .prepare(
        "UPDATE company_intake_actions SET status='review',error=?,revision=revision+1 WHERE id=?",
      )
      .run(String(e.message).slice(0, 1000), a.id);
  }
}
function summarize(id, s) {
  const current = read(id, s.id);
  if (current.cursor < current.data.chunks.length) return;
  const pending = actions(id, s.id).some((a) => a.status === "review");
  db()
    .prepare(
      "UPDATE company_intake_sources SET status=?,updated_at=? WHERE id=?",
    )
    .run(pending ? "review" : "completed", Date.now(), s.id);
}
export const finish = transaction((id, input) => {
  const s = assertLease(id, input);
  if (s.data.extracted === false)
    throw new Error("Read the file before analysis.");
  if (!Array.isArray(input.actions) || input.actions.length > 80)
    throw new Error("Expected at most 80 extracted records per chunk.");
  const text = analysisText(id, s.data, s.cursor),
    base = s.cursor * 100;
  // Main process recomputes recognized tables: model output cannot omit rows or change facts.
  const mapped = tableIntakeActions(s.data.chunks[s.cursor]);
  const order = [
    "client",
    "site",
    "equipment",
    "work_order",
    "proforma",
    "invoice",
    "grant",
    "sales",
    "task",
  ];
  (mapped || input.actions)
    .map(sanitizeIntakeAction)
    .sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type))
    .forEach((raw, index) => {
      const data = sanitizeIntakeAction(raw),
        key = randomUUID();
      const supported =
        data.evidence.trim().length >= 8 && text.includes(data.evidence);
      const error = !supported
        ? "Extracted evidence does not match the source."
        : mapped
          ? null
          : groundedIntakeAction(data, text);
      db()
        .prepare(
          "INSERT INTO company_intake_actions(id,company_id,source_id,ordinal,data,error,created_at) VALUES(?,?,?,?,?,?,?)",
        )
        .run(
          key,
          id,
          s.id,
          base + index,
          JSON.stringify(data),
          error,
          Date.now(),
        );
      if (!error && data.confidence >= 0.9) apply(id, { id: key, data }, s);
    });
  db()
    .prepare(
      "UPDATE company_intake_sources SET cursor=cursor+1,status='queued',lease=NULL,lease_until=NULL,attempts=0,error=NULL,next_at=0,updated_at=? WHERE id=?",
    )
    .run(Date.now(), s.id);
  summarize(id, s);
  return readSource(id, { id: s.id });
});
export const fail = transaction((id, input) => {
  const s = assertLease(id, input, false);
  db()
    .prepare(
      "UPDATE company_intake_sources SET status=?,error=?,lease=NULL,lease_until=NULL,next_at=?,updated_at=? WHERE id=?",
    )
    .run(
      s.attempts >= 3 ? "review" : "queued",
      String(input.error || "Analysis failed.").slice(0, 1000),
      Date.now() + Math.min(s.attempts * 60000, 5 * 60000),
      Date.now(),
      s.id,
    );
  event(id, s.id, "retry", s.name);
  return { status: "retry" };
});
export const retry = transaction((id, { id: key }) => {
  const s = read(id, key);
  if (s.status === "processing") throw new Error("Analysis is running.");
  if (s.cursor >= s.data.chunks.length)
    throw new Error("Analysis is complete; review the remaining records.");
  db()
    .prepare(
      "UPDATE company_intake_sources SET status='queued',attempts=0,next_at=0,error=NULL WHERE id=?",
    )
    .run(key);
  return { ok: true };
});
export const review = transaction((id, input) => {
  company(id);
  const row = db()
    .prepare("SELECT * FROM company_intake_actions WHERE company_id=? AND id=?")
    .get(id, input.actionId);
  if (!row) throw new Error("Intake action not found.");
  const a = actionRow(row),
    s = read(id, a.source_id);
  if (a.status !== "review") return readSource(id, { id: s.id });
  if (input.revision !== a.revision)
    throw new Error("This record changed. Refresh before reviewing.");
  if (input.decision === "dismiss")
    db()
      .prepare(
        "UPDATE company_intake_actions SET status='dismissed',revision=revision+1 WHERE id=?",
      )
      .run(a.id);
  else {
    if (input.confirmed !== true)
      throw new Error("Confirm the extracted fields.");
    const data = sanitizeIntakeAction({
      ...a.data,
      data: input.data || a.data.data,
    });
    db()
      .prepare("UPDATE company_intake_actions SET data=? WHERE id=?")
      .run(JSON.stringify(data), a.id);
    apply(id, { ...a, data }, s, true);
  }
  summarize(id, s);
  event(
    id,
    s.id,
    input.decision === "dismiss" ? "dismissed" : "reviewed",
    s.name,
    { intakeActionId: a.id },
  );
  return readSource(id, { id: s.id });
});
export const saveMailbox = transaction((id, input) => {
  company(id);
  const conn = db()
    .prepare(
      "SELECT id,kind FROM connectors WHERE id=? AND company_id=? AND status='active'",
    )
    .get(input.connectorId, id);
  if (!conn || !["gmail", "outlook_mail"].includes(conn.kind))
    throw new Error("Connect an active Gmail or Outlook mailbox first.");
  const old = db()
      .prepare(
        "SELECT * FROM company_intake_mailboxes WHERE id=? AND company_id=?",
      )
      .get(conn.id, id),
    previous = old ? JSON.parse(old.data) : {};
  const data = {
    ...previous,
    revision: randomUUID(),
    connectorId: conn.id,
    kind: conn.kind,
    enabled: input.enabled === true,
    filter: String(input.filter || "").slice(0, 500),
    since: previous.since || Date.now(),
    cursor: previous.cursor || null,
  };
  if (data.filter !== previous.filter) {
    data.cursor = null;
    data.since = Date.now();
  }
  db()
    .prepare(
      "INSERT INTO company_intake_mailboxes VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at",
    )
    .run(conn.id, id, JSON.stringify(data), Date.now());
  event(id, null, data.enabled ? "enabled" : "paused", "Mailbox intake", {
    connectorId: conn.id,
  });
  return data;
});
export const mailboxCheckpoint = transaction((id, input) => {
  company(id);
  const r = db()
    .prepare(
      "SELECT * FROM company_intake_mailboxes WHERE id=? AND company_id=?",
    )
    .get(input.connectorId, id);
  if (!r) throw new Error("Mailbox not found.");
  const old = JSON.parse(r.data);
  if (!old.enabled || input.revision !== old.revision) return old;
  const data = {
    ...old,
    ...(input.error
      ? {
          error: String(input.error).slice(0, 500),
          retryAt: Date.now() + 120000,
        }
      : {
          cursor: input.cursor || null,
          since: input.since || old.since,
          lastSync: Date.now(),
          retryAt: null,
          error: null,
        }),
  };
  db()
    .prepare(
      "UPDATE company_intake_mailboxes SET data=?,updated_at=? WHERE id=? AND company_id=?",
    )
    .run(JSON.stringify(data), Date.now(), r.id, id);
  return data;
});
