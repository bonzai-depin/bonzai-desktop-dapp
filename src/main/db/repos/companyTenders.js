import { randomUUID } from "node:crypto";
import { get } from "../connection.js";
import * as issues from "./issues.js";
import * as audit from "./audit.js";
import {
  sanitizeNotice,
  validateResponse,
  prepareTender,
  submissionManifest,
  requestReview as reviewStep,
  approveResponse as approveStep,
  recordDeposit as depositStep,
  recordOutcome as outcomeStep,
  documentBelongsToResponse,
  deadlinePassed,
  TENDER_PIECES,
  TENDER_EVIDENCE,
  TENDER_CLOSED,
} from "../../../services/company/tendersDomain.js";

const db = () => get().db;
const parse = (row) => ({ ...JSON.parse(row.data), id: row.id, kind: row.kind, updatedAt: row.updated_at });

export function assertCompany(companyId) {
  if (!db().prepare("SELECT id FROM companies WHERE id=?").get(companyId))
    throw new Error("Company not found.");
}
function rows(companyId, kind, limit = 2000) {
  return db()
    .prepare("SELECT * FROM company_tenders_records WHERE company_id=? AND kind=? ORDER BY updated_at DESC LIMIT ?")
    .all(companyId, kind, limit)
    .map(parse);
}
export function snapshot(companyId) {
  assertCompany(companyId);
  return {
    notices: rows(companyId, "notice"),
    responses: rows(companyId, "response"),
    documents: rows(companyId, "document"),
    searches: rows(companyId, "search", 20),
  };
}
export function recordById(companyId, kind, id) {
  assertCompany(companyId);
  const row = db().prepare("SELECT * FROM company_tenders_records WHERE company_id=? AND kind=? AND id=?").get(companyId, kind, id);
  if (!row) throw new Error("Record not found in this team.");
  return parse(row);
}
export function persist(companyId, kind, data, id) {
  assertCompany(companyId);
  if (id && !db().prepare("SELECT id FROM company_tenders_records WHERE id=? AND company_id=? AND kind=?").get(id, companyId, kind))
    throw new Error("Record not found in this team.");
  const now = Date.now(), key = id || randomUUID();
  const { id: _id, kind: _kind, updatedAt: _updatedAt, ...value } = data;
  db()
    .prepare("INSERT INTO company_tenders_records(id,company_id,kind,data,created_at,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at")
    .run(key, companyId, kind, JSON.stringify(value), now, now);
  return { ...value, id: key, kind };
}
const journal = (companyId, action, note, extra = {}) =>
  audit.append(companyId, { kind: "action", action, status: "executed", note: String(note).slice(0, 500), ...extra });

/** Keep the trace of a search the user or an approved team action ran: terms only. */
export function recordSearch(companyId, { filters, total, host }) {
  const record = persist(companyId, "search", { filters, total, host, at: Date.now() });
  journal(companyId, "tenders.searchNotices", `${host}: "${filters.keywords}"${filters.departments.length ? ` · ${filters.departments.join(",")}` : ""}${filters.type ? ` · ${filters.type}` : ""} → ${total}`);
  return record;
}

/** Keep one notice from a search on this device. The same notice is never duplicated. */
export function saveNotice(companyId, input = {}) {
  const notice = sanitizeNotice(input.notice || input);
  const existing = db()
    .prepare("SELECT id FROM company_tenders_records WHERE company_id=? AND kind='notice' AND json_extract(data,'$.source')=? AND json_extract(data,'$.sourceId')=?")
    .get(companyId, notice.source, notice.sourceId);
  const previous = existing ? recordById(companyId, "notice", existing.id) : null;
  return persist(companyId, "notice", { ...notice, dismissed: false, savedAt: previous?.savedAt || Date.now() }, existing?.id);
}
export function dismissNotice(companyId, input = {}) {
  const notice = recordById(companyId, "notice", input.id);
  return persist(companyId, "notice", { ...notice, dismissed: true }, notice.id);
}

/** Open a response dossier for a watched notice and queue its drafting for the team. */
export function startResponse(companyId, input = {}) {
  return db().transaction(() => {
    const notice = recordById(companyId, "notice", input.noticeId);
    const existing = rows(companyId, "response").find((r) => r.noticeId === notice.id && !TENDER_CLOSED.includes(r.stage));
    if (existing) return existing;
    if (deadlinePassed(notice)) throw new Error("The response deadline has passed.");
    const value = validateResponse({
      noticeId: notice.id, title: notice.title, buyer: notice.buyer || "Buyer to confirm", deadline: notice.deadline,
      platformUrl: notice.buyerProfileUrl || "", consultationReference: notice.sourceId,
    });
    const response = persist(companyId, "response", value);
    const task = issues.create(companyId, {
      title: `Prepare tender response: ${notice.title.slice(0, 120)}`,
      description: `Response ${response.id}. Notice ${notice.url || notice.sourceId}. Read tenders.snapshot, the consultation documents attached to the response and the company's own documents and memory. Draft each required piece with tenders.draftDocument, list what is missing, then use tenders.requestReview. Drafts are proposals for the owner: never state certifications, references, prices or commitments the company's records do not support. Do not contact the buyer or deposit anything.`,
      assigneeRole: "BidManager",
      labels: ["tenders", `tender:${response.id}`],
      createdBy: "tender-response",
    });
    return persist(companyId, "response", { ...response, preparationTaskId: task.id }, response.id);
  })();
}
export function saveResponse(companyId, input = {}) {
  const previous = input.id ? recordById(companyId, "response", input.id) : null;
  const value = validateResponse(input, previous);
  for (const id of value.documentIds) {
    const document = recordById(companyId, "document", id);
    if (!documentBelongsToResponse(document, { ...value, id: previous?.id }))
      throw new Error("Documents must belong to this team and this response.");
  }
  return persist(companyId, "response", value, previous?.id);
}
function context(companyId, id) {
  const response = recordById(companyId, "response", id);
  return { response, documents: rows(companyId, "document") };
}
export function prepareResponse(companyId, input = {}) {
  const { response, documents } = context(companyId, input.id);
  if (response.stage !== "preparing") return response;
  const preparation = prepareTender(response, documents);
  return persist(companyId, "response", { ...response, preparation, revision: response.revision + 1 }, response.id);
}
export function requestReview(companyId, input = {}) {
  const { response, documents } = context(companyId, input.id);
  return persist(companyId, "response", reviewStep(response, documents, input), response.id);
}
/** What the approval dialog displays, computed here so it cannot drift from what is checked. */
export function approvalPreview(companyId, input = {}) {
  const { response, documents } = context(companyId, input.id);
  return { revision: response.revision, stage: response.stage, manifest: submissionManifest(response, documents), preparation: prepareTender(response, documents) };
}
export function approveResponse(companyId, input = {}) {
  return db().transaction(() => {
    const { response, documents } = context(companyId, input.id);
    const next = persist(companyId, "response", approveStep(response, documents, input), response.id);
    journal(companyId, "tenders.approveResponse", `${next.approval.approvedBy} approved ${next.approval.manifest.documents.length} file(s) for ${next.buyer} (${next.platformUrl})`, { txOrLink: next.platformUrl });
    return next;
  })();
}
export function recordDeposit(companyId, input = {}) {
  return db().transaction(() => {
    const { response, documents } = context(companyId, input.id);
    const next = persist(companyId, "response", depositStep(response, documents, input), response.id);
    journal(companyId, "tenders.recordDeposit", `Deposited with ${next.buyer}; receipt ${next.deposit.reference}, recorded by ${next.deposit.recordedBy}`, { txOrLink: next.platformUrl });
    return next;
  })();
}
export function recordOutcome(companyId, input = {}) {
  const { response, documents } = context(companyId, input.id);
  const next = persist(companyId, "response", outcomeStep(response, documents, input), response.id);
  journal(companyId, "tenders.recordOutcome", `${next.title.slice(0, 160)}: ${next.outcome.result}`);
  return next;
}

/** A person takes responsibility for a piece the team drafted before it can be approved. */
export function reviewDocument(companyId, input = {}) {
  const document = recordById(companyId, "document", input.id);
  if (input.confirmed !== true || !String(input.reviewedBy || "").trim()) throw new Error("Name the person who reviewed this draft.");
  return persist(companyId, "document", { ...document, reviewedBy: String(input.reviewedBy).trim().slice(0, 120), reviewedAt: Date.now() }, document.id);
}
export function documentContext(companyId, input = {}) {
  const pieceType = String(input.pieceType || "").trim();
  if (![...TENDER_PIECES, ...TENDER_EVIDENCE].includes(pieceType)) throw new Error("Choose the type of document.");
  if (!input.responseId) {
    if (!documentBelongsToResponse({ pieceType }, { id: "any" })) throw new Error("Select the response this document belongs to.");
    return { responseId: null, pieceType };
  }
  const response = recordById(companyId, "response", input.responseId);
  if (TENDER_PIECES.includes(pieceType) && ["deposited", "awarded", ...TENDER_CLOSED].includes(response.stage))
    throw new Error("A deposited or closed response is locked.");
  return { responseId: response.id, pieceType };
}
/** Attach a stored document to its response without touching an approval already given to a different package. */
export function linkToResponse(companyId, document) {
  if (!document.responseId || !TENDER_PIECES.includes(document.pieceType)) return document;
  const response = recordById(companyId, "response", document.responseId);
  saveResponse(companyId, { ...response, documentIds: [...new Set([...(response.documentIds || []), document.id])] });
  return document;
}

/** One task a week before a deadline. Nothing is sent or deposited automatically. */
export function runReminders(companyId, now = Date.now()) {
  const created = [];
  for (const response of rows(companyId, "response")) {
    if (!response.deadline || !["preparing", "review", "approved"].includes(response.stage)) continue;
    const due = Date.parse(response.deadline);
    if (due < now || due > now + 7 * 86400000 || response.remindedFor === response.deadline) continue;
    db().transaction(() => {
      created.push(issues.create(companyId, {
        title: `Tender deadline: ${response.title.slice(0, 120)}`,
        description: `Response ${response.id} is "${response.stage}" and closes on ${response.deadline}. List the missing pieces and what the owner must review, approve and deposit.`,
        assigneeRole: "BidManager", labels: ["tenders", `tender:${response.id}`], createdBy: "tender-reminder",
      }));
      persist(companyId, "response", { ...response, remindedFor: response.deadline }, response.id);
    })();
  }
  return created;
}
